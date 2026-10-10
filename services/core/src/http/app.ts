import * as c from '@campsite/contracts';
import type { CoreConfig, Db, ObjectStore } from '../ports';
import type { Identity } from '../domain/identity';
import type { ModelConnections } from '../domain/model';
import type { Channels } from '../domain/channels';
import { RunnerError, type Runs } from '../domain/runs';
import type { Feed } from '../domain/feed';
import type { Social } from '../domain/social';
import type { VistaStates } from '../domain/state';
import type { Gateway } from '../domain/gateway';
import type { Asker } from '../domain/ask';
import type { RuntimeHost } from '../runtime/local-host';
import type { Principal } from '../domain/types';
import { ApiError, sha256Hex } from '../domain/util';
import type { GoogleOidc } from './google-oidc';
import { Router, json, empty } from './router';

export interface AppDeps {
  config: CoreConfig; db: Db; store: ObjectStore; identity: Identity; models: ModelConnections; channels: Channels; runs: Runs; feed: Feed; social: Social; states: VistaStates;
  gateway: Gateway; asker: Asker; runtime: RuntimeHost; google?: GoogleOidc; nodeTokens?: Map<string, string>; // nodeId → token (external runner nodes)
}
export interface Ctx { principal?: Principal; sessionToken?: string }
const COOKIE = 'campsite_session';

