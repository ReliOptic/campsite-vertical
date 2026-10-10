import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, stubSubmit, enc, sha256Hex } from '../helpers/world';

const code = (c: string) => (e: { code?: string }) => e.code === c;

test('channel creation requires a connected model and consumes no quota when rejected', async () => {
  const w = await world();
  const p = await w.login('a', 'free', false);
  await assert.rejects(() => w.channels.create(p, { brief: '전력 병목' }, 'key-0000001'), code('MODEL_NOT_CONNECTED'));
  assert.equal((await w.identity.me(p)).usage.runsToday.used, 0);
});

test('free plan: one channel, second is CHANNEL_LIMIT, concurrent creates never exceed the limit', async () => {
  const w = await world();
  const p = await w.login('a');
  const first = await w.channels.create(p, { brief: 'HBM 시장' }, 'key-0000001');
  assert.match(first.channelId, /^ch_/); assert.match(first.runId, /^r_/);
  await assert.rejects(() => w.channels.create(p, { brief: '다른 채널' }, 'key-0000002'), code('CHANNEL_LIMIT'));
  const w2 = await world(); const q = await w2.login('b');
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => w2.channels.create(q, { brief: `c${i}` }, `key-000000${i}`)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await w2.channels.list(q)).items.length, 1);
});

test('idempotency: same key+body returns the same ids; same key with a different body is rejected', async () => {
  const w = await world(); const p = await w.login('a', 'plus');
  const a = await w.channels.create(p, { brief: '같은 요청' }, 'idem-00000001');
  const b = await w.channels.create(p, { brief: '같은 요청' }, 'idem-00000001');
  assert.deepEqual(a, b);
  await assert.rejects(() => w.channels.create(p, { brief: '다른 요청' }, 'idem-00000001'), code('INVALID_REQUEST'));
  assert.equal((await w.channels.list(p)).items.length, 1);
});

test('initial run is QUEUED with trigger initial; owner reads it, others get NOT_FOUND', async () => {
  const w = await world(); const p = await w.login('a'); const other = await w.login('b');
  const { runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  assert.deepEqual(await w.runs.get(p, runId), { status: 'QUEUED', phase: 'QUEUED', trigger: 'initial' });
  await assert.rejects(() => w.runs.get(other, runId), code('NOT_FOUND'));
});

test('daily run cap is enforced atomically under concurrency', async () => {
  const w = await world(); const p = await w.login('a');
  const { channelId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001'); // uses 1 of 3
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => w.runs.createManual(p, { channelId, prompt: '다시' })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => (r as PromiseRejectedResult).reason.code === 'RUN_LIMIT'));
  assert.equal((await w.identity.me(p)).usage.runsToday.used, 3);
});

test('claim: two nodes compete, exactly one wins; the winner holds a lease and attempt 1', async () => {
  const w = await world(); const p = await w.login('a');
  const { runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  const [j1, j2] = await Promise.all([w.runs.claim('node-1', { freeMemMb: 8192, freeCpus: 4 }), w.runs.claim('node-2', { freeMemMb: 8192, freeCpus: 4 })]);
  const jobs = [j1, j2].filter(Boolean);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]!.runId, runId); assert.equal(jobs[0]!.attempt, 1);
  assert.equal(jobs[0]!.model.apiKey, '', 'external nodes never receive the user key through claim');
  assert.deepEqual(await w.runs.get(p, runId), { status: 'CLAIMED', phase: 'QUEUED', trigger: 'initial' });
});

