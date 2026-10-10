import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '@campsite/contracts';
import { bootstrap } from '../../src/node/bootstrap';
import { StubProvider } from '../../src/execution/provider';
import { playwrightValidator, sharedChromium, closeSharedChromium } from '../../src/node/playwright-validator';
import { FakeClock, testConfig, testSecrets } from '../helpers/db';

after(async () => { await closeSharedChromium(); });
const KEY = 'sk-or-v1-' + 'abcdef12'.repeat(6);

function client(app: { fetch: (r: Request) => Promise<Response> }, origin = 'http://app.test') {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, base = origin) => {
    const res = await app.fetch(new Request(`${base}${path}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), Origin: origin, ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }));
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return { call, login: (email: string, name: string) => call('POST', '/auth/dev/login', { email, name }), get cookie() { return cookie; } };
}

function core(clock = new FakeClock(), executionMode: 'platform' | 'external' = 'platform') {
  return bootstrap({ config: { ...testConfig, executionMode }, secrets: testSecrets, clock, provider: new StubProvider(), validator: playwrightValidator(sharedChromium), realTimers: false, nodeTokens: new Map([['node-x', 'node-x-token-000000']]) });
}

test('auth: dev login sets an HttpOnly cookie; /api/me is contract-shaped; logout revokes; unauthenticated is 401', async () => {
  const cr = core(); const a = client(cr.app);
  const me = await a.login('a@campsite.test', 'Account A');
  assert.equal(me.status, 200);
  c.MeResponse.parse(me.body);
  assert.match(me.headers.get('set-cookie')!, /HttpOnly/);
  assert.equal((await a.call('GET', '/api/me')).status, 200);
  assert.equal((await a.call('POST', '/auth/logout')).status, 204);
  assert.equal((await a.call('GET', '/api/me')).status, 401);
  const anon = client(cr.app);
  assert.deepEqual((await anon.call('GET', '/api/feed')).body, { error: { code: 'UNAUTHENTICATED' } });
});

test('csrf: cross-origin mutations are refused, reads are fine', async () => {
  const cr = core(); const a = client(cr.app);
  await a.login('a@campsite.test', 'A');
  assert.equal((await a.call('POST', '/api/model', { provider: 'openrouter', apiKey: KEY }, { Origin: 'http://evil.test' })).status, 403);
  assert.equal((await a.call('GET', '/api/model', undefined, { Origin: 'http://evil.test' })).status, 200);
});

test('model: connect returns hint only; channel creation needs it; Idempotency-Key is required and honoured', async () => {
  const cr = core(); const a = client(cr.app);
  await a.login('a@campsite.test', 'A');
  const noKey = await a.call('POST', '/api/channels', { brief: '전력' }, { 'Idempotency-Key': 'idem-000001' });
  assert.deepEqual(noKey.body, { error: { code: 'MODEL_NOT_CONNECTED' } }); assert.equal(noKey.status, 409);
  const m = await a.call('POST', '/api/model', { provider: 'openrouter', apiKey: KEY, modelId: 'openrouter/auto' });
  c.ModelResponse.parse(m.body); assert.ok(!JSON.stringify(m.body).includes(KEY));
  assert.equal((await a.call('POST', '/api/channels', { brief: '전력' })).status, 400, 'missing Idempotency-Key');
  const ch1 = await a.call('POST', '/api/channels', { brief: '전력 병목' }, { 'Idempotency-Key': 'idem-000002' });
  assert.equal(ch1.status, 201); c.CreateChannelResponse.parse(ch1.body);
  const ch2 = await a.call('POST', '/api/channels', { brief: '전력 병목' }, { 'Idempotency-Key': 'idem-000002' });
  assert.deepEqual(ch2.body, ch1.body);
  assert.equal((await a.call('POST', '/api/channels', { brief: '다른' }, { 'Idempotency-Key': 'idem-000002' })).status, 400);
  const me = await a.call('GET', '/api/me'); assert.equal(me.body.model.connected, true); assert.equal(me.body.usage.channels.used, 1);
});

test('end-to-end over HTTP: three accounts — create, run (real validation), play URL, publish, discovery, subscribe, fork, state, ask, re-login restore', async () => {
  const clock = new FakeClock(); const cr = core(clock);
  const a = client(cr.app), b = client(cr.app), cc = client(cr.app);
  const meA = await a.login('a@campsite.test', 'Hana'); await b.login('b@campsite.test', 'Minsu'); await cc.login('c@campsite.test', 'Jiwoo');
  for (const u of [a, b, cc]) await u.call('POST', '/api/model', { provider: 'openrouter', apiKey: KEY });
  await cr.identity.setPlan(meA.body.workspaceId, 'plus');
  // A creates a channel; runtime wakes (fire-and-forget) → drain
  const created = await a.call('POST', '/api/channels', { brief: 'AI 데이터센터 전력 병목' }, { 'Idempotency-Key': 'idem-a-00001' });
  await cr.runtime.drain();
  const run = await a.call('GET', `/api/runs/${created.body.runId}`);
  c.RunResponse.parse(run.body); assert.equal(run.body.status, 'READY');
  const feedA = await a.call('GET', '/api/feed'); c.FeedResponse.parse(feedA.body);
  assert.equal(feedA.body.items.length, 1);
  const vistaId = feedA.body.items[0].vistaId;
  const vista = await a.call('GET', `/api/vistas/${vistaId}`); c.VistaResponse.parse(vista.body);
  assert.ok(vista.body.playUrl.startsWith('http://vista.test/v/'));
  // Gateway serves index.html and poster.png with CSP; wrong path 404
  const playPath = new URL(vista.body.playUrl).pathname;
  const html = await cr.app.fetch(new Request(`http://vista.test${playPath}`));
  assert.equal(html.status, 200); assert.match(html.headers.get('content-security-policy')!, /connect-src 'none'/); assert.match(await html.text(), /campsite-vista/);
  assert.equal((await cr.app.fetch(new Request(`http://vista.test${playPath.replace('index.html', 'poster.png')}`))).status, 200);
  assert.equal((await cr.app.fetch(new Request(`http://vista.test${playPath.replace('index.html', 'evil.js')}`))).status, 404);
  // B cannot see it until A publishes
  assert.equal((await b.call('GET', `/api/vistas/${vistaId}`)).status, 404);
  assert.equal((await b.call('GET', '/api/discovery')).body.items.length, 0);
  const pub = await a.call('POST', `/api/vistas/${vistaId}/publish`); c.PublishResponse.parse(pub.body);
  const disc = await b.call('GET', '/api/discovery'); c.DiscoveryResponse.parse(disc.body);
  assert.equal(disc.body.items.length, 1); assert.equal(disc.body.items[0].publisher.name, 'Hana');
  // B subscribes and forks (with rerun through its own runtime), C sees both publications later
  const subs = await b.call('POST', '/api/subscriptions', { channelId: disc.body.items[0].channelId }); assert.equal(subs.status, 201); c.SubscriptionsResponse.parse(subs.body);
  const fork = await b.call('POST', '/api/forks', { vistaId, rerun: true }); assert.equal(fork.status, 201); c.ForkResponse.parse(fork.body);
  await cr.runtime.drain();
  const feedB = await b.call('GET', '/api/feed');
  assert.equal(feedB.body.items.length, 2, 'forked copy + regenerated vista');
  assert.deepEqual(feedB.body.items.find((i: { vistaId: string }) => i.vistaId === fork.body.vistaId).origin.workspaceId, meA.body.workspaceId);
  await b.call('POST', `/api/vistas/${feedB.body.items[0].vistaId}/publish`);
  const discC = await cc.call('GET', '/api/discovery');
  assert.equal(discC.body.items.length, 2);
  assert.equal(discC.body.items.find((i: { vistaId: string }) => i.vistaId === vistaId).forkCount, 1);
  // Duo/semantic state round-trip and ask
  const st = await a.call('PUT', `/api/vistas/${vistaId}/state`, { baseStateRevision: 0, idempotencyKey: 'commit-a-000001', patch: [{ op: 'replace', path: '/scene', value: 'chain' }, { op: 'replace', path: '/atMs', value: 6400 }] });
  c.CommitStateResponse.parse(st.body); assert.equal(st.body.status, 'persisted');
  const ask = await a.call('POST', '/api/ask', { vistaId, question: '왜 전력이 먼저인가요?' }); c.AskResponse.parse(ask.body);
  // Re-login restores everything
  await a.call('POST', '/auth/logout');
  assert.equal((await a.call('GET', '/api/feed')).status, 401);
  const again = await a.login('a@campsite.test', 'Hana');
  assert.equal(again.body.workspaceId, meA.body.workspaceId);
  assert.equal((await a.call('GET', '/api/feed')).body.items.length, 1);
  assert.deepEqual((await a.call('GET', `/api/vistas/${vistaId}/state`)).body.state, { scene: 'chain', atMs: 6400 });
  const chans = await a.call('GET', '/api/channels'); c.ChannelsResponse.parse(chans.body); assert.ok(chans.body.items[0].latestPosterUrl);
  const rt = await a.call('GET', '/api/runtime'); c.RuntimeResponse.parse(rt.body);
});

test('external runner node path still works with Bearer + X-Run-Attempt fencing', async () => {
  const cr = core(new FakeClock(), 'external'); const a = client(cr.app);
  await a.login('a@campsite.test', 'A'); await a.call('POST', '/api/model', { provider: 'openrouter', apiKey: KEY });
  const created = await a.call('POST', '/api/channels', { brief: 'x' }, { 'Idempotency-Key': 'idem-000009' });
  const H = { Authorization: 'Bearer node-x-token-000000' };
  assert.equal((await a.call('POST', '/runner/claim', { nodeId: 'node-x', freeMemMb: 8192, freeCpus: 4 }, { Authorization: 'Bearer wrong' })).status, 401);
  const job = await a.call('POST', '/runner/claim', { nodeId: 'node-x', freeMemMb: 8192, freeCpus: 4 }, H);
  assert.equal(job.status, 200); c.Job.parse(job.body); assert.equal(job.body.runId, created.body.runId); assert.equal(job.body.model.apiKey, '');
  assert.equal((await a.call('POST', `/runner/runs/${job.body.runId}/heartbeat`, { phase: 'SEARCHING' }, H)).status, 400, 'missing X-Run-Attempt');
  assert.equal((await a.call('POST', `/runner/runs/${job.body.runId}/heartbeat`, { phase: 'SEARCHING' }, { ...H, 'X-Run-Attempt': '2' })).status, 409);
  const hb = await a.call('POST', `/runner/runs/${job.body.runId}/heartbeat`, { phase: 'SEARCHING' }, { ...H, 'X-Run-Attempt': '1' });
  assert.equal(hb.status, 200); c.HeartbeatResponse.parse(hb.body);
  assert.equal((await a.call('POST', '/runner/claim', { nodeId: 'node-x', freeMemMb: 8192, freeCpus: 4 }, H)).status, 204);
});
