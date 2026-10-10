import type { Clock, Db } from '../ports';
import type { Runs } from '../domain/runs';
import type { RunExecutor } from '../execution/executor';
import { WorkspaceRuntime, sweepDueWorkspaces } from './workspace-runtime';

export interface RuntimeHost {
  /** Wakes the account's runtime soon (fire-and-forget) — after channel creation, manual runs, forks. */
  wake(workspaceId: string, runtimeId: string): void;
  status(workspaceId: string, runtimeId: string): Promise<import('@campsite/contracts').RuntimeResponse>;
  /** Cron entry: expire leases and wake due workspaces. */
  sweep(): Promise<{ expired: number; woken: number }>;
}

/** In-process host for local verification: one WorkspaceRuntime per account, timers instead of DO alarms. */
export class LocalRuntimeHost implements RuntimeHost {
  private readonly runtimes = new Map<string, WorkspaceRuntime>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly pending = new Map<string, Promise<void>>();
  constructor(private readonly d: { db: Db; clock: Clock; runs: Runs; executor: RunExecutor; log?: (e: Record<string, unknown>) => void; realTimers?: boolean }) {}

  runtime(workspaceId: string, runtimeId: string): WorkspaceRuntime {
    let rt = this.runtimes.get(runtimeId);
    if (!rt) { rt = new WorkspaceRuntime({ ...this.d, workspaceId, runtimeId }); this.runtimes.set(runtimeId, rt); }
    return rt;
  }

  wake(workspaceId: string, runtimeId: string): void { void this.wakeNow(workspaceId, runtimeId); }

  /** Awaitable wake used by tests and the sweep. Serializes wakes per runtime. */
  wakeNow(workspaceId: string, runtimeId: string): Promise<void> {
    const prev = this.pending.get(runtimeId) ?? Promise.resolve();
    const next = prev.then(async () => {
      const rt = this.runtime(workspaceId, runtimeId);
      const result = await rt.wake();
      if (result.executed.length && result.nextWakeAt && new Date(result.nextWakeAt).getTime() <= this.d.clock.now().getTime()) { await rt.wake(); }
      this.arm(workspaceId, runtimeId, result.nextWakeAt);
    }).catch(e => this.d.log?.({ runtimeId, error: (e as Error).message }));
    this.pending.set(runtimeId, next);
    return next;
  }

  private arm(workspaceId: string, runtimeId: string, at: string | null) {
    const t = this.timers.get(runtimeId);
    if (t) clearTimeout(t);
    if (!at || this.d.realTimers === false) return;
    const delay = Math.max(0, new Date(at).getTime() - this.d.clock.now().getTime());
    const timer = setTimeout(() => { this.timers.delete(runtimeId); this.wake(workspaceId, runtimeId); }, Math.min(delay, 2 ** 31 - 1));
    timer.unref?.();
    this.timers.set(runtimeId, timer);
  }

  async status(workspaceId: string, runtimeId: string) { return this.runtime(workspaceId, runtimeId).status(); }

  async sweep(): Promise<{ expired: number; woken: number }> {
    const { expired, workspaceIds } = await sweepDueWorkspaces(this.d.db, this.d.runs, this.d.clock);
    for (const ws of workspaceIds) {
      const row = await this.d.db.first<{ runtime_id: string }>('SELECT runtime_id FROM workspaces WHERE id = ?', [ws]);
      if (row) await this.wakeNow(ws, row.runtime_id);
    }
    return { expired, woken: workspaceIds.length };
  }

  async drain(): Promise<void> { await Promise.all([...this.pending.values()]); }
  stop() { for (const t of this.timers.values()) clearTimeout(t); this.timers.clear(); }
}
