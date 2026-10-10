import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrap } from './bootstrap';
import { playwrightValidator, sharedChromium } from './playwright-validator';
import type { CoreConfig, CoreSecrets } from '../ports';

/** Converts a Node request into a Fetch Request (same handler as the Worker). */
export function toRequest(req: IncomingMessage, origin: string): Request {
  const url = new URL(req.url ?? '/', origin);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(', '));
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as unknown as ReadableStream);
  return new Request(url, { method, headers, body, ...(body ? { duplex: 'half' } : {}) } as RequestInit);
}
export async function sendResponse(res: ServerResponse, out: Response) {
  res.statusCode = out.status;
  out.headers.forEach((v, k) => { if (k === 'set-cookie') res.appendHeader('Set-Cookie', v); else res.setHeader(k, v); });
  const buf = Buffer.from(await out.arrayBuffer());
  res.end(buf);
}

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

export interface ServerOptions { appPort: number; vistaPort: number; host?: string; webDist?: string; dbPath?: string; storeDir?: string; provider?: 'stub' | 'openrouter'; devAccounts?: boolean; secrets?: Partial<CoreSecrets>; openRouterBaseUrl?: string; log?: (e: Record<string, unknown>) => void }

export async function startServer(opts: ServerOptions) {
  const host = opts.host ?? '127.0.0.1';
  const appOrigin = `http://${host}:${opts.appPort}`;
  const vistaOrigin = `http://${host}:${opts.vistaPort}`;
  const config: CoreConfig = { appOrigin, vistaOrigin, cookieSecure: false, devAccounts: opts.devAccounts ?? true, openRouterBaseUrl: opts.openRouterBaseUrl ?? process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1', leaseSeconds: 90, capabilityTtlSeconds: 600,
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, redirectUri: `${appOrigin}/auth/google/callback` } } : {}) };
  const secrets: CoreSecrets = { sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-me-0000000', vistaSigningSecret: process.env.VISTA_SIGNING_SECRET ?? 'dev-vista-secret-change-me-00000000', modelKeySecret: process.env.MODEL_KEY_SECRET ?? 'dev-model-key-secret-change-me-0000', ...opts.secrets };
  const core = bootstrap({ config, secrets, dbPath: opts.dbPath, storeDir: opts.storeDir, provider: opts.provider ?? (process.env.MODEL_PROVIDER === 'openrouter' ? 'openrouter' : 'stub'), validator: playwrightValidator(sharedChromium), realTimers: true, log: opts.log ?? (e => console.log(JSON.stringify(e))) });
  const webDist = opts.webDist ?? resolve(fileURLToPath(new URL('../../../../apps/web/dist', import.meta.url)));

  const serveStatic = (pathname: string): Response | null => {
    if (!existsSync(webDist)) return null;
    let file = join(webDist, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(webDist)) return null;
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(webDist, 'index.html');
    if (!existsSync(file)) return null;
    const ext = extname(file);
    return new Response(readFileSync(file), { headers: { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' } });
  };

  const appServer = createServer(async (req, res) => {
    try {
      const request = toRequest(req, appOrigin);
      const url = new URL(request.url);
      if (url.pathname.startsWith('/v/')) { await sendResponse(res, new Response('not found', { status: 404 })); return; }
      const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/runner/');
      if (!isApi) { const s = serveStatic(url.pathname); if (s) { await sendResponse(res, s); return; } }
      await sendResponse(res, await core.app.fetch(request));
    } catch (e) { res.statusCode = 500; res.end('internal'); console.error(e); }
  });
  const vistaServer = createServer(async (req, res) => {
    try {
      const request = toRequest(req, vistaOrigin);
      if (!new URL(request.url).pathname.startsWith('/v/')) { await sendResponse(res, new Response('not found', { status: 404 })); return; }
      await sendResponse(res, await core.app.fetch(request));
    } catch (e) { res.statusCode = 500; res.end('internal'); console.error(e); }
  });
  await new Promise<void>(r => appServer.listen(opts.appPort, host, r));
  await new Promise<void>(r => vistaServer.listen(opts.vistaPort, host, r));
  const sweeper = setInterval(() => { core.runtime.sweep().catch(e => console.error('[sweep]', e)); }, 60_000);
  sweeper.unref();
  const close = async () => { clearInterval(sweeper); core.runtime.stop(); await new Promise(r => appServer.close(r)); await new Promise(r => vistaServer.close(r)); };
  return { core, appOrigin, vistaOrigin, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const appPort = Number(process.env.APP_PORT ?? 8787), vistaPort = Number(process.env.VISTA_PORT ?? 8788);
  startServer({ appPort, vistaPort, dbPath: process.env.CAMPSITE_DB ?? './.campsite/core.sqlite', storeDir: process.env.CAMPSITE_STORE ?? './.campsite/store', devAccounts: process.env.AUTH_DEV_ACCOUNTS !== '0' })
    .then(s => { console.log(`Campsite core: app ${s.appOrigin} · vista ${s.vistaOrigin} · provider ${s.core.provider.name}`); })
    .catch(e => { console.error(e); process.exit(1); });
}
