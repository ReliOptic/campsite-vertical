import type { Clock, Db, ObjectStore } from '../ports';
import type { Manifest, RevisionRow, RunRow, VistaRow } from './types';
import { iso, randomId, sha256Hex } from './util';

const CONTENT_TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };

/** Staging → immutable revision prefix → single D1 commit (vista, revision, feed entry, run READY). */
export class Artifacts {
  constructor(private readonly db: Db, readonly store: ObjectStore, private readonly clock: Clock) {}

  stagingKey(runId: string, attempt: number, path: string) { return `staging/${runId}/${attempt}/${path}`; }
  revisionPrefix(workspaceId: string, channelId: string, vistaId: string, revisionId: string) { return `artifacts/${workspaceId}/${channelId}/${vistaId}/${revisionId}`; }
  contentType(path: string): string { return CONTENT_TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream'; }

  /** Copies staged files into an immutable prefix (re-hashing each one) and commits metadata atomically. */
  async commitRun(run: RunRow, manifest: Manifest, attempt: number): Promise<{ vistaId: string; revisionId: string }> {
    const vistaId = randomId('v');
    const revisionId = randomId('rev');
    const prefix = this.revisionPrefix(run.workspace_id, run.channel_id, vistaId, revisionId);
    for (const file of manifest.files) {
      const obj = await this.store.get(this.stagingKey(run.id, attempt, file.path));
      if (!obj) throw new Error(`staged object missing: ${file.path}`);
      if ((await sha256Hex(obj.body)) !== file.sha256) throw new Error(`staged object hash changed: ${file.path}`);
      await this.store.put(`${prefix}/${file.path}`, obj.body, this.contentType(file.path));
    }
    const now = iso(this.clock.now());
    const results = await this.db.batch([
      { sql: 'INSERT INTO vistas (id, workspace_id, channel_id, latest_revision_id, created_at) VALUES (?,?,?,?,?)', params: [vistaId, run.workspace_id, run.channel_id, revisionId, now] },
      { sql: 'INSERT INTO revisions (id, vista_id, run_id, manifest_json, artifact_prefix, created_at) VALUES (?,?,?,?,?,?)', params: [revisionId, vistaId, run.id, JSON.stringify(manifest), prefix, now] },
      { sql: 'INSERT INTO feed_entries (id, workspace_id, channel_id, vista_id, revision_id, created_at) VALUES (?,?,?,?,?,?)', params: [randomId('fe'), run.workspace_id, run.channel_id, vistaId, revisionId, now] },
      { sql: `UPDATE runs SET status = 'READY', phase = 'DONE', vista_id = ?, lease_until = NULL, updated_at = ? WHERE id = ? AND attempt = ?`, params: [vistaId, now, run.id, attempt] },
    ]);
    if (results[3].changes !== 1) throw new Error('run commit raced');
    for (const file of manifest.files) await this.store.delete(this.stagingKey(run.id, attempt, file.path));
    return { vistaId, revisionId };
  }

  /** Copies a committed revision into another workspace (fork). The copy keeps origin references. */
  async copyRevision(source: { vista: VistaRow; revision: RevisionRow }, target: { workspaceId: string; channelId: string }): Promise<{ vistaId: string; revisionId: string }> {
    const manifest = JSON.parse(source.revision.manifest_json) as Manifest;
    const vistaId = randomId('v');
    const revisionId = randomId('rev');
    const prefix = this.revisionPrefix(target.workspaceId, target.channelId, vistaId, revisionId);
    for (const file of manifest.files) {
      const obj = await this.store.get(`${source.revision.artifact_prefix}/${file.path}`);
      if (!obj) throw new Error(`origin object missing: ${file.path}`);
      await this.store.put(`${prefix}/${file.path}`, obj.body, this.contentType(file.path));
    }
    const now = iso(this.clock.now());
    await this.db.batch([
      { sql: 'INSERT INTO vistas (id, workspace_id, channel_id, latest_revision_id, origin_vista_id, origin_channel_id, origin_workspace_id, created_at) VALUES (?,?,?,?,?,?,?,?)', params: [vistaId, target.workspaceId, target.channelId, revisionId, source.vista.id, source.vista.channel_id, source.vista.workspace_id, now] },
      { sql: 'INSERT INTO revisions (id, vista_id, run_id, manifest_json, artifact_prefix, created_at) VALUES (?,?,NULL,?,?,?)', params: [revisionId, vistaId, source.revision.manifest_json, prefix, now] },
      { sql: 'INSERT INTO feed_entries (id, workspace_id, channel_id, vista_id, revision_id, created_at) VALUES (?,?,?,?,?,?)', params: [randomId('fe'), target.workspaceId, target.channelId, vistaId, revisionId, now] },
    ]);
    return { vistaId, revisionId };
  }

  async revision(revisionId: string): Promise<RevisionRow | null> { return this.db.first<RevisionRow>('SELECT * FROM revisions WHERE id = ?', [revisionId]); }
  async vista(vistaId: string): Promise<VistaRow | null> { return this.db.first<VistaRow>('SELECT * FROM vistas WHERE id = ?', [vistaId]); }

  /** Deletes staging objects older than ttl (housekeeping; never touches committed revisions). */
  async gcStaging(ttlMs: number): Promise<number> {
    const cutoff = iso(new Date(this.clock.now().getTime() - ttlMs));
    const stale = await this.db.all<{ run_id: string; attempt: number; object_key: string }>(
      `SELECT s.run_id, s.attempt, s.object_key FROM staged_files s JOIN runs r ON r.id = s.run_id WHERE r.updated_at < ? AND r.status IN ('READY','FAILED','SKIPPED')`, [cutoff]);
    for (const s of stale) { await this.store.delete(s.object_key); await this.db.run('DELETE FROM staged_files WHERE run_id = ? AND attempt = ? AND object_key = ?', [s.run_id, s.attempt, s.object_key]); }
    return stale.length;
  }
}
