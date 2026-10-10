import type { Db, Clock } from '../ports';
import type { ExternalIdentity } from '../domain/identity';
import { ApiError, b64url, b64urlDecode, iso, randomToken, sha256Hex } from '../domain/util';

/** Google OpenID Connect: Authorization Code + PKCE, state, nonce, server-side ID token verification (RS256 via JWKS). */
export class GoogleOidc {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly cfg: { clientId: string; clientSecret: string; redirectUri: string }, private readonly fetchImpl: typeof fetch = fetch,
    private readonly endpoints = { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'] }) {}

  async start(): Promise<string> {
    const state = randomToken(24), nonce = randomToken(24), verifier = randomToken(48);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    await this.db.run('INSERT INTO oauth_states (state, nonce, code_verifier, created_at) VALUES (?,?,?,?)', [state, nonce, verifier, iso(this.clock.now())]);
    const u = new URL(this.endpoints.auth);
    u.search = new URLSearchParams({ client_id: this.cfg.clientId, redirect_uri: this.cfg.redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return u.toString();
  }

  async callback(code: string, state: string): Promise<ExternalIdentity> {
    const row = await this.db.first<{ nonce: string; code_verifier: string; created_at: string }>('SELECT nonce, code_verifier, created_at FROM oauth_states WHERE state = ?', [state]);
    await this.db.run('DELETE FROM oauth_states WHERE state = ?', [state]);
    if (!row || new Date(row.created_at).getTime() < this.clock.now().getTime() - 10 * 60_000) throw new ApiError('INVALID_REQUEST', 400, 'bad state');
    const tokenRes = await this.fetchImpl(this.endpoints.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, redirect_uri: this.cfg.redirectUri, grant_type: 'authorization_code', code_verifier: row.code_verifier }) });
    if (!tokenRes.ok) throw new ApiError('UNAUTHENTICATED', 401, 'token exchange failed');
    const { id_token } = await tokenRes.json() as { id_token?: string };
    if (!id_token) throw new ApiError('UNAUTHENTICATED', 401, 'no id_token');
    const claims = await this.verifyIdToken(id_token, row.nonce);
    return { provider: 'google', subject: claims.sub, email: claims.email, name: claims.name ?? claims.email, avatarUrl: claims.picture ?? null };
  }

  async verifyIdToken(idToken: string, expectedNonce: string): Promise<{ sub: string; email: string; name?: string; picture?: string }> {
    const [h, p, s] = idToken.split('.');
    if (!h || !p || !s) throw new ApiError('UNAUTHENTICATED', 401, 'malformed token');
    const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h))) as { alg: string; kid: string };
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as { iss: string; aud: string; exp: number; iat: number; nonce?: string; sub: string; email: string; email_verified?: boolean; name?: string; picture?: string };
    if (header.alg !== 'RS256') throw new ApiError('UNAUTHENTICATED', 401, 'alg');
    const jwks = await (await this.fetchImpl(this.endpoints.jwks)).json() as { keys: (JsonWebKey & { kid: string })[] };
    const jwk = jwks.keys.find(k => k.kid === header.kid);
    if (!jwk) throw new ApiError('UNAUTHENTICATED', 401, 'unknown kid');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s) as BufferSource, new TextEncoder().encode(`${h}.${p}`) as BufferSource);
    const now = Math.floor(this.clock.now().getTime() / 1000);
    if (!ok || !this.endpoints.issuers.includes(claims.iss) || claims.aud !== this.cfg.clientId || claims.exp <= now || claims.nonce !== expectedNonce || claims.email_verified !== true) throw new ApiError('UNAUTHENTICATED', 401, 'claims');
    return claims;
  }

  static async fingerprint(idToken: string) { return sha256Hex(idToken); }
}
