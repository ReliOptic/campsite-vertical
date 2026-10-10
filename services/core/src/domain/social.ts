import * as c from '@campsite/contracts';
import type { Clock, Db } from '../ports';
import type { Artifacts } from './artifacts';
import type { Channels } from './channels';
import type { Feed } from './feed';
import type { Identity } from './identity';
import type { Runs } from './runs';
import type { Manifest, Principal } from './types';
import { invalid, iso, makeCursor, notFound, parseCursor, randomId } from './util';

const PAGE = 20;

/** Publication (Q2), discovery, cross-account subscription and fork (Q1). */
export class Social {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly identity: Identity, private readonly runs: Runs, private readonly channels: Channels, private readonly artifacts: Artifacts, private readonly feed: Feed) {}
  private now() { return iso(this.clock.now()); }

  async publish(p: Principal, vistaId: string): Promise<c.PublishResponse> {
    const vista = await this.db.first<{ id: string; channel_id: string; latest_revision_id: string }>('SELECT id, channel_id, latest_revision_id FROM vistas WHERE id = ? AND workspace_id = ?', [vistaId, p.workspaceId]);
    if (!vista) throw notFound();
    const id = randomId('pub'); const now = this.now();
    await this.db.run('INSERT OR IGNORE INTO publications (id, vista_id, workspace_id, channel_id, revision_id, published_at) VALUES (?,?,?,?,?,?)', [id, vistaId, p.workspaceId, vista.channel_id, vista.latest_revision_id, now]);
    const row = await this.db.first<{ id: string; published_at: string }>('SELECT id, published_at FROM publications WHERE vista_id = ?', [vistaId]);
    return c.PublishResponse.parse({ vistaId, publicationId: row!.id, publishedAt: row!.published_at });
  }

  /** Unpublish removes the publication and bumps access_version so previously issued links stop working. */
  async unpublish(p: Principal, vistaId: string): Promise<c.VistaResponse> {
    const vista = await this.db.first<{ id: string }>('SELECT id FROM vistas WHERE id = ? AND workspace_id = ?', [vistaId, p.workspaceId]);
    if (!vista) throw notFound();
    await this.db.batch([
      { sql: 'DELETE FROM publications WHERE vista_id = ?', params: [vistaId] },
      { sql: 'UPDATE vistas SET access_version = access_version + 1 WHERE id = ?', params: [vistaId] },
    ]);
    return this.feed.vista(p, vistaId);
  }

  async discovery(p: Principal, cursor: string | null): Promise<c.DiscoveryResponse> {
    const cur = parseCursor(cursor);
    const rows = await this.db.all<{ pub_id: string; published_at: string; fe_id: string; fe_created_at: string; channel_id: string; channel_title: string; vista_id: string; revision_id: string; manifest_json: string; workspace_id: string; access_version: number; origin_vista_id: string | null; origin_channel_id: string | null; origin_workspace_id: string | null; subscribed: number; fork_count: number }>(
      `SELECT pb.id AS pub_id, pb.published_at, fe.id AS fe_id, fe.created_at AS fe_created_at, pb.channel_id, ch.title AS channel_title, v.id AS vista_id, pb.revision_id, rv.manifest_json,
              v.workspace_id, v.access_version, v.origin_vista_id, v.origin_channel_id, v.origin_workspace_id,
              EXISTS(SELECT 1 FROM subscriptions s WHERE s.subscriber_workspace_id = ? AND s.channel_id = pb.channel_id) AS subscribed,
              (SELECT COUNT(*) FROM forks fk WHERE fk.origin_vista_id = v.id) AS fork_count
       FROM publications pb JOIN vistas v ON v.id = pb.vista_id JOIN revisions rv ON rv.id = pb.revision_id JOIN channels ch ON ch.id = pb.channel_id
       LEFT JOIN feed_entries fe ON fe.revision_id = pb.revision_id
       WHERE pb.workspace_id != ? ${cur ? 'AND (pb.published_at < ? OR (pb.published_at = ? AND pb.id < ?))' : ''}
       ORDER BY pb.published_at DESC, pb.id DESC LIMIT ?`,
      cur ? [p.workspaceId, p.workspaceId, cur.createdAt, cur.createdAt, cur.id, PAGE + 1] : [p.workspaceId, p.workspaceId, PAGE + 1]);
    const page = rows.slice(0, PAGE);
    const items = [];
    for (const r of page) {
      const base = await this.feed.toFeedItem({ ...r, published: 1, fe_id: r.fe_id ?? r.pub_id, fe_created_at: r.fe_created_at ?? r.published_at });
      items.push({ ...base, publisher: await this.identity.publisher(r.workspace_id), publishedAt: r.published_at, subscribed: r.subscribed === 1, forkCount: r.fork_count });
    }
    const last = page[page.length - 1];
    return c.DiscoveryResponse.parse({ items, nextCursor: rows.length > PAGE && last ? makeCursor(last.published_at, last.pub_id) : null });
  }

  /** A channel is subscribable when it is someone else's and has at least one publication. */
  async subscribe(p: Principal, input: unknown): Promise<c.SubscriptionsResponse> {
    const parsed = c.Subscribe.safeParse(input);
    if (!parsed.success) throw invalid('bad subscription');
    const ch = await this.db.first<{ workspace_id: string }>('SELECT ch.workspace_id FROM channels ch WHERE ch.id = ? AND EXISTS(SELECT 1 FROM publications pb WHERE pb.channel_id = ch.id)', [parsed.data.channelId]);
    if (!ch || ch.workspace_id === p.workspaceId) throw notFound();
    await this.db.run('INSERT OR IGNORE INTO subscriptions (subscriber_workspace_id, channel_id, subscribed_at) VALUES (?,?,?)', [p.workspaceId, parsed.data.channelId, this.now()]);
    return this.subscriptions(p);
  }
  async unsubscribe(p: Principal, channelId: string): Promise<c.SubscriptionsResponse> {
    await this.db.run('DELETE FROM subscriptions WHERE subscriber_workspace_id = ? AND channel_id = ?', [p.workspaceId, channelId]);
    return this.subscriptions(p);
  }
  async subscriptions(p: Principal): Promise<c.SubscriptionsResponse> {
    const rows = await this.db.all<{ channel_id: string; title: string; workspace_id: string; subscribed_at: string }>(
      'SELECT s.channel_id, ch.title, ch.workspace_id, s.subscribed_at FROM subscriptions s JOIN channels ch ON ch.id = s.channel_id WHERE s.subscriber_workspace_id = ? ORDER BY s.subscribed_at DESC', [p.workspaceId]);
    const items = [];
    for (const r of rows) {
      // Only published Vistas of the channel are visible to subscribers.
      const latest = await this.db.first<{ vista_id: string; workspace_id: string; access_version: number; revision_id: string; channel_id: string; created_at: string }>(
        'SELECT pb.vista_id, v.workspace_id, v.access_version, pb.revision_id, pb.channel_id, v.created_at FROM publications pb JOIN vistas v ON v.id = pb.vista_id WHERE pb.channel_id = ? ORDER BY pb.published_at DESC LIMIT 1', [r.channel_id]);
      let latestPosterUrl: string | null = null;
      if (latest) {
        const { token } = await this.feed.gateway.issue({ id: latest.vista_id, workspace_id: latest.workspace_id, channel_id: latest.channel_id, latest_revision_id: latest.revision_id, access_version: latest.access_version, origin_vista_id: null, origin_channel_id: null, origin_workspace_id: null, created_at: latest.created_at }, latest.revision_id);
        latestPosterUrl = this.feed.gateway.urls(token).posterUrl;
      }
      items.push({ channelId: r.channel_id, title: r.title, publisher: await this.identity.publisher(r.workspace_id), subscribedAt: r.subscribed_at, latestVistaId: latest?.vista_id ?? null, latestPosterUrl });
    }
    return c.SubscriptionsResponse.parse({ items });
  }

  /** Fork = copy the published revision + the channel brief into my workspace, preserving origin. Never copies private context. */
  async fork(p: Principal, input: unknown): Promise<c.ForkResponse> {
    const parsed = c.ForkRequest.safeParse(input);
    if (!parsed.success) throw invalid('bad fork');
    const vista = await this.artifacts.vista(parsed.data.vistaId);
    if (!vista) throw notFound();
    const pub = await this.db.first<{ revision_id: string }>('SELECT revision_id FROM publications WHERE vista_id = ?', [vista.id]);
    if (!pub || vista.workspace_id === p.workspaceId) throw notFound();
    const revision = await this.artifacts.revision(pub.revision_id);
    const originChannel = await this.db.first<{ title: string; brief: string }>('SELECT title, brief FROM channels WHERE id = ?', [vista.channel_id]);
    if (!revision || !originChannel) throw notFound();
    const channelId = await this.channels.insertRaw(p, { title: originChannel.title, brief: originChannel.brief, origin: { channelId: vista.channel_id, workspaceId: vista.workspace_id } });
    const copy = await this.artifacts.copyRevision({ vista, revision }, { workspaceId: p.workspaceId, channelId });
    await this.db.run('INSERT INTO forks (id, origin_vista_id, fork_vista_id, fork_workspace_id, created_at) VALUES (?,?,?,?,?)', [randomId('fk'), vista.id, copy.vistaId, p.workspaceId, this.now()]);
    let runId: string | null = null;
    if (parsed.data.rerun) {
      await this.runs.requireModel(p.workspaceId);
      await this.runs.reserveQuota(p.workspaceId, c.profiles[p.plan].dailyRunCap);
      runId = await this.runs.insertQueued(p, channelId, originChannel.brief, 'fork');
      if (!runId) await this.runs.releaseQuota(p.workspaceId);
    }
    return c.ForkResponse.parse({ channelId, vistaId: copy.vistaId, runId });
  }

  async manifestOf(revisionId: string): Promise<Manifest | null> {
    const r = await this.artifacts.revision(revisionId);
    return r ? (JSON.parse(r.manifest_json) as Manifest) : null;
  }
}
