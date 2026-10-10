import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { world, type World } from '../helpers/world';
import { RunExecutor } from '../../src/execution/executor';
import { StubProvider, type ModelProvider } from '../../src/execution/provider';
import { LocalRuntimeHost } from '../../src/runtime/local-host';
import { playwrightValidator, sharedChromium, closeSharedChromium } from '../../src/node/playwright-validator';

after(async () => { await closeSharedChromium(); });

function host(w: World, provider: ModelProvider, log: Record<string, unknown>[] = []) {
  const validator = playwrightValidator(sharedChromium);
  const executor = new RunExecutor({ runs: w.runs, models: w.models, provider, validator, clock: w.clock, log: e => log.push(e) });
  return new LocalRuntimeHost({ db: w.db, clock: w.clock, runs: w.runs, executor, log: e => log.push(e), realTimers: false });
}

test('account runtime: channel → wake → stub model → real validation → READY → For Me feed with poster', async () => {
  const w = await world(); const log: Record<string, unknown>[] = [];
  const p = await w.login('a');
  const h = host(w, new StubProvider(), log);
  const { runId, channelId } = await w.channels.create(p, { brief: 'AI 데이터센터 전력 병목을 추적해 주세요' }, 'key-a-0001');
  await h.wakeNow(p.workspaceId, p.runtimeId);
  const run = await w.runs.get(p, runId);
  assert.equal(run.status, 'READY', JSON.stringify(log.slice(-3)));
  assert.equal(run.phase, 'DONE');
  const feed = await w.feed.forMe(p, null);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].title, 'AI 데이터센터, 전력이 먼저다');
  assert.deepEqual(feed.items[0].features, ['motion']);
  const vista = await w.feed.vista(p, feed.items[0].vistaId);
  assert.equal(vista.scenes?.length, 3);
  assert.equal(vista.captions?.length, 3);
  const token = new URL(vista.posterUrl).pathname.split('/')[2];
  const poster = await w.gateway.resolve(token, 'poster.png');
  assert.ok(poster);
  const obj = await w.store.get(poster!.objectKey);
  assert.ok(obj && obj.size > 1000, 'poster bytes stored');
  assert.equal((await w.channels.list(p)).items[0].latestVistaId, feed.items[0].vistaId);
  assert.equal((await h.status(p.workspaceId, p.runtimeId)).status, 'idle');
  assert.equal(channelId, feed.items[0].channelId);
});

test('repair loop: a broken first draft is fixed on the second round within maxRepair', async () => {
  const w = await world(); const log: Record<string, unknown>[] = [];
  const p = await w.login('a', 'plus');
  const h = host(w, new StubProvider({ broken: 'static', breakOnce: true }), log);
  const { runId } = await w.channels.create(p, { brief: 'HBM 시장 구도' }, 'key-a-0001');
  await h.wakeNow(p.workspaceId, p.runtimeId);
  assert.equal((await w.runs.get(p, runId)).status, 'READY');
  const outcome = log.find(e => e.step === undefined && e.status === 'READY') as { repairs: number } | undefined;
  assert.equal(outcome?.repairs, 1);
  const w2 = await world(); const log2: Record<string, unknown>[] = [];
  const q = await w2.login('b', 'free');
  const h2 = host(w2, new StubProvider({ broken: 'network' }), log2);
  const { runId: r2 } = await w2.channels.create(q, { brief: '거시경제' }, 'key-b-0001');
  await h2.wakeNow(q.workspaceId, q.runtimeId);
  const failed = await w2.runs.get(q, r2);
  assert.equal(failed.status, 'FAILED'); assert.equal(failed.error, 'VALIDATION_FAILED');
  assert.equal((await w2.feed.forMe(q, null)).items.length, 0, 'nothing published on failure');
});

