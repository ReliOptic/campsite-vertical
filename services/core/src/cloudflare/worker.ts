/**
 * Cloudflare Worker entry: Core API + Vista gateway + cron sweep + per-account WorkspaceRuntime Durable Object.
 * Deployment is NOT verified in this repository (no account/credentials in the build environment); the domain,
 * state machine and HTTP layer are the same code the Node host runs under test.
 */
import type { CoreConfig, CoreSecrets } from '../ports';
import { systemClock } from '../ports';
import { D1Db, R2Store, type D1Database, type R2Bucket } from '../adapters/cloudflare';
import { Identity } from '../domain/identity';
import { ModelConnections, openRouterKeyVerifier } from '../domain/model';
import { Artifacts } from '../domain/artifacts';
import { Runs } from '../domain/runs';
import { Channels } from '../domain/channels';
import { Gateway } from '../domain/gateway';
import { Feed } from '../domain/feed';
import { Social } from '../domain/social';
import { VistaStates } from '../domain/state';
import { Asker } from '../domain/ask';
import { RunExecutor } from '../execution/executor';
import { OpenRouterProvider, StubProvider, type ModelProvider } from '../execution/provider';
import type { Validator } from '../execution/validator';
import { WorkspaceRuntime, sweepDueWorkspaces } from '../runtime/workspace-runtime';
import type { RuntimeHost } from '../runtime/local-host';
import { GoogleOidc } from '../http/google-oidc';
import { createApp } from '../http/app';
import { browserRenderingValidator, type PuppeteerLike } from './browser-rendering-validator';
import * as c from '@campsite/contracts';

export interface DurableObjectStub { fetch(input: string | Request, init?: RequestInit): Promise<Response> }
export interface DurableObjectNamespace { idFromName(name: string): unknown; get(id: unknown): DurableObjectStub }
export interface DurableObjectState { storage: { setAlarm(at: number | Date): Promise<void>; getAlarm(): Promise<number | null>; deleteAlarm(): Promise<void> }; blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> }
export interface ExecutionContext { waitUntil(p: Promise<unknown>): void }

export interface Env {
  DB: D1Database; ARTIFACTS: R2Bucket; WORKSPACE_RUNTIME: DurableObjectNamespace; BROWSER?: unknown;
  APP_ORIGIN: string; VISTA_ORIGIN: string; AUTH_DEV_ACCOUNTS?: string; MODEL_PROVIDER?: 'openrouter' | 'stub'; OPENROUTER_BASE_URL?: string;
  SESSION_SECRET: string; VISTA_SIGNING_SECRET: string; MODEL_KEY_SECRET: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; RUNNER_NODE_TOKENS?: string;
}

/** Resolved lazily so the Worker bundle does not require @cloudflare/puppeteer at module evaluation time. */
let puppeteerModule: Promise<PuppeteerLike> | null = null;
function loadPuppeteer(): Promise<PuppeteerLike> {
  if (!puppeteerModule) puppeteerModule = import('@cloudflare/puppeteer').then(m => (m.default ?? m) as unknown as PuppeteerLike);
  return puppeteerModule;
}