test('claim respects plan limits and per-workspace concurrency', async () => {
  const w = await world(); const p = await w.login('a', 'pro');
  const { channelId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  for (let i = 0; i < 5; i++) await w.runs.createManual(p, { channelId, prompt: `p${i}` });
  assert.equal(await w.runs.claim('small', { freeMemMb: 1024, freeCpus: 1 }), null, 'pro limits need 6144MB');
  const claimed = [];
  for (let i = 0; i < 6; i++) { const j = await w.runs.claim(`n${i}`, { freeMemMb: 65536, freeCpus: 32 }); if (j) claimed.push(j); }
  assert.equal(claimed.length, 4, 'pro maxConcurrentRuns = 4');
});

test('fencing: wrong attempt, wrong node, or expired lease are rejected', async () => {
  const w = await world(); const p = await w.login('a');
  const { runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  await w.runs.claim('node-1', { freeMemMb: 8192, freeCpus: 4 });
  await assert.rejects(() => w.runs.heartbeat({ runId, attempt: 2, nodeId: 'node-1' }, 'SEARCHING'), code('FENCED'));
  await assert.rejects(() => w.runs.heartbeat({ runId, attempt: 1, nodeId: 'node-2' }, 'SEARCHING'), code('FENCED'));
  const hb = await w.runs.heartbeat({ runId, attempt: 1, nodeId: 'node-1' }, 'VERIFYING');
  assert.equal(hb.cancel, false);
  assert.equal((await w.runs.get(p, runId)).status, 'VALIDATING');
  w.clock.tick(120_000);
  await assert.rejects(() => w.runs.heartbeat({ runId, attempt: 1, nodeId: 'node-1' }, 'DRAFTING'), code('FENCED'));
});

test('lease expiry requeues once (attempt 2) and then fails with TIMEOUT; a stale submit is fenced', async () => {
  const w = await world(); const p = await w.login('a');
  const { runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  await w.runs.claim('node-1', { freeMemMb: 8192, freeCpus: 4 });
  w.clock.tick(120_000);
  assert.equal(await w.runs.expireLeases(), 1);
  assert.deepEqual(await w.runs.get(p, runId), { status: 'QUEUED', phase: 'QUEUED', trigger: 'initial' });
  const j2 = await w.runs.claim('node-2', { freeMemMb: 8192, freeCpus: 4 });
  assert.equal(j2?.attempt, 2);
  await assert.rejects(() => stubSubmit(w, runId, 1, 'node-1'), code('FENCED'));
  w.clock.tick(120_000);
  assert.equal(await w.runs.expireLeases(), 1);
  assert.deepEqual(await w.runs.get(p, runId), { status: 'FAILED', phase: 'QUEUED', trigger: 'initial', error: 'TIMEOUT' });
});

test('staging validates path, hash and cumulative size', async () => {
  const w = await world(); const p = await w.login('a');
  const { runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  await w.runs.claim('n', { freeMemMb: 8192, freeCpus: 4 });
  const f = { runId, attempt: 1, nodeId: 'n' };
  const shaA = await sha256Hex('a');
  await assert.rejects(() => w.runs.stageFile(f, '../x.html', enc('a'), shaA), code('INVALID_REQUEST'));
  await assert.rejects(() => w.runs.stageFile(f, 'x.exe', enc('a'), shaA), code('INVALID_REQUEST'));
  await assert.rejects(() => w.runs.stageFile(f, 'index.html', enc('a'), '0'.repeat(64)), code('INVALID_REQUEST'));
  const big = new Uint8Array(3 * 1024 * 1024 + 1);
  const shaBig = await sha256Hex(big);
  await assert.rejects(() => w.runs.stageFile(f, 'big.js', big, shaBig), code('INVALID_REQUEST'));
});

test('submit commits vista+revision+feed atomically, READY once; resubmit returns the same revision', async () => {
  const w = await world(); const p = await w.login('a');
  const { runId, channelId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  await w.runs.claim('n', { freeMemMb: 8192, freeCpus: 4 });
  const r1 = await stubSubmit(w, runId, 1, 'n');
  const r2 = await w.runs.submit({ runId, attempt: 1, nodeId: 'n' }, { manifest: r1.manifest, usage: { tokensIn: 1, tokensOut: 1, durationMs: 1 } });
  assert.equal(r1.revisionId, r2.revisionId);
  const run = await w.runs.get(p, runId);
  assert.equal(run.status, 'READY'); assert.ok(run.vistaId);
  const feed = await w.feed.forMe(p, null);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].channelId, channelId);
  assert.equal(feed.items[0].published, false);
  assert.equal((await w.channels.list(p)).items[0].latestVistaId, run.vistaId);
  assert.equal((await w.db.all('select * from feed_entries')).length, 1);
  assert.ok((await w.store.list(`artifacts/${p.workspaceId}/`)).some(k => k.endsWith('/index.html')));
});

test('submit rejects manifests that do not match staged files', async () => {
  const w = await world(); const p = await w.login('a');
  const { runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  await w.runs.claim('n', { freeMemMb: 8192, freeCpus: 4 });
  await assert.rejects(() => stubSubmit(w, runId, 1, 'n', 'T', { generator: { runId: 'r_other', modelId: 'stub' } }), code('VALIDATION'));
  await assert.rejects(() => stubSubmit(w, runId, 1, 'n', 'T', { files: [{ path: 'index.html', sha256: '0'.repeat(64), bytes: 1 }, { path: 'poster.png', sha256: '1'.repeat(64), bytes: 1 }] }), code('VALIDATION'));
  assert.equal((await w.db.all('select * from feed_entries')).length, 0);
});

test('fail: retryable requeues once; CANCELED never requeues; terminal after attempt 2', async () => {
  const w = await world(); const p = await w.login('a', 'plus');
  const { channelId, runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  await w.runs.claim('n', { freeMemMb: 8192, freeCpus: 4 });
  assert.deepEqual(await w.runs.fail({ runId, attempt: 1, nodeId: 'n' }, { code: 'MODEL_ERROR', retryable: true }), { status: 'QUEUED' });
  await w.runs.claim('n', { freeMemMb: 8192, freeCpus: 4 });
  assert.deepEqual(await w.runs.fail({ runId, attempt: 2, nodeId: 'n' }, { code: 'MODEL_ERROR', retryable: true }), { status: 'FAILED' });
  assert.equal((await w.runs.get(p, runId)).error, 'MODEL_ERROR');
  const { runId: r2 } = await w.runs.createManual(p, { channelId, prompt: 'again' });
  await w.runs.claim('n', { freeMemMb: 8192, freeCpus: 4 });
  assert.deepEqual(await w.runs.fail({ runId: r2, attempt: 1, nodeId: 'n' }, { code: 'CANCELED', retryable: true }), { status: 'FAILED' });
});

test('cancel: queued runs fail immediately; running runs see cancel on heartbeat', async () => {
  const w = await world(); const p = await w.login('a', 'plus');
  const { channelId, runId } = await w.channels.create(p, { brief: 'x' }, 'key-0000001');
  assert.deepEqual(await w.runs.cancel(p, runId), { status: 'FAILED', phase: 'QUEUED', trigger: 'initial', error: 'CANCELED' });
  const { runId: r2 } = await w.runs.createManual(p, { channelId, prompt: 'again' });
  await w.runs.claim('n', { freeMemMb: 8192, freeCpus: 4 });
  await w.runs.cancel(p, r2);
  assert.equal((await w.runs.heartbeat({ runId: r2, attempt: 1, nodeId: 'n' }, 'DRAFTING')).cancel, true);
});

test('channel schedule: interval below plan minimum is clamped; disabled clears next run', async () => {
  const w = await world(); const p = await w.login('a');
  const { channelId } = await w.channels.create(p, { brief: 'x', intervalMin: 5 }, 'key-0000001');
  const ch = (await w.channels.list(p)).items[0];
  assert.equal(ch.schedule.intervalMin, 1440, 'free plan minimum is 1440');
  assert.equal(ch.schedule.enabled, true);
  assert.equal(ch.schedule.nextRunAt, '2026-10-11T00:00:00.000Z');
  const updated = await w.channels.update(p, channelId, { enabled: false });
  assert.equal(updated.schedule.nextRunAt, null);
});
