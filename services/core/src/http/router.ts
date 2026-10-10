// A small Fetch-API router (no framework available offline). Patterns: '/api/runs/:id', '/v/:token/*path'.
export type Handler<Ctx> = (req: Request, params: Record<string, string>, ctx: Ctx) => Promise<Response> | Response;
interface Route<Ctx> { method: string; regex: RegExp; keys: string[]; handler: Handler<Ctx> }

export class Router<Ctx> {
  private readonly routes: Route<Ctx>[] = [];
  on(method: string, pattern: string, handler: Handler<Ctx>): this {
    const keys: string[] = [];
    const source = pattern.replace(/[:*](\w+)/g, (m, k) => { keys.push(k); return m.startsWith('*') ? '(.+)' : '([^/]+)'; });
    const regex = new RegExp('^' + source + '/?$');
    this.routes.push({ method, regex, keys, handler });
    return this;
  }
  get(p: string, h: Handler<Ctx>) { return this.on('GET', p, h); }
  post(p: string, h: Handler<Ctx>) { return this.on('POST', p, h); }
  put(p: string, h: Handler<Ctx>) { return this.on('PUT', p, h); }
  patch(p: string, h: Handler<Ctx>) { return this.on('PATCH', p, h); }
  delete(p: string, h: Handler<Ctx>) { return this.on('DELETE', p, h); }
  match(method: string, pathname: string): { handler: Handler<Ctx>; params: Record<string, string> } | null {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return null;
  }
  hasPath(pathname: string): boolean { return this.routes.some(r => r.regex.test(pathname)); }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
export const empty = (status = 204, headers: Record<string, string> = {}) => new Response(null, { status, headers });