function config(env: Env): CoreConfig {
  return { appOrigin: env.APP_ORIGIN, vistaOrigin: env.VISTA_ORIGIN, cookieSecure: true, devAccounts: env.AUTH_DEV_ACCOUNTS === '1', openRouterBaseUrl: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1', leaseSeconds: 90, capabilityTtlSeconds: 600, executionMode: 'platform',
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${env.APP_ORIGIN}/auth/google/callback` } } : {}) };
}
function secrets(env: Env): CoreSecrets { return { sessionSecret: env.SESSION_SECRET, vistaSigningSecret: env.VISTA_SIGNING_SECRET, modelKeySecret: env.MODEL_KEY_SECRET }; }

function domain(env: Env) {
  const cfg = config(env); const sec = secrets(env); const clock = systemClock;
  const db = new D1Db(env.DB); const store = new R2Store(env.ARTIFACTS);
  const provider: ModelProvider = env.MODEL_PROVIDER === 'stub' ? new StubProvider() : new OpenRouterProvider(cfg.openRouterBaseUrl);
  const identity = new Identity(db, clock, sec);
  const models = new ModelConnections(db, clock, sec, cfg, provider.name === 'stub' ? async () => true : openRouterKeyVerifier(cfg.openRouterBaseUrl));
  const artifacts = new Artifacts(db, store, clock);
  const runs = new Runs(db, clock, cfg, artifacts);
  const channels = new Channels(db, clock, runs, models);
  const gateway = new Gateway(db, clock, sec, cfg);
  const feed = new Feed(db, clock, gateway);
  const social = new Social(db, clock, identity, runs, channels, artifacts, feed);
  const states = new VistaStates(db, clock);
  const asker = new Asker(db, feed, models, provider);
  const validator: Validator = { validate: async (html, opts) => browserRenderingValidator(await loadPuppeteer(), env.BROWSER).validate(html, opts) };
  const executor = new RunExecutor({ runs, models, provider, validator, clock, log: e => console.log(JSON.stringify(e)) });
  return { cfg, sec, clock, db, store, identity, models, artifacts, runs, channels, gateway, feed, social, states, asker, executor, provider };
}

class CloudflareRuntimeHost implements RuntimeHost {
  constructor(private readonly env: Env, private readonly ctx: ExecutionContext, private readonly d: ReturnType<typeof domain>) {}
  private stub(runtimeId: string) { return this.env.WORKSPACE_RUNTIME.get(this.env.WORKSPACE_RUNTIME.idFromName(runtimeId)); }
  wake(workspaceId: string, runtimeId: string) { this.ctx.waitUntil(this.stub(runtimeId).fetch('https://runtime/wake', { method: 'POST', body: JSON.stringify({ workspaceId }) })); }
  async status(workspaceId: string, runtimeId: string) { return c.RuntimeResponse.parse(await (await this.stub(runtimeId).fetch(`https://runtime/status?workspaceId=${encodeURIComponent(workspaceId)}`)).json()); }
  async sweep() {
    const { expired, workspaceIds } = await sweepDueWorkspaces(this.d.db, this.d.runs, this.d.clock);
    for (const ws of workspaceIds) { const row = await this.d.db.first<{ runtime_id: string }>('SELECT runtime_id FROM workspaces WHERE id = ?', [ws]); if (row) this.wake(ws, row.runtime_id); }
    return { expired, woken: workspaceIds.length };
  }
}

/** One Durable Object per account: owns the schedule (alarm) and executes that account's runs. */
export class WorkspaceRuntimeDO {
  private runtime: WorkspaceRuntime | null = null;
  private workspaceId: string | null = null;
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}
  private get(workspaceId: string) {
    if (!this.runtime || this.workspaceId !== workspaceId) {
      const d = domain(this.env);
      const runtimeId = `rt_${workspaceId}`;
      this.runtime = new WorkspaceRuntime({ db: d.db, clock: d.clock, runs: d.runs, executor: d.executor, workspaceId, runtimeId, log: e => console.log(JSON.stringify(e)) });
      this.workspaceId = workspaceId;
    }
    return this.runtime;
  }
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/wake' && req.method === 'POST') {
      const { workspaceId } = await req.json() as { workspaceId: string };
      const result = await this.get(workspaceId).wake();
      await this.arm(result.nextWakeAt);
      return Response.json({ enqueued: result.enqueued, executed: result.executed.length, nextWakeAt: result.nextWakeAt });
    }
    if (url.pathname === '/status') return Response.json(await this.get(url.searchParams.get('workspaceId') ?? '').status());
    return new Response('not found', { status: 404 });
  }
  async alarm(): Promise<void> {
    if (!this.workspaceId) return; // identity is re-established by the next wake from the sweep
    const result = await this.get(this.workspaceId).wake();
    await this.arm(result.nextWakeAt);
  }
  private async arm(at: string | null) { if (at) await this.state.storage.setAlarm(new Date(at)); else await this.state.storage.deleteAlarm(); }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const d = domain(env);
    const nodeTokens = env.RUNNER_NODE_TOKENS ? new Map(env.RUNNER_NODE_TOKENS.split(',').map(s => s.split(':') as [string, string])) : undefined;
    const app = createApp({ config: d.cfg, db: d.db, store: d.store, identity: d.identity, models: d.models, channels: d.channels, runs: d.runs, feed: d.feed, social: d.social, states: d.states, gateway: d.gateway, asker: d.asker, runtime: new CloudflareRuntimeHost(env, ctx, d), google: d.cfg.google ? new GoogleOidc(d.db, d.clock, d.cfg.google) : undefined, nodeTokens });
    const url = new URL(req.url);
    // Origin discipline: the gateway answers only on the Vista origin, the API only on the app origin.
    const isVista = url.origin === env.VISTA_ORIGIN;
    if (isVista && !url.pathname.startsWith('/v/')) return new Response('not found', { status: 404 });
    if (!isVista && url.pathname.startsWith('/v/')) return new Response('not found', { status: 404 });
    return app.fetch(req);
  },
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    const d = domain(env);
    const host = new CloudflareRuntimeHost(env, ctx, d);
    const r = await host.sweep();
    console.log(JSON.stringify({ sweep: r }));
    ctx.waitUntil(d.artifacts.gcStaging(24 * 3600_000));
  },
};
