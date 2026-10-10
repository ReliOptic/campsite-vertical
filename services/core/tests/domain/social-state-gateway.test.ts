import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, stubSubmit, type World } from '../helpers/world';

const code = (c: string) => (e: { code?: string }) => e.code === c;

async function readyVista(w: World, who: string, plan: 'free' | 'plus' | 'pro' = 'plus', title = 'A의 Vista') {
  const p = await w.login(who, plan);
  const { runId, channelId } = await w.channels.create(p, { brief: `${who}의 관심사` }, `key-${who}-0001`);
  await w.runs.claim(`node-${who}`, { freeMemMb: 65536, freeCpus: 32 });
  await stubSubmit(w, runId, 1, `node-${who}`, title);
  const run = await w.runs.get(p, runId);
  return { p, channelId, vistaId: run.vistaId! };
}

test('publication is explicit: unpublished Vistas are invisible to others; published ones appear in Discovery with publisher', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  const b = await w.login('b');
  await assert.rejects(() => w.feed.vista(b, a.vistaId), code('NOT_FOUND'));
  assert.equal((await w.social.discovery(b, null)).items.length, 0);
  const pub = await w.social.publish(a.p, a.vistaId);
  assert.equal(pub.vistaId, a.vistaId);
  const again = await w.social.publish(a.p, a.vistaId);
  assert.equal(again.publicationId, pub.publicationId, 'publish is idempotent');
  const disc = await w.social.discovery(b, null);
  assert.equal(disc.items.length, 1);
  assert.equal(disc.items[0].publisher.name, 'A');
  assert.equal(disc.items[0].published, true);
  assert.equal(disc.items[0].subscribed, false);
  assert.equal((await w.social.discovery(a.p, null)).items.length, 0, 'own publications are not in own discovery');
  const seen = await w.feed.vista(b, a.vistaId);
  assert.equal(seen.owned, false); assert.equal(seen.published, true);
  assert.equal((await w.feed.forMe(a.p, null)).items[0].published, true);
});

test('third account cannot publish, fork or read someone else\'s private Vista', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  const c = await w.login('c');
  await assert.rejects(() => w.social.publish(c, a.vistaId), code('NOT_FOUND'));
  await assert.rejects(() => w.social.fork(c, { vistaId: a.vistaId }), code('NOT_FOUND'));
  await assert.rejects(() => w.states.get(c, a.vistaId), code('NOT_FOUND'));
});

test('subscribe requires a published channel; subscriptions list shows the latest published poster', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  const b = await w.login('b');
  await assert.rejects(() => w.social.subscribe(b, { channelId: a.channelId }), code('NOT_FOUND'));
  await w.social.publish(a.p, a.vistaId);
  const subs = await w.social.subscribe(b, { channelId: a.channelId });
  assert.equal(subs.items.length, 1);
  assert.equal(subs.items[0].latestVistaId, a.vistaId);
  assert.match(subs.items[0].latestPosterUrl!, /^http:\/\/vista\.test\/v\/.+\/poster\.png$/);
  assert.equal((await w.social.discovery(b, null)).items[0].subscribed, true);
  await assert.rejects(() => w.social.subscribe(a.p, { channelId: a.channelId }), code('NOT_FOUND'), 'cannot subscribe to self');
  assert.equal((await w.social.unsubscribe(b, a.channelId)).items.length, 0);
});

test('fork copies the published revision into my workspace with origin preserved, counts on discovery, and can re-run with my key', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  await w.social.publish(a.p, a.vistaId);
  const b = await w.login('b', 'plus');
  const fork = await w.social.fork(b, { vistaId: a.vistaId, rerun: true });
  assert.match(fork.channelId, /^ch_/); assert.match(fork.vistaId, /^v_/); assert.match(fork.runId!, /^r_/);
  const mine = await w.feed.forMe(b, null);
  assert.equal(mine.items.length, 1);
  assert.deepEqual(mine.items[0].origin, { vistaId: a.vistaId, channelId: a.channelId, workspaceId: a.p.workspaceId });
  assert.equal(mine.items[0].published, false, 'forked copy is private until I publish it');
  const chs = await w.channels.list(b);
  assert.deepEqual(chs.items[0].origin, { channelId: a.channelId, workspaceId: a.p.workspaceId });
  assert.equal(chs.items[0].brief, 'a의 관심사');
  assert.equal((await w.runs.get(b, fork.runId!)).trigger, 'fork');
  const disc = await w.social.discovery(b, null);
  assert.equal(disc.items[0].forkCount, 1);
  const copyKeys = await w.store.list(`artifacts/${b.workspaceId}/`);
  assert.ok(copyKeys.some(k => k.endsWith('/index.html')), 'artifact bytes copied');
  const forkedVista = await w.feed.vista(b, fork.vistaId);
  assert.equal(forkedVista.owned, true);
  assert.notEqual(forkedVista.revisionId, (await w.feed.vista(a.p, a.vistaId)).revisionId);
});

