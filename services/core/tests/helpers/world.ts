import { testDb, FakeClock, testSecrets, testConfig } from './db';
import { Identity } from '../../src/domain/identity';
import { ModelConnections } from '../../src/domain/model';
import { Channels } from '../../src/domain/channels';
import { Runs } from '../../src/domain/runs';
import { Artifacts } from '../../src/domain/artifacts';
import { Feed } from '../../src/domain/feed';
import { Social } from '../../src/domain/social';
import { VistaStates } from '../../src/domain/state';
import { Gateway } from '../../src/domain/gateway';
import { MemoryStore } from '../../src/adapters/local-store';
import type { Principal } from '../../src/domain/types';

export const KEY = 'sk-or-v1-' + 'deadbeef'.repeat(6);

export async function world() {
  const db = testDb(); const clock = new FakeClock(); const store = new MemoryStore();
  const identity = new Identity(db, clock, testSecrets);
  const models = new ModelConnections(db, clock, testSecrets, testConfig, async () => true);
  const artifacts = new Artifacts(db, store, clock);
  const runs = new Runs(db, clock, testConfig, artifacts);
  const channels = new Channels(db, clock, runs, models);
  const gateway = new Gateway(db, clock, testSecrets, testConfig);
  const feed = new Feed(db, clock, gateway);
  const social = new Social(db, clock, identity, runs, channels, artifacts, feed);
  const states = new VistaStates(db, clock);
  const login = async (n: string, plan: 'free' | 'plus' | 'pro' = 'free', connectModel = true): Promise<Principal> => {
    const { principal } = await identity.loginWithIdentity({ provider: 'dev', subject: `${n}@campsite.test`, email: `${n}@campsite.test`, name: n.toUpperCase(), avatarUrl: null });
    if (plan !== 'free') await identity.setPlan(principal.workspaceId, plan);
    const p = { ...principal, plan };
    if (connectModel) await models.connect(p, { provider: 'openrouter', apiKey: KEY });
    return p;
  };
  return { db, clock, store, identity, models, artifacts, runs, channels, gateway, feed, social, states, login };
}
export type World = Awaited<ReturnType<typeof world>>;

export async function sha256Hex(data: Uint8Array | string) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const enc = (s: string) => new TextEncoder().encode(s);
export const PNG_1x1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

/** Stages a minimal valid artifact for a run and submits it; returns the submit result. */
export async function stubSubmit(w: World, runId: string, attempt: number, nodeId: string, title = 'Stub Vista', extraManifest: Record<string, unknown> = {}) {
  const html = `<!doctype html><html><body><script>parent.postMessage({type:'campsite:ready'},'*')</script><h1>${title}</h1></body></html>`;
  const htmlBytes = enc(html);
  await w.runs.stageFile({ runId, attempt, nodeId }, 'index.html', htmlBytes, await sha256Hex(htmlBytes));
  await w.runs.stageFile({ runId, attempt, nodeId }, 'poster.png', PNG_1x1, await sha256Hex(PNG_1x1));
  const manifest = { schema: 1, title, summary: 'summary', entry: 'index.html', poster: 'poster.png', aspect: '9:16', durationHintMs: 5000,
    files: [{ path: 'index.html', sha256: await sha256Hex(htmlBytes), bytes: htmlBytes.byteLength }, { path: 'poster.png', sha256: await sha256Hex(PNG_1x1), bytes: PNG_1x1.byteLength }],
    generator: { runId, modelId: 'stub' }, ...extraManifest };
  const result = await w.runs.submit({ runId, attempt, nodeId }, { manifest, usage: { tokensIn: 1, tokensOut: 1, durationMs: 1 } });
  return { ...result, manifest };
}