test('scheduled channel: wake after next_run_at enqueues exactly one run per slot even if woken twice; SKIPPED leaves no feed entry; next slot advances', async () => {
  const w = await world(); const log: Record<string, unknown>[] = [];
  const p = await w.login('a', 'pro');
  const h = host(w, new StubProvider({ skipScheduled: true }), log);
  const { channelId } = await w.channels.create(p, { brief: '전력 인프라 변화', intervalMin: 60 }, 'key-a-0001');
  await h.wakeNow(p.workspaceId, p.runtimeId);
  assert.equal((await w.feed.forMe(p, null)).items.length, 1, 'initial run produced a vista');
  w.clock.tick(61 * 60_000);
  await Promise.all([h.wakeNow(p.workspaceId, p.runtimeId), h.wakeNow(p.workspaceId, p.runtimeId)]);
  const runs = await w.db.all<{ trigger: string; status: string; schedule_slot: string | null }>('select trigger, status, schedule_slot from runs order by created_at');
  assert.deepEqual(runs.map(r => r.trigger), ['initial', 'scheduled']);
  assert.equal(runs[1].status, 'SKIPPED');
  assert.equal(runs[1].schedule_slot, '2026-10-10T01:00:00.000Z');
  assert.equal((await w.feed.forMe(p, null)).items.length, 1, 'SKIPPED adds no feed entry');
  const ch = (await w.channels.list(p)).items[0];
  assert.equal(ch.schedule.nextRunAt, '2026-10-10T02:00:00.000Z');
  assert.ok(ch.schedule.lastRunAt);
  assert.equal(channelId, ch.id);
  const w3 = await world(); const q = await w3.login('b', 'pro');
  const h3 = host(w3, new StubProvider({ skipScheduled: false }));
  await w3.channels.create(q, { brief: '전력 인프라 변화', intervalMin: 60 }, 'key-b-0001');
  await h3.wakeNow(q.workspaceId, q.runtimeId);
  w3.clock.tick(61 * 60_000);
  await h3.wakeNow(q.workspaceId, q.runtimeId);
  assert.equal((await w3.feed.forMe(q, null)).items.length, 2, 'scheduled run with change produced a second vista');
});

test('global sweep wakes a logged-out account whose schedule is due and expires stale leases', async () => {
  const w = await world();
  const p = await w.login('a', 'pro');
  const h = host(w, new StubProvider());
  await w.channels.create(p, { brief: '거시경제 한 장', intervalMin: 60 }, 'key-a-0001');
  await h.wakeNow(p.workspaceId, p.runtimeId);
  await w.identity.logout('irrelevant');
  w.clock.tick(2 * 3600_000);
  const stale = await w.runs.createManual(p, { channelId: (await w.channels.list(p)).items[0].id, prompt: 'x' });
  await w.runs.claim('dead-node', { freeMemMb: 65536, freeCpus: 32 });
  w.clock.tick(5 * 60_000);
  const s = await h.sweep();
  assert.equal(s.expired, 1); assert.equal(s.woken, 1);
  const feed = await w.feed.forMe(p, null);
  assert.ok(feed.items.length >= 2, 'scheduled vista produced without a browser session');
  assert.equal((await w.runs.get(p, stale.runId)).status, 'READY', 'expired lease was requeued and executed by the runtime');
});

test('daily cap reached: scheduler pushes the slot forward instead of failing', async () => {
  const w = await world();
  const p = await w.login('a', 'plus');
  const h = host(w, new StubProvider());
  const { channelId } = await w.channels.create(p, { brief: 'x', intervalMin: 360 }, 'key-a-0001');
  for (let i = 0; i < 19; i++) await w.runs.createManual(p, { channelId, prompt: `m${i}` });
  assert.equal((await w.identity.me(p)).usage.runsToday.used, 20);
  w.clock.tick(361 * 60_000);
  const rt = h.runtime(p.workspaceId, p.runtimeId);
  assert.equal(await rt.enqueueDue(), 0);
  const scheduled = await w.db.all("select * from runs where trigger='scheduled'");
  assert.equal(scheduled.length, 0);
  assert.equal((await w.channels.list(p)).items[0].schedule.nextRunAt, '2026-10-10T12:00:00.000Z');
});