test('fork respects my channel limit', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  await w.social.publish(a.p, a.vistaId);
  const b = await w.login('b', 'free');
  await w.channels.create(b, { brief: 'b의 유일한 채널' }, 'key-b-0001');
  await assert.rejects(() => w.social.fork(b, { vistaId: a.vistaId }), code('CHANNEL_LIMIT'));
});

test('unpublish revokes previously issued capability links', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  await w.social.publish(a.p, a.vistaId);
  const b = await w.login('b');
  const seen = await w.feed.vista(b, a.vistaId);
  const token = new URL(seen.playUrl).pathname.split('/')[2];
  assert.ok(await w.gateway.resolve(token, 'index.html'));
  await w.social.unpublish(a.p, a.vistaId);
  assert.equal(await w.gateway.resolve(token, 'index.html'), null, 'old link no longer resolves');
  await assert.rejects(() => w.feed.vista(b, a.vistaId), code('NOT_FOUND'));
  const fresh = await w.feed.vista(a.p, a.vistaId);
  assert.ok(await w.gateway.resolve(new URL(fresh.playUrl).pathname.split('/')[2], 'poster.png'), 'owner gets a new working link');
});

test('gateway: signature, expiry, path allowlist and traversal are enforced', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  const v = await w.feed.vista(a.p, a.vistaId);
  const token = new URL(v.playUrl).pathname.split('/')[2];
  assert.ok(await w.gateway.resolve(token, 'index.html'));
  assert.ok(await w.gateway.resolve(token, 'poster.png'));
  assert.equal(await w.gateway.resolve(token, 'style.css'), null, 'not in manifest');
  assert.equal(await w.gateway.resolve(token, '../index.html'), null);
  assert.equal(await w.gateway.resolve(token.slice(0, -3) + 'abc', 'index.html'), null, 'tampered signature');
  const [body] = token.split('.');
  assert.equal(await w.gateway.resolve(body + '.' + 'A'.repeat(43), 'index.html'), null);
  w.clock.tick(11 * 60_000);
  assert.equal(await w.gateway.resolve(token, 'index.html'), null, 'expired');
  const headers = w.gateway.assetHeaders('text/html; charset=utf-8');
  assert.match(headers['Content-Security-Policy'], /connect-src 'none'/);
  assert.match(headers['Content-Security-Policy'], /frame-ancestors http:\/\/app\.test/);
});

test('semantic state: commit, idempotent replay, optimistic conflict, cross-account isolation', async () => {
  const w = await world();
  const a = await readyVista(w, 'a');
  const s0 = await w.states.get(a.p, a.vistaId);
  assert.deepEqual(s0, { stateRevision: 0, state: {}, updatedAt: null });
  const c1 = await w.states.commit(a.p, a.vistaId, { baseStateRevision: 0, idempotencyKey: 'commit-000001', patch: [{ op: 'replace', path: '/scene', value: 'chain' }, { op: 'add', path: '/atMs', value: 6400 }] });
  assert.deepEqual(c1, { status: 'persisted', stateRevision: 1, state: { scene: 'chain', atMs: 6400 } });
  const replay = await w.states.commit(a.p, a.vistaId, { baseStateRevision: 0, idempotencyKey: 'commit-000001', patch: [{ op: 'replace', path: '/scene', value: 'x' }] });
  assert.equal(replay.status, 'persisted'); assert.equal(replay.stateRevision, 1);
  const stale = await w.states.commit(a.p, a.vistaId, { baseStateRevision: 0, idempotencyKey: 'commit-000002', patch: [{ op: 'replace', path: '/scene', value: 'late' }] });
  assert.equal(stale.status, 'conflict'); assert.equal(stale.state.scene, 'chain');
  const c2 = await w.states.commit(a.p, a.vistaId, { baseStateRevision: 1, idempotencyKey: 'commit-000003', patch: [{ op: 'remove', path: '/atMs' }, { op: 'replace', path: '/fold', value: 'open' }] });
  assert.deepEqual(c2.state, { scene: 'chain', fold: 'open' });
  await w.social.publish(a.p, a.vistaId);
  const b = await w.login('b');
  assert.deepEqual((await w.states.get(b, a.vistaId)).state, {}, 'viewer state is per account');
  await w.states.commit(b, a.vistaId, { baseStateRevision: 0, idempotencyKey: 'b-commit-00001', patch: [{ op: 'replace', path: '/scene', value: 'intro' }] });
  assert.equal((await w.states.get(a.p, a.vistaId)).state.scene, 'chain', 'owner state untouched');
});
