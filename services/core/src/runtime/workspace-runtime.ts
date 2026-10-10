import * as c from '@campsite/contracts';
import type { Clock, Db } from '../ports';
import type { Runs } from '../domain/runs';
import type { RunExecutor, ExecutionOutcome } from '../execution/executor';
import type { ChannelRow } from '../domain/types';
import { ApiError, iso } from '../domain/util';

export interface RuntimeDeps { db: Db; clock: Clock; runs: Runs; executor: RunExecutor; workspaceId: string; runtimeId: string; log?: (e: Record<string, unknown>) => void }
export interface WakeResult { enqueued: number; executed: ExecutionOutcome[]; nextWakeAt: string | null }

/**
 * The account's own runtime ("계정에 배정된 Campsite Runner"): single-threaded owner of the workspace's
 * schedule and executions. On Cloudflare it lives in a Durable Object (alarm = next wake); locally it is
 * an in-process object driven by timers. Both call the same `wake()`.
 */
export class WorkspaceRuntime {
  private running = false;
  private activeRunId: string | null = null;
  constructor(private readonly d: RuntimeDeps) {}

  get runtimeId() { return this.d.runtimeId; }
  isRunning() { return this.running; }

  /** Enqueues due scheduled runs, executes queued work, and reports when to wake next. Re-entrant safe. */
  async wake(): Promise<WakeResult> {
    if (this.running) return { enqueued: 0, executed: [], nextWakeAt: await this.nextWakeAt() };
    this.running = true;
    const executed: ExecutionOutcome[] = [];
    let enqueued = 0;
    try {
      enqueued = await this.enqueueDue();
      // One execution at a time per runtime; plan concurrency is enforced at claim time across runtimes.
      for (let i = 0; i < 25; i++) {
        const job = await this.d.runs.claim(this.d.runtimeId, { freeMemMb: Number.MAX_SAFE_INTEGER, freeCpus: Number.MAX_SAFE_INTEGER }, { workspaceId: this.d.workspaceId });
        if (!job) break;
        const row = await this.d.runs.getRow(job.runId);
        if (!row) continue;
        this.activeRunId = row.id;
        const outcome = await this.d.executor.execute(row, this.d.runtimeId);
        this.activeRunId = null;
        this.d.log?.({ runtimeId: this.d.runtimeId, runId: row.id, trigger: row.trigger, ...outcome, errors: outcome.errors?.slice(0, 3) });
        executed.push(outcome);
      }
    } finally { this.running = false; }
    return { enqueued, executed, nextWakeAt: await this.nextWakeAt() };
  }

  /** Scheduled channels past next_run_at get exactly one run per slot; the schedule then advances. */
  async enqueueDue(): Promise<number> {
    const now = this.d.clock.now();
    const plan = await this.plan();
    const due = await this.d.db.all<ChannelRow>('SELECT * FROM channels WHERE workspace_id = ? AND schedule_enabled = 1 AND interval_min IS NOT NULL AND next_run_at IS NOT NULL AND next_run_at <= ?', [this.d.workspaceId, iso(now)]);
    let n = 0;
    for (const ch of due) {
      const slot = ch.next_run_at!;
      let next = new Date(slot);
      while (next.getTime() <= now.getTime()) next = new Date(next.getTime() + ch.interval_min! * 60_000);
      try {
        await this.d.runs.reserveQuota(this.d.workspaceId, c.profiles[plan].dailyRunCap);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'RUN_LIMIT') { await this.d.db.run('UPDATE channels SET next_run_at = ? WHERE id = ?', [iso(next), ch.id]); continue; }
        throw e;
      }
      const runId = await this.d.runs.insertQueued({ workspaceId: this.d.workspaceId, plan }, ch.id, ch.brief, 'scheduled', slot);
      if (!runId) await this.d.runs.releaseQuota(this.d.workspaceId); else n++;
      await this.d.db.run('UPDATE channels SET next_run_at = ? WHERE id = ? AND next_run_at = ?', [iso(next), ch.id, slot]);
    }
    return n;
  }

  async nextWakeAt(): Promise<string | null> {
    const queued = await this.d.runs.queuedForWorkspace(this.d.workspaceId);
    if (queued > 0) return iso(this.d.clock.now());
    const r = await this.d.db.first<{ next: string | null }>('SELECT MIN(next_run_at) AS next FROM channels WHERE workspace_id = ? AND schedule_enabled = 1', [this.d.workspaceId]);
    return r?.next ?? null;
  }

  async status(): Promise<c.RuntimeResponse> {
    const active = await this.d.runs.activeForWorkspace(this.d.workspaceId);
    return c.RuntimeResponse.parse({ runtimeId: this.d.runtimeId, status: this.running ? 'running' : 'idle', activeRuns: active, nextWakeAt: await this.nextWakeAt() });
  }

  private async plan(): Promise<c.PlanName> {
    const r = await this.d.db.first<{ plan: c.PlanName }>('SELECT plan FROM entitlements WHERE workspace_id = ?', [this.d.workspaceId]);
    return r?.plan ?? 'free';
  }
}

/** Global sweep (cron): expire leases and find workspaces that need a wake even if their alarm was lost. */
export async function sweepDueWorkspaces(db: Db, runs: Runs, clock: Clock): Promise<{ expired: number; workspaceIds: string[] }> {
  const expired = await runs.expireLeases();
  const now = iso(clock.now());
  const rows = await db.all<{ workspace_id: string }>(
    `SELECT DISTINCT workspace_id FROM (
       SELECT workspace_id FROM channels WHERE schedule_enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
       UNION SELECT workspace_id FROM runs WHERE status = 'QUEUED')`, [now]);
  return { expired, workspaceIds: rows.map(r => r.workspace_id) };
}
