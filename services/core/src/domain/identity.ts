import * as c from '@campsite/contracts';
import type { Clock, CoreSecrets, Db } from '../ports';
import type { PlanName, Principal, UserRow, WorkspaceRow } from './types';
import { ApiError, iso, randomId, randomToken, sha256Hex } from './util';

export interface ExternalIdentity { provider: 'google' | 'dev'; subject: string; email: string; name: string; avatarUrl: string | null }
export interface LoginResult { principal: Principal; sessionToken: string; sessionExpiresAt: string }
const SESSION_DAYS = 30;

/** Users, sessions and the one-workspace-per-account allocation ("계정이 생기면 하나가 배정된다"). */
export class Identity {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly secrets: CoreSecrets) {}

  async loginWithIdentity(ext: ExternalIdentity): Promise<LoginResult> {
    const now = iso(this.clock.now());
    const user = await this.upsertUser(ext, now);
    const ws = await this.ensureWorkspace(user.id, now);
    const { token, expiresAt } = await this.createSession(user.id);
    return { principal: { userId: user.id, workspaceId: ws.id, plan: ws.plan, runtimeId: ws.runtime_id }, sessionToken: token, sessionExpiresAt: expiresAt };
  }

  private async upsertUser(ext: ExternalIdentity, now: string): Promise<UserRow> {
    const googleSub = ext.provider === 'google' ? ext.subject : null;
    const existing = googleSub
      ? await this.db.first<UserRow>('SELECT * FROM users WHERE google_sub = ?', [googleSub])
      : await this.db.first<UserRow>('SELECT * FROM users WHERE email = ? AND google_sub IS NULL', [ext.email]);
    if (existing) {
      await this.db.run('UPDATE users SET name = ?, avatar_url = ?, email = ? WHERE id = ?', [ext.name, ext.avatarUrl, ext.email, existing.id]);
      return { ...existing, name: ext.name, avatar_url: ext.avatarUrl, email: ext.email };
    }
    const id = randomId('u');
    // INSERT OR IGNORE + re-read makes concurrent first logins converge on one row (UNIQUE google_sub / email).
    await this.db.run('INSERT OR IGNORE INTO users (id, google_sub, email, name, avatar_url, created_at) VALUES (?,?,?,?,?,?)', [id, googleSub, ext.email, ext.name, ext.avatarUrl, now]);
    const row = googleSub
      ? await this.db.first<UserRow>('SELECT * FROM users WHERE google_sub = ?', [googleSub])
      : await this.db.first<UserRow>('SELECT * FROM users WHERE email = ?', [ext.email]);
    if (!row) throw new Error('user upsert failed');
    return row;
  }

  private async ensureWorkspace(userId: string, now: string): Promise<WorkspaceRow> {
    const found = await this.workspaceByUser(userId);
    if (found) return found;
    const id = randomId('ws');
    const runtimeId = `rt_${id}`;
    await this.db.batch([
      { sql: 'INSERT OR IGNORE INTO workspaces (id, user_id, runtime_id, r2_prefix, created_at) VALUES (?,?,?,?,?)', params: [id, userId, runtimeId, `artifacts/${id}`, now] },
      { sql: "INSERT OR IGNORE INTO entitlements (workspace_id, plan, updated_at) SELECT id, 'free', ? FROM workspaces WHERE user_id = ?", params: [now, userId] },
    ]);
    const ws = await this.workspaceByUser(userId);
    if (!ws) throw new Error('workspace allocation failed');
    return ws;
  }

  async workspaceByUser(userId: string): Promise<WorkspaceRow | null> {
    return this.db.first<WorkspaceRow>('SELECT w.*, e.plan FROM workspaces w JOIN entitlements e ON e.workspace_id = w.id WHERE w.user_id = ?', [userId]);
  }

  async createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
    const token = randomToken(32);
    const now = this.clock.now();
    const expiresAt = iso(new Date(now.getTime() + SESSION_DAYS * 86400_000));
    await this.db.run('INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)', [await this.hash(token), userId, iso(now), expiresAt]);
    return { token, expiresAt };
  }

  private hash(token: string) { return sha256Hex(`${this.secrets.sessionSecret}:${token}`); }

  async resolveSession(token: string | null | undefined): Promise<Principal | null> {
    if (!token || token.length < 16) return null;
    const now = iso(this.clock.now());
    const row = await this.db.first<{ user_id: string }>('SELECT user_id FROM sessions WHERE id_hash = ? AND revoked_at IS NULL AND expires_at > ?', [await this.hash(token), now]);
    if (!row) return null;
    const ws = await this.workspaceByUser(row.user_id);
    if (!ws) return null;
    return { userId: row.user_id, workspaceId: ws.id, plan: ws.plan, runtimeId: ws.runtime_id };
  }

  async logout(token: string): Promise<void> {
    await this.db.run('UPDATE sessions SET revoked_at = ? WHERE id_hash = ?', [iso(this.clock.now()), await this.hash(token)]);
  }

  async setPlan(workspaceId: string, plan: PlanName): Promise<void> {
    c.Plan.parse(plan);
    await this.db.run('UPDATE entitlements SET plan = ?, updated_at = ? WHERE workspace_id = ?', [plan, iso(this.clock.now()), workspaceId]);
  }

  async me(p: Principal): Promise<c.MeResponse> {
    const user = await this.db.first<UserRow>('SELECT * FROM users WHERE id = ?', [p.userId]);
    if (!user) throw new ApiError('UNAUTHENTICATED', 401);
    const profile = c.profiles[p.plan];
    const channels = await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM channels WHERE workspace_id = ?', [p.workspaceId]);
    const today = iso(this.clock.now()).slice(0, 10);
    const runs = await this.db.first<{ n: number }>('SELECT COALESCE(run_count,0) AS n FROM quota_usage WHERE workspace_id = ? AND usage_date = ?', [p.workspaceId, today]);
    const model = await this.db.first<{ provider: 'openrouter'; model_id: string; key_hint: string }>('SELECT provider, model_id, key_hint FROM model_connections WHERE workspace_id = ?', [p.workspaceId]);
    const next = await this.db.first<{ next_run_at: string | null }>('SELECT MIN(next_run_at) AS next_run_at FROM channels WHERE workspace_id = ? AND schedule_enabled = 1', [p.workspaceId]);
    return c.MeResponse.parse({
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatar_url },
      workspaceId: p.workspaceId, plan: p.plan,
      usage: { channels: { used: channels?.n ?? 0, max: profile.maxChannels }, runsToday: { used: runs?.n ?? 0, max: profile.dailyRunCap } },
      model: model ? { connected: true, provider: model.provider, modelId: model.model_id, keyHint: model.key_hint } : { connected: false },
      nextUpdateAt: next?.next_run_at ?? null,
    });
  }

  /** Publisher card for discovery/subscriptions (never leaks email). */
  async publisher(workspaceId: string): Promise<{ workspaceId: string; name: string; avatarUrl: string | null }> {
    const u = await this.db.first<{ name: string; avatar_url: string | null }>('SELECT u.name, u.avatar_url FROM users u JOIN workspaces w ON w.user_id = u.id WHERE w.id = ?', [workspaceId]);
    return { workspaceId, name: u?.name ?? 'Campsite', avatarUrl: u?.avatar_url ?? null };
  }
}
