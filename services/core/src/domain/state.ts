import * as c from '@campsite/contracts';
import type { Clock, Db } from '../ports';
import type { Principal, SemanticState } from './types';
import { invalid, iso, notFound } from './util';

/** Per-viewer portable semantic state of a Vista. Optimistic concurrency by stateRevision; idempotent by key. */
export class VistaStates {
  constructor(private readonly db: Db, private readonly clock: Clock) {}

  private async assertAccessible(p: Principal, vistaId: string) {
    const row = await this.db.first<{ workspace_id: string; published: number }>('SELECT v.workspace_id, EXISTS(SELECT 1 FROM publications pb WHERE pb.vista_id = v.id) AS published FROM vistas v WHERE v.id = ?', [vistaId]);
    if (!row || (row.workspace_id !== p.workspaceId && row.published !== 1)) throw notFound();
  }

  async get(p: Principal, vistaId: string): Promise<c.VistaStateResponse> {
    await this.assertAccessible(p, vistaId);
    const row = await this.db.first<{ state_revision: number; state_json: string; updated_at: string | null }>('SELECT state_revision, state_json, updated_at FROM vista_states WHERE vista_id = ? AND workspace_id = ?', [vistaId, p.workspaceId]);
    return c.VistaStateResponse.parse({ stateRevision: row?.state_revision ?? 0, state: row ? JSON.parse(row.state_json) : {}, updatedAt: row?.updated_at ?? null });
  }

  async commit(p: Principal, vistaId: string, input: unknown): Promise<c.CommitStateResponse> {
    const parsed = c.CommitState.safeParse(input);
    if (!parsed.success) throw invalid('bad state commit');
    await this.assertAccessible(p, vistaId);
    const current = await this.db.first<{ state_revision: number; state_json: string; last_idempotency_key: string | null }>('SELECT state_revision, state_json, last_idempotency_key FROM vista_states WHERE vista_id = ? AND workspace_id = ?', [vistaId, p.workspaceId]);
    const revision = current?.state_revision ?? 0;
    const state: SemanticState = current ? JSON.parse(current.state_json) : {};
    if (current?.last_idempotency_key === parsed.data.idempotencyKey) return { status: 'persisted', stateRevision: revision, state };
    if (parsed.data.baseStateRevision !== revision) return { status: 'conflict', stateRevision: revision, state };
    const next: SemanticState = { ...state };
    for (const op of parsed.data.patch) {
      const key = op.path.slice(1);
      if (op.op === 'remove') delete next[key]; else next[key] = op.value;
    }
    const validated = c.SemanticState.safeParse(next);
    if (!validated.success) throw invalid('state too large or invalid');
    const now = iso(this.clock.now());
    const r = await this.db.run(
      `INSERT INTO vista_states (vista_id, workspace_id, state_revision, state_json, last_idempotency_key, updated_at) VALUES (?,?,?,?,?,?)
       ON CONFLICT(vista_id, workspace_id) DO UPDATE SET state_revision = excluded.state_revision, state_json = excluded.state_json, last_idempotency_key = excluded.last_idempotency_key, updated_at = excluded.updated_at
       WHERE vista_states.state_revision = ?`,
      [vistaId, p.workspaceId, revision + 1, JSON.stringify(validated.data), parsed.data.idempotencyKey, now, revision]);
    if (r.changes !== 1) {
      const latest = await this.get(p, vistaId);
      return { status: 'conflict', stateRevision: latest.stateRevision, state: latest.state };
    }
    return { status: 'persisted', stateRevision: revision + 1, state: validated.data };
  }
}