export function createApp(d: AppDeps) {
  const r = new Router<Ctx>();
  const cookieAttrs = `Path=/; HttpOnly; SameSite=Lax${d.config.cookieSecure ? '; Secure' : ''}`;
  const setSession = (token: string) => `${COOKIE}=${token}; ${cookieAttrs}; Max-Age=${30 * 86400}`;
  const clearSession = () => `${COOKIE}=; ${cookieAttrs}; Max-Age=0`;
  const readCookie = (req: Request) => req.headers.get('cookie')?.split(/;\s*/).map(kv => kv.split('=')).find(([k]) => k === COOKIE)?.[1] ?? null;

  const auth = async (req: Request, ctx: Ctx): Promise<Principal> => {
    if (ctx.principal) return ctx.principal;
    const token = readCookie(req);
    const p = await d.identity.resolveSession(token);
    if (!p) throw new ApiError('UNAUTHENTICATED', 401);
    ctx.principal = p; ctx.sessionToken = token ?? undefined;
    return p;
  };
  const sameOrigin = (req: Request) => {
    const origin = req.headers.get('origin'); const site = req.headers.get('sec-fetch-site');
    if (origin) return origin === d.config.appOrigin;
    return site === null || site === 'same-origin' || site === 'none';
  };
  const mutation = async (req: Request, ctx: Ctx) => { if (!sameOrigin(req)) throw new ApiError('INVALID_REQUEST', 403, 'cross-origin'); return auth(req, ctx); };
  const body = async (req: Request) => { try { return await req.json(); } catch { throw new ApiError('INVALID_REQUEST', 400, 'invalid json'); } };
  const login = async (ext: Parameters<Identity['loginWithIdentity']>[0]) => d.identity.loginWithIdentity(ext);
  const wake = (p: Principal) => { if (d.config.executionMode !== 'external') d.runtime.wake(p.workspaceId, p.runtimeId); };

  // ---- auth ---------------------------------------------------------------
  r.get('/auth/google/start', async () => {
    if (!d.google) return json({ error: { code: 'INVALID_REQUEST' } }, 404);
    return new Response(null, { status: 302, headers: { Location: await d.google.start() } });
  });
  r.get('/auth/google/callback', async (req) => {
    if (!d.google) return json({ error: { code: 'INVALID_REQUEST' } }, 404);
    const u = new URL(req.url);
    const parsed = c.OAuthCallback.safeParse({ code: u.searchParams.get('code'), state: u.searchParams.get('state') });
    if (!parsed.success) throw new ApiError('INVALID_REQUEST', 400);
    const ext = await d.google.callback(parsed.data.code, parsed.data.state);
    const { sessionToken } = await login(ext);
    return new Response(null, { status: 302, headers: { Location: `${d.config.appOrigin}/`, 'Set-Cookie': setSession(sessionToken) } });
  });
  r.post('/auth/dev/login', async (req) => {
    if (!d.config.devAccounts) return json({ error: { code: 'NOT_FOUND' } }, 404);
    if (!sameOrigin(req)) throw new ApiError('INVALID_REQUEST', 403);
    const parsed = c.DevLogin.safeParse(await body(req));
    if (!parsed.success) throw new ApiError('INVALID_REQUEST', 400);
    const { sessionToken, principal } = await login({ provider: 'dev', subject: parsed.data.email, email: parsed.data.email, name: parsed.data.name, avatarUrl: null });
    return json(await d.identity.me(principal), 200, { 'Set-Cookie': setSession(sessionToken) });
  });
  r.post('/auth/logout', async (req, _p, ctx) => {
    if (!sameOrigin(req)) throw new ApiError('INVALID_REQUEST', 403);
    const token = readCookie(req);
    if (token) await d.identity.logout(token);
    void ctx;
    return empty(204, { 'Set-Cookie': clearSession() });
  });

  // ---- me / model / runtime -------------------------------------------------
  r.get('/api/me', async (req, _p, ctx) => json(await d.identity.me(await auth(req, ctx))));
  r.get('/api/runtime', async (req, _p, ctx) => { const p = await auth(req, ctx); return json(await d.runtime.status(p.workspaceId, p.runtimeId)); });
  r.get('/api/model', async (req, _p, ctx) => json(await d.models.get(await auth(req, ctx))));
  r.post('/api/model', async (req, _p, ctx) => { const p = await mutation(req, ctx); return json(await d.models.connect(p, await body(req))); });
  r.delete('/api/model', async (req, _p, ctx) => { const p = await mutation(req, ctx); return json(await d.models.disconnect(p)); });

  // ---- channels / runs ------------------------------------------------------
  r.get('/api/channels', async (req, _p, ctx) => {
    const p = await auth(req, ctx);
    const list = await d.channels.list(p);
    const posters = await d.feed.latestPosterForChannels(p, list.items.map(ch => ch.id));
    return json({ items: list.items.map(ch => ({ ...ch, latestPosterUrl: posters.get(ch.id) ?? null })) });
  });
  r.post('/api/channels', async (req, _p, ctx) => {
    const p = await mutation(req, ctx);
    const res = await d.channels.create(p, await body(req), req.headers.get('idempotency-key'));
    wake(p);
    return json(res, 201);
  });
  r.patch('/api/channels/:id', async (req, params, ctx) => { const p = await mutation(req, ctx); return json(await d.channels.update(p, params.id, await body(req))); });
  r.post('/api/runs', async (req, _p, ctx) => {
    const p = await mutation(req, ctx);
    const res = await d.runs.createManual(p, await body(req));
    wake(p);
    return json(res, 202);
  });
  r.get('/api/runs/:id', async (req, params, ctx) => json(await d.runs.get(await auth(req, ctx), params.id)));
  r.post('/api/runs/:id/cancel', async (req, params, ctx) => json(await d.runs.cancel(await mutation(req, ctx), params.id)));

  // ---- feed / vistas / social / state / ask ---------------------------------
  r.get('/api/feed', async (req, _p, ctx) => json(await d.feed.forMe(await auth(req, ctx), new URL(req.url).searchParams.get('cursor'))));
  r.get('/api/discovery', async (req, _p, ctx) => json(await d.social.discovery(await auth(req, ctx), new URL(req.url).searchParams.get('cursor'))));
  r.get('/api/vistas/:id', async (req, params, ctx) => json(await d.feed.vista(await auth(req, ctx), params.id)));
  r.post('/api/vistas/:id/publish', async (req, params, ctx) => json(await d.social.publish(await mutation(req, ctx), params.id)));
  r.delete('/api/vistas/:id/publish', async (req, params, ctx) => json(await d.social.unpublish(await mutation(req, ctx), params.id)));
  r.get('/api/vistas/:id/state', async (req, params, ctx) => json(await d.states.get(await auth(req, ctx), params.id)));
  r.put('/api/vistas/:id/state', async (req, params, ctx) => json(await d.states.commit(await mutation(req, ctx), params.id, await body(req))));
  r.get('/api/subscriptions', async (req, _p, ctx) => json(await d.social.subscriptions(await auth(req, ctx))));
  r.post('/api/subscriptions', async (req, _p, ctx) => json(await d.social.subscribe(await mutation(req, ctx), await body(req)), 201));
  r.delete('/api/subscriptions/:channelId', async (req, params, ctx) => json(await d.social.unsubscribe(await mutation(req, ctx), params.channelId)));
  r.post('/api/forks', async (req, _p, ctx) => {
    const p = await mutation(req, ctx);
    const res = await d.social.fork(p, await body(req));
    if (res.runId) wake(p);
    return json(res, 201);
  });
  r.post('/api/ask', async (req, _p, ctx) => json(await d.asker.ask(await mutation(req, ctx), await body(req))));

  // ---- external runner nodes (R5.8 path, optional) ------------------------
  const node = async (req: Request): Promise<string> => {
    const m = req.headers.get('authorization')?.match(/^Bearer (.+)$/);
    if (!m || !d.nodeTokens) throw new ApiError('UNAUTHENTICATED', 401);
    const hash = await sha256Hex(m[1]);
    for (const [id, token] of d.nodeTokens) if ((await sha256Hex(token)) === hash) return id;
    throw new ApiError('UNAUTHENTICATED', 401);
  };
  const fence = (req: Request, nodeId: string, runId: string) => {
    const h = c.RunnerHeaders.safeParse({ Authorization: req.headers.get('authorization'), 'X-Run-Attempt': req.headers.get('x-run-attempt') });
    if (!h.success) throw new RunnerError('FENCED', 400, ['X-Run-Attempt required']);
    return { runId, attempt: h.data['X-Run-Attempt'], nodeId };
  };
  r.post('/runner/register', async (req) => { const id = await node(req); const b = c.Register.safeParse(await body(req)); if (!b.success || b.data.nodeId !== id) throw new ApiError('INVALID_REQUEST', 400); return json({ nodeId: id }); });
  r.post('/runner/claim', async (req) => { const id = await node(req); const b = c.Claim.safeParse(await body(req)); if (!b.success || b.data.nodeId !== id) throw new ApiError('INVALID_REQUEST', 400); const job = await d.runs.claim(id, b.data); return job ? json(job) : empty(204); });
  r.post('/runner/runs/:id/heartbeat', async (req, params) => { const id = await node(req); const b = c.Heartbeat.safeParse(await body(req)); if (!b.success) throw new ApiError('INVALID_REQUEST', 400); return json(await d.runs.heartbeat(fence(req, id, params.id), b.data.phase)); });
  r.put('/runner/runs/:id/files/*path', async (req, params) => { const id = await node(req); const bytes = new Uint8Array(await req.arrayBuffer()); await d.runs.stageFile(fence(req, id, params.id), params.path, bytes, req.headers.get('x-sha256') ?? ''); return empty(200); });
  r.post('/runner/runs/:id/submit', async (req, params) => { const id = await node(req); return json(await d.runs.submit(fence(req, id, params.id), await body(req)), 201); });
  r.post('/runner/runs/:id/fail', async (req, params) => { const id = await node(req); return json(await d.runs.fail(fence(req, id, params.id), await body(req))); });

  // ---- vista gateway (served on the separate Vista origin) ------------------
  r.get('/v/:token/*path', async (_req, params) => {
    const asset = await d.gateway.resolve(params.token, params.path);
    if (!asset) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const obj = await d.store.get(asset.objectKey);
    if (!obj) return new Response('not found', { status: 404 });
    return new Response(obj.body as BodyInit, { status: 200, headers: d.gateway.assetHeaders(asset.contentType) });
  });

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const m = r.match(req.method, url.pathname);
    if (!m) return r.hasPath(url.pathname) ? json({ error: { code: 'INVALID_REQUEST' } }, 405) : json({ error: { code: 'NOT_FOUND' } }, 404);
    try { return await m.handler(req, m.params, {}); }
    catch (e) {
      if (e instanceof ApiError) return json({ error: { code: e.code } }, e.status);
      if (e instanceof RunnerError) return json(e.code === 'VALIDATION' ? { errors: e.errors } : { error: { code: e.code } }, e.status);
      console.error('[core] unhandled', (e as Error).stack ?? e);
      return json({ error: { code: 'INTERNAL' } }, 500);
    }
  }
  return { fetch: handle, router: r };
}
