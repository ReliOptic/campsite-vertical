import * as c from '@campsite/contracts';
import type { Clock, Db } from '../ports';
import type { ModelConnections } from './model';
import type { Runs } from './runs';
import type { ChannelRow, Principal } from './types';
import { ApiError, invalid, iso, notFound, randomId, sha256Hex } from './util';

export function deriveTitle(brief: string): string {
  const first = brief.trim().split(/(?<=[.!?。])\s+|\n/)[0] ?? brief;
  const t = first.replace(/\s+/g, ' ').trim();
  return t.length > 40 ? t.slice(0, 39) + '…' : t;
}

export class Channels {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly runs: Runs, private readonly models: ModelConnections) {}
  private now() { return iso(this.clock.now()); }

  clampInterval(plan: c.PlanName, intervalMin: number | null | undefined): number | null {
    if (intervalMin == null) return null;
    return Math.max(intervalMin, c.profiles[plan].minScheduleIntervalMin);
  }
  nextRunFrom(from: Date, intervalMin: number): string { return iso(new Date(from.getTime() + intervalMin * 60_000)); }

  async create(p: Principal, input: unknown, idempotencyKey: string | null): Promise<c.CreateChannelResponse> {
    const parsed = c.CreateChannel.safeParse(input);
    if (!parsed.success) throw invalid('bad channel');
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) throw invalid('Idempotency-Key required');
    const requestHash = await sha256Hex(JSON.stringify(parsed.data));
    const prior = await this.db.first<{ request_hash: string; response_json: string }>('SELECT request_hash, response_json FROM idempotency_keys WHERE workspace_id = ? AND scope = ? AND key = ?', [p.workspaceId, 'channels.create', idempotencyKey]);
    if (prior) {
      if (prior.request_hash !== requestHash) throw invalid('Idempotency-Key reused with a different request');
      return c.CreateChannelResponse.parse(JSON.parse(prior.response_json));
    }
    if (!(await this.models.isConnected(p.workspaceId))) throw new ApiError('MODEL_NOT_CONNECTED', 409);
    const profile = c.profiles[p.plan];
    await this.runs.reserveQuota(p.workspaceId, profile.dailyRunCap);
    const channelId = randomId('ch');
    const now = this.now();
    const intervalMin = this.clampInterval(p.plan, parsed.data.intervalMin);
    const inserted = await this.db.run(
      `INSERT INTO channels (id, workspace_id, title, brief, interval_min, schedule_enabled, next_run_at, created_at)
       SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM channels WHERE workspace_id = ?) < ?`,
      [channelId, p.workspaceId, deriveTitle(parsed.data.brief), parsed.data.brief, intervalMin, intervalMin ? 1 : 0, intervalMin ? this.nextRunFrom(this.clock.now(), intervalMin) : null, now, p.workspaceId, profile.maxChannels]);
    if (inserted.changes !== 1) { await this.runs.releaseQuota(p.workspaceId); throw new ApiError('CHANNEL_LIMIT', 429); }
    const runId = await this.runs.insertQueued(p, channelId, parsed.data.brief, 'initial');
    if (!runId) throw new Error('initial run insert failed');
    const response = { channelId, runId };
    await this.db.run('INSERT OR IGNORE INTO idempotency_keys (workspace_id, scope, key, request_hash, response_json, created_at) VALUES (?,?,?,?,?,?)', [p.workspaceId, 'channels.create', idempotencyKey, requestHash, JSON.stringify(response), now]);
    return response;
  }

  async list(p: Principal): Promise<c.ChannelsResponse> {
    const rows = await this.db.all<ChannelRow & { latest_vista_id: string | null }>(
      `SELECT ch.*, (SELECT v.id FROM vistas v WHERE v.channel_id = ch.id ORDER BY v.created_at DESC, v.id DESC LIMIT 1) AS latest_vista_id
       FROM channels ch WHERE ch.workspace_id = ? ORDER BY ch.created_at ASC`, [p.workspaceId]);
    return { items: rows.map(r => this.toChannel(r, r.latest_vista_id)) };
  }

  async getOwned(p: Principal, channelId: string): Promise<ChannelRow> {
    const row = await this.db.first<ChannelRow>('SELECT * FROM channels WHERE id = ? AND workspace_id = ?', [channelId, p.workspaceId]);
    if (!row) throw notFound();
    return row;
  }

  async update(p: Principal, channelId: string, input: unknown): Promise<c.ChannelData> {
    const parsed = c.UpdateChannel.safeParse(input);
    if (!parsed.success) throw invalid('bad channel update');
    const row = await this.getOwned(p, channelId);
    const patch = parsed.data;
    const intervalMin = 'intervalMin' in patch ? this.clampInterval(p.plan, patch.intervalMin) : row.interval_min;
    const enabled = patch.enabled ?? (intervalMin != null && row.schedule_enabled === 1) ?? false;
    const effectiveEnabled = enabled && intervalMin != null;
    const nextRunAt = effectiveEnabled ? (row.next_run_at && row.interval_min === intervalMin ? row.next_run_at : this.nextRunFrom(this.clock.now(), intervalMin!)) : null;
    await this.db.run('UPDATE channels SET title = ?, interval_min = ?, schedule_enabled = ?, next_run_at = ? WHERE id = ?', [patch.title ?? row.title, intervalMin, effectiveEnabled ? 1 : 0, nextRunAt, channelId]);
    const latest = await this.db.first<{ id: string }>('SELECT id FROM vistas WHERE channel_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [channelId]);
    return this.toChannel({ ...row, title: patch.title ?? row.title, interval_min: intervalMin, schedule_enabled: effectiveEnabled ? 1 : 0, next_run_at: nextRunAt }, latest?.id ?? null);
  }

  toChannel(r: ChannelRow, latestVistaId: string | null, latestPosterUrl: string | null = null): c.ChannelData {
    return c.Channel.parse({
      id: r.id, title: r.title, brief: r.brief, createdAt: r.created_at, latestVistaId, latestPosterUrl,
      schedule: { intervalMin: r.interval_min, enabled: r.schedule_enabled === 1, nextRunAt: r.next_run_at, lastRunAt: r.last_run_at },
      origin: r.origin_channel_id && r.origin_workspace_id ? { channelId: r.origin_channel_id, workspaceId: r.origin_workspace_id } : null,
    });
  }

  /** Inserts a channel without quota (used by fork). Enforces the plan channel limit. */
  async insertRaw(p: Principal, fields: { title: string; brief: string; origin: { channelId: string; workspaceId: string } | null }): Promise<string> {
    const id = randomId('ch');
    const r = await this.db.run(
      `INSERT INTO channels (id, workspace_id, title, brief, origin_channel_id, origin_workspace_id, created_at)
       SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM channels WHERE workspace_id = ?) < ?`,
      [id, p.workspaceId, fields.title, fields.brief, fields.origin?.channelId ?? null, fields.origin?.workspaceId ?? null, this.now(), p.workspaceId, c.profiles[p.plan].maxChannels]);
    if (r.changes !== 1) throw new ApiError('CHANNEL_LIMIT', 429);
    return id;
  }
}
