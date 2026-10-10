import * as c from '@campsite/contracts';
import type { Clock, CoreConfig, Db } from '../ports';
import type { Artifacts } from './artifacts';
import type { FailCode, Phase, Principal, RunRow, RunTrigger } from './types';
import { ApiError, invalid, iso, notFound, randomId, sha256Hex, utcDate } from './util';

export interface Fence { runId: string; attempt: number; nodeId: string }
export type RunnerErrorCode = 'FENCED' | 'VALIDATION' | 'NOT_FOUND';
export class RunnerError extends Error {
  constructor(readonly code: RunnerErrorCode, readonly status: number, readonly errors: string[] = []) { super(`${code}: ${errors.join('; ')}`); }
}
const ACTIVE = "('CLAIMED','RUNNING','VALIDATING')";
const MAX_ATTEMPTS = 2;

/** Run state machine shared by the in-platform WorkspaceRuntime and the external Runner API. */
export class Runs {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly config: CoreConfig, private readonly artifacts: Artifacts) {}

  private now() { return iso(this.clock.now()); }

  // ---- creation -----------------------------------------------------------

  /** Atomically reserves one unit of today's run quota. */
  async reserveQuota(workspaceId: string, cap: number): Promise<void> {
    const r = await this.db.run(
      `INSERT INTO quota_usage (workspace_id, usage_date, run_count) VALUES (?,?,1)
       ON CONFLICT(workspace_id, usage_date) DO UPDATE SET run_count = run_count + 1 WHERE run_count < ?`,
      [workspaceId, utcDate(this.clock.now()), cap]);
    if (r.changes === 0) throw new ApiError('RUN_LIMIT', 429);
  }
  async releaseQuota(workspaceId: string): Promise<void> {
    await this.db.run('UPDATE quota_usage SET run_count = run_count - 1 WHERE workspace_id = ? AND usage_date = ? AND run_count > 0', [workspaceId, utcDate(this.clock.now())]);
  }

  /** Inserts a QUEUED run. Quota must already be reserved. Returns null when a schedule slot already exists. */
  async insertQueued(ws: { workspaceId: string; plan: c.PlanName }, channelId: string, prompt: string, trigger: RunTrigger, scheduleSlot: string | null = null): Promise<string | null> {
    const id = randomId('r');
    const now = this.now();
    const r = await this.db.run(
      `INSERT OR IGNORE INTO runs (id, workspace_id, channel_id, prompt, trigger, status, phase, attempt, priority, schedule_slot, created_at, updated_at)
       VALUES (?,?,?,?,?,'QUEUED','QUEUED',0,?,?,?,?)`,
      [id, ws.workspaceId, channelId, prompt, trigger, c.profiles[ws.plan].priority, scheduleSlot, now, now]);
    return r.changes === 1 ? id : null;
  }

  async requireModel(workspaceId: string): Promise<void> {
    const m = await this.db.first('SELECT 1 AS one FROM model_connections WHERE workspace_id = ?', [workspaceId]);
    if (!m) throw new ApiError('MODEL_NOT_CONNECTED', 409);
  }

  async createManual(p: Principal, input: unknown): Promise<c.CreateRunResponse> {
    const parsed = c.CreateRun.safeParse(input);
    if (!parsed.success) throw invalid('bad run request');
    const ch = await this.db.first<{ id: string }>('SELECT id FROM channels WHERE id = ? AND workspace_id = ?', [parsed.data.channelId, p.workspaceId]);
    if (!ch) throw notFound();
    await this.requireModel(p.workspaceId);
    await this.reserveQuota(p.workspaceId, c.profiles[p.plan].dailyRunCap);
    const runId = await this.insertQueued(p, ch.id, parsed.data.prompt, 'manual');
    if (!runId) { await this.releaseQuota(p.workspaceId); throw invalid('could not queue'); }
    return { runId };
  }

  // ---- read ---------------------------------------------------------------

  async get(p: Principal, runId: string): Promise<c.RunResponse> {
    const row = await this.db.first<RunRow>('SELECT * FROM runs WHERE id = ? AND workspace_id = ?', [runId, p.workspaceId]);
    if (!row) throw notFound();
    return this.toResponse(row);
  }
  toResponse(row: RunRow): c.RunResponse {
    return c.RunResponse.parse({ status: row.status, phase: row.phase, trigger: row.trigger, ...(row.vista_id ? { vistaId: row.vista_id } : {}), ...(row.fail_code ? { error: row.fail_code } : {}) });
  }
  async getRow(runId: string): Promise<RunRow | null> { return this.db.first<RunRow>('SELECT * FROM runs WHERE id = ?', [runId]); }

  // ---- claim / lease --------------------------------------------------------

  /** Picks the best eligible QUEUED run and claims it with a conditional UPDATE. */
  async claim(nodeId: string, free: { freeMemMb: number; freeCpus: number }, opts: { workspaceId?: string } = {}): Promise<c.RunnerJob | null> {
    const candidates = await this.db.all<RunRow & { plan: c.PlanName; active: number }>(
      `SELECT r.*, e.plan, (SELECT COUNT(*) FROM runs a WHERE a.workspace_id = r.workspace_id AND a.status IN ${ACTIVE}) AS active
       FROM runs r JOIN entitlements e ON e.workspace_id = r.workspace_id
       WHERE r.status = 'QUEUED' ${opts.workspaceId ? 'AND r.workspace_id = ?' : ''}
       ORDER BY r.priority DESC, r.created_at ASC LIMIT 25`, opts.workspaceId ? [opts.workspaceId] : []);
    for (const row of candidates) {
      const profile = c.profiles[row.plan];
      if (profile.memMb > free.freeMemMb || profile.cpus > free.freeCpus) continue;
      if (row.active >= profile.maxConcurrentRuns) continue;
      const leaseUntil = iso(new Date(this.clock.now().getTime() + this.config.leaseSeconds * 1000));
      const r = await this.db.run(
        `UPDATE runs SET status = 'CLAIMED', node_id = ?, attempt = attempt + 1, lease_until = ?, updated_at = ? WHERE id = ? AND status = 'QUEUED'`,
        [nodeId, leaseUntil, this.now(), row.id]);
      if (r.changes !== 1) continue;
      return this.buildJob({ ...row, attempt: row.attempt + 1 }, profile);
    }
    return null;
  }

  private async buildJob(row: RunRow & { plan: c.PlanName }, profile: c.ProfileData): Promise<c.RunnerJob> {
    const ch = await this.db.first<{ brief: string }>('SELECT brief FROM channels WHERE id = ?', [row.channel_id]);
    const recent = await this.db.all<{ manifest_json: string }>(
      `SELECT rv.manifest_json FROM feed_entries f JOIN revisions rv ON rv.id = f.revision_id WHERE f.channel_id = ? ORDER BY f.created_at DESC, f.id DESC LIMIT 3`, [row.channel_id]);
    const model = await this.db.first<{ model_id: string }>('SELECT model_id FROM model_connections WHERE workspace_id = ?', [row.workspace_id]);
    return c.Job.parse({
      runId: row.id, channelId: row.channel_id, attempt: row.attempt, prompt: row.prompt, channelBrief: ch?.brief ?? '',
      recent: recent.map(r => { const m = JSON.parse(r.manifest_json) as { title: string; summary: string }; return { title: m.title, summary: m.summary }; }),
      profile: row.plan, limits: { cpus: profile.cpus, memMb: profile.memMb, timeoutSec: profile.timeoutSec, maxRepair: profile.maxRepair, browser: profile.browser },
      // The user's key never travels through claim. The in-platform runtime resolves it in-process.
      model: { provider: 'openrouter', modelId: model?.model_id ?? 'openrouter/auto', apiKey: '' },
      artifactVersion: '1', trigger: row.trigger,
    });
  }

  /** Verifies node + attempt + unexpired lease + active status. */
  async fenced(f: Fence): Promise<RunRow> {
    const row = await this.getRow(f.runId);
    if (!row) throw new RunnerError('NOT_FOUND', 404);
    if (row.node_id !== f.nodeId || row.attempt !== f.attempt || !['CLAIMED', 'RUNNING', 'VALIDATING'].includes(row.status) || !row.lease_until || row.lease_until <= this.now())
      throw new RunnerError('FENCED', row.node_id !== f.nodeId ? 403 : 409, ['stale attempt, wrong node, expired lease or inactive run']);
    return row;
  }

  async heartbeat(f: Fence, phase: Phase): Promise<c.HeartbeatResponse> {
    c.Heartbeat.parse({ phase });
    const row = await this.fenced(f);
    const leaseUntil = iso(new Date(this.clock.now().getTime() + this.config.leaseSeconds * 1000));
    const status = phase === 'VERIFYING' ? 'VALIDATING' : 'RUNNING';
    await this.db.run(`UPDATE runs SET status = ?, phase = ?, lease_until = ?, updated_at = ? WHERE id = ? AND attempt = ? AND node_id = ?`, [status, phase, leaseUntil, this.now(), f.runId, f.attempt, f.nodeId]);
    return { leaseUntil, cancel: row.cancel_requested === 1 };
  }

  async expireLeases(): Promise<number> {
    const now = this.now();
    const expired = await this.db.all<RunRow>(`SELECT * FROM runs WHERE status IN ${ACTIVE} AND lease_until < ?`, [now]);
    let n = 0;
    for (const row of expired) {
      const requeue = row.attempt < MAX_ATTEMPTS && row.cancel_requested === 0;
      const r = requeue
        ? await this.db.run(`UPDATE runs SET status = 'QUEUED', phase = 'QUEUED', node_id = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ? AND status IN ${ACTIVE}`, [now, row.id, row.attempt])
        : await this.db.run(`UPDATE runs SET status = 'FAILED', fail_code = ?, node_id = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ? AND status IN ${ACTIVE}`, [row.cancel_requested ? 'CANCELED' : 'TIMEOUT', now, row.id, row.attempt]);
      if (r.changes === 1) { n++; if (!requeue) await this.touchChannel(row.channel_id); }
    }
    return n;
  }

  // ---- artifacts ------------------------------------------------------------

  async stageFile(f: Fence, path: string, bytes: Uint8Array, declaredSha: string): Promise<void> {
    if (!c.ArtifactPath.safeParse(path).success) throw invalid('invalid path');
    await this.fenced(f);
    const sha = await sha256Hex(bytes);
    if (sha !== declaredSha.toLowerCase()) throw invalid('sha256 mismatch');
    if (bytes.byteLength > c.MAX_BYTES) throw invalid('file too large');
    const staged = await this.db.all<{ path: string; bytes: number }>('SELECT path, bytes FROM staged_files WHERE run_id = ? AND attempt = ?', [f.runId, f.attempt]);
    const others = staged.filter(s => s.path !== path);
    if (others.length + 1 > c.MAX_FILES) throw invalid('too many files');
    if (others.reduce((s, x) => s + x.bytes, 0) + bytes.byteLength > c.MAX_BYTES) throw invalid('artifact too large');
    const key = this.artifacts.stagingKey(f.runId, f.attempt, path);
    await this.artifacts.store.put(key, bytes, this.artifacts.contentType(path));
    await this.db.run(
      `INSERT INTO staged_files (run_id, attempt, path, sha256, bytes, object_key) VALUES (?,?,?,?,?,?)
       ON CONFLICT(run_id, attempt, path) DO UPDATE SET sha256 = excluded.sha256, bytes = excluded.bytes, object_key = excluded.object_key`,
      [f.runId, f.attempt, path, sha, bytes.byteLength, key]);
  }

  async submit(f: Fence, body: unknown): Promise<c.SubmitResponse> {
    const existing = await this.db.first<{ id: string; node_id: string | null; attempt: number; status: string }>('SELECT rv.id, r.node_id, r.attempt, r.status FROM revisions rv JOIN runs r ON r.id = rv.run_id WHERE rv.run_id = ?', [f.runId]);
    if (existing) {
      if (existing.node_id === f.nodeId && existing.attempt === f.attempt) return { revisionId: existing.id };
      throw new RunnerError('FENCED', 409, ['run already committed by another attempt']);
    }
    const run = await this.fenced(f);
    const parsed = c.Submit.safeParse(body);
    if (!parsed.success) throw new RunnerError('VALIDATION', 422, parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
    const { manifest } = parsed.data;
    const errors: string[] = [];
    if (manifest.generator.runId !== f.runId) errors.push('generator.runId mismatch');
    const staged = await this.db.all<{ path: string; sha256: string; bytes: number }>('SELECT path, sha256, bytes FROM staged_files WHERE run_id = ? AND attempt = ?', [f.runId, f.attempt]);
    const byPath = new Map(staged.map(s => [s.path, s]));
    for (const file of manifest.files) {
      const s = byPath.get(file.path);
      if (!s) errors.push(`not staged: ${file.path}`);
      else if (s.sha256 !== file.sha256 || s.bytes !== file.bytes) errors.push(`staged file differs: ${file.path}`);
    }
    for (const s of staged) if (!manifest.files.some(fl => fl.path === s.path)) errors.push(`undeclared file: ${s.path}`);
    if (errors.length) throw new RunnerError('VALIDATION', 422, errors);
    const { revisionId } = await this.artifacts.commitRun(run, manifest, f.attempt);
    await this.touchChannel(run.channel_id);
    return { revisionId };
  }

  async fail(f: Fence, body: unknown): Promise<c.FailResponse> {
    const parsed = c.Fail.safeParse(body);
    if (!parsed.success) throw new RunnerError('VALIDATION', 400, ['bad fail body']);
    const row = await this.fenced(f);
    const code: FailCode = parsed.data.code;
    const requeue = parsed.data.retryable && code !== 'CANCELED' && row.attempt < MAX_ATTEMPTS && row.cancel_requested === 0;
    if (requeue) {
      await this.db.run(`UPDATE runs SET status = 'QUEUED', phase = 'QUEUED', node_id = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ?`, [this.now(), f.runId, f.attempt]);
      return { status: 'QUEUED' };
    }
    await this.db.run(`UPDATE runs SET status = 'FAILED', fail_code = ?, node_id = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ?`, [row.cancel_requested ? 'CANCELED' : code, this.now(), f.runId, f.attempt]);
    await this.touchChannel(row.channel_id);
    return { status: 'FAILED' };
  }

  /** Scheduled run found nothing worth a new Vista. Terminal, no revision, no feed entry. */
  async skip(f: Fence): Promise<void> {
    const row = await this.fenced(f);
    await this.db.run(`UPDATE runs SET status = 'SKIPPED', phase = 'DONE', node_id = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ?`, [this.now(), f.runId, f.attempt]);
    await this.touchChannel(row.channel_id);
  }

  async cancel(p: Principal, runId: string): Promise<c.RunResponse> {
    const row = await this.db.first<RunRow>('SELECT * FROM runs WHERE id = ? AND workspace_id = ?', [runId, p.workspaceId]);
    if (!row) throw notFound();
    const now = this.now();
    if (row.status === 'QUEUED') await this.db.run(`UPDATE runs SET status = 'FAILED', fail_code = 'CANCELED', updated_at = ? WHERE id = ? AND status = 'QUEUED'`, [now, runId]);
    else if (['CLAIMED', 'RUNNING', 'VALIDATING'].includes(row.status)) await this.db.run('UPDATE runs SET cancel_requested = 1, updated_at = ? WHERE id = ?', [now, runId]);
    return this.get(p, runId);
  }

  private async touchChannel(channelId: string) {
    await this.db.run('UPDATE channels SET last_run_at = ? WHERE id = ?', [this.now(), channelId]);
  }

  async activeForWorkspace(workspaceId: string): Promise<number> {
    const r = await this.db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM runs WHERE workspace_id = ? AND status IN ${ACTIVE}`, [workspaceId]);
    return r?.n ?? 0;
  }
  async queuedForWorkspace(workspaceId: string): Promise<number> {
    const r = await this.db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM runs WHERE workspace_id = ? AND status = 'QUEUED'`, [workspaceId]);
    return r?.n ?? 0;
  }
}
