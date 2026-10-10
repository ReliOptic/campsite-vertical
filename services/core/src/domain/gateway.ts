import * as c from '@campsite/contracts';
import type { Clock, CoreConfig, CoreSecrets, Db } from '../ports';
import type { Manifest, RevisionRow, VistaRow } from './types';
import { b64url, b64urlDecode, hmacSign, iso, timingSafeEqual } from './util';

interface CapabilityPayload { v: string; r: string; w: string; a: number; e: number }
export interface ResolvedAsset { objectKey: string; contentType: string; vistaId: string; revisionId: string }

/** Signed, short-lived capability URLs for the separate Vista origin. Whole-prefix signing keeps relative assets working. */
export class Gateway {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly secrets: CoreSecrets, private readonly config: CoreConfig) {}

  async issue(vista: VistaRow, revisionId: string): Promise<{ token: string; expiresAt: string }> {
    const exp = Math.floor(this.clock.now().getTime() / 1000) + this.config.capabilityTtlSeconds;
    const payload: CapabilityPayload = { v: vista.id, r: revisionId, w: vista.workspace_id, a: vista.access_version, e: exp };
    const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
    const sig = await hmacSign(this.secrets.vistaSigningSecret, 'vista-capability', body);
    return { token: `${body}.${sig}`, expiresAt: iso(new Date(exp * 1000)) };
  }

  urls(token: string) {
    return { playUrl: `${this.config.vistaOrigin}/v/${token}/index.html`, posterUrl: `${this.config.vistaOrigin}/v/${token}/poster.png` };
  }

  /** Verifies signature, expiry, revocation (access_version) and the manifest allowlist. */
  async resolve(token: string, path: string): Promise<ResolvedAsset | null> {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot), sig = token.slice(dot + 1);
    const expected = await hmacSign(this.secrets.vistaSigningSecret, 'vista-capability', body);
    if (!timingSafeEqual(sig, expected)) return null;
    let payload: CapabilityPayload;
    try { payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))); } catch { return null; }
    if (typeof payload.e !== 'number' || payload.e * 1000 <= this.clock.now().getTime()) return null;
    if (!c.ArtifactPath.safeParse(path).success) return null;
    const vista = await this.db.first<VistaRow>('SELECT * FROM vistas WHERE id = ?', [payload.v]);
    if (!vista || vista.workspace_id !== payload.w || vista.access_version !== payload.a) return null;
    const revision = await this.db.first<RevisionRow>('SELECT * FROM revisions WHERE id = ? AND vista_id = ?', [payload.r, vista.id]);
    if (!revision) return null;
    const manifest = JSON.parse(revision.manifest_json) as Manifest;
    if (!manifest.files.some(f => f.path === path)) return null;
    return { objectKey: `${revision.artifact_prefix}/${path}`, contentType: contentTypeFor(path), vistaId: vista.id, revisionId: revision.id };
  }

  /** Response headers for served Vista assets: strict CSP, no network, framed only by the app origin. */
  assetHeaders(contentType: string): Record<string, string> {
    return {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'private, no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Content-Security-Policy': `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'; frame-ancestors ${this.config.appOrigin}`,
    };
  }
}
const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
export function contentTypeFor(path: string): string { return TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream'; }
