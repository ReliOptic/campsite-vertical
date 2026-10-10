import * as c from '@campsite/contracts';
import type { Clock, Db } from '../ports';
import type { Gateway } from './gateway';
import type { Manifest, Principal, RevisionRow, VistaRow } from './types';
import { makeCursor, notFound, parseCursor } from './util';

const PAGE = 20;
interface FeedRow { fe_id: string; fe_created_at: string; channel_id: string; channel_title: string; vista_id: string; revision_id: string; manifest_json: string; workspace_id: string; access_version: number; origin_vista_id: string | null; origin_channel_id: string | null; origin_workspace_id: string | null; published: number }

/** For Me feed, vista reads and access checks (owner or published). */
export class Feed {
  constructor(private readonly db: Db, private readonly clock: Clock, readonly gateway: Gateway) {}

  async forMe(p: Principal, cursor: string | null): Promise<c.FeedResponse> {
    const cur = parseCursor(cursor);
    const rows = await this.db.all<FeedRow>(
      `SELECT fe.id AS fe_id, fe.created_at AS fe_created_at, fe.channel_id, ch.title AS channel_title, v.id AS vista_id, v.workspace_id, v.access_version,
              v.origin_vista_id, v.origin_channel_id, v.origin_workspace_id, rv.id AS revision_id, rv.manifest_json,
              EXISTS(SELECT 1 FROM publications pb WHERE pb.vista_id = v.id) AS published
       FROM feed_entries fe JOIN vistas v ON v.id = fe.vista_id JOIN revisions rv ON rv.id = fe.revision_id JOIN channels ch ON ch.id = fe.channel_id
       WHERE fe.workspace_id = ? ${cur ? 'AND (fe.created_at < ? OR (fe.created_at = ? AND fe.id < ?))' : ''}
       ORDER BY fe.created_at DESC, fe.id DESC LIMIT ?`,
      cur ? [p.workspaceId, cur.createdAt, cur.createdAt, cur.id, PAGE + 1] : [p.workspaceId, PAGE + 1]);
    const page = rows.slice(0, PAGE);
    const items = [];
    for (const r of page) items.push(await this.toFeedItem(r));
    const last = page[page.length - 1];
    return c.FeedResponse.parse({ items, nextCursor: rows.length > PAGE && last ? makeCursor(last.fe_created_at, last.fe_id) : null });
  }

  async toFeedItem(r: FeedRow): Promise<c.FeedItemData> {
    const manifest = JSON.parse(r.manifest_json) as Manifest;
    const { token } = await this.gateway.issue({ id: r.vista_id, workspace_id: r.workspace_id, channel_id: r.channel_id, latest_revision_id: r.revision_id, access_version: r.access_version, origin_vista_id: r.origin_vista_id, origin_channel_id: r.origin_channel_id, origin_workspace_id: r.origin_workspace_id, created_at: r.fe_created_at }, r.revision_id);
    return {
      vistaId: r.vista_id, revisionId: r.revision_id, channelId: r.channel_id, channelTitle: r.channel_title, title: manifest.title, summary: manifest.summary,
      posterUrl: this.gateway.urls(token).posterUrl, aspect: manifest.aspect, ...(manifest.features ? { features: manifest.features } : {}),
      published: r.published === 1, origin: r.origin_vista_id ? { vistaId: r.origin_vista_id, channelId: r.origin_channel_id!, workspaceId: r.origin_workspace_id! } : null, createdAt: r.fe_created_at,
    };
  }

  /** Vista readable by the caller: owned, or explicitly published. */
  async accessible(p: Principal, vistaId: string): Promise<{ vista: VistaRow; revision: RevisionRow; owned: boolean; published: boolean }> {
    const vista = await this.db.first<VistaRow>('SELECT * FROM vistas WHERE id = ?', [vistaId]);
    if (!vista) throw notFound();
    const published = !!(await this.db.first('SELECT 1 AS one FROM publications WHERE vista_id = ?', [vistaId]));
    const owned = vista.workspace_id === p.workspaceId;
    if (!owned && !published) throw notFound();
    const revision = await this.db.first<RevisionRow>('SELECT * FROM revisions WHERE id = ?', [vista.latest_revision_id]);
    if (!revision) throw notFound();
    return { vista, revision, owned, published };
  }

  async vista(p: Principal, vistaId: string): Promise<c.VistaResponse> {
    const { vista, revision, owned, published } = await this.accessible(p, vistaId);
    const manifest = JSON.parse(revision.manifest_json) as Manifest;
    const { token, expiresAt } = await this.gateway.issue(vista, revision.id);
    const urls = this.gateway.urls(token);
    return c.VistaResponse.parse({
      vistaId: vista.id, revisionId: revision.id, channelId: vista.channel_id, title: manifest.title, summary: manifest.summary, aspect: manifest.aspect,
      ...(manifest.features ? { features: manifest.features } : {}), ...(manifest.scenes ? { scenes: manifest.scenes } : {}), ...(manifest.captions ? { captions: manifest.captions } : {}),
      playUrl: urls.playUrl, posterUrl: urls.posterUrl, expiresAt, published, owned,
      origin: vista.origin_vista_id ? { vistaId: vista.origin_vista_id, channelId: vista.origin_channel_id!, workspaceId: vista.origin_workspace_id! } : null,
      durationHintMs: manifest.durationHintMs,
    });
  }

  async latestPosterForChannels(p: Principal, channelIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const chId of channelIds) {
      const v = await this.db.first<VistaRow>('SELECT * FROM vistas WHERE channel_id = ? AND workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [chId, p.workspaceId]);
      if (!v) continue;
      const { token } = await this.gateway.issue(v, v.latest_revision_id);
      out.set(chId, this.gateway.urls(token).posterUrl);
    }
    return out;
  }
}
