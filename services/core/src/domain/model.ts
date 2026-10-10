import * as c from '@campsite/contracts';
import type { Clock, CoreConfig, CoreSecrets, Db } from '../ports';
import type { Principal } from './types';
import { ApiError, b64url, b64urlDecode, iso } from './util';

export interface ExecutionModel { provider: 'openrouter'; modelId: string; apiKey: string }
export type KeyVerifier = (apiKey: string) => Promise<boolean>;
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

/** User-owned model connection (BYOK). Keys are AES-GCM encrypted with a per-workspace derived key. */
export class ModelConnections {
  constructor(private readonly db: Db, private readonly clock: Clock, private readonly secrets: CoreSecrets, private readonly config: CoreConfig, private readonly verifier: KeyVerifier) {}

  private async aesKey(workspaceId: string): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(this.secrets.modelKeySecret), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(`byok:${workspaceId}`), info: new TextEncoder().encode('model-key') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async encrypt(workspaceId: string, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.aesKey(workspaceId), new TextEncoder().encode(plaintext)));
    const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
    return b64url(out);
  }
  async decrypt(workspaceId: string, ciphertext: string): Promise<string> {
    const bytes = b64urlDecode(ciphertext);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await this.aesKey(workspaceId), bytes.slice(12));
    return new TextDecoder().decode(pt);
  }

  async get(p: Principal): Promise<c.ModelResponse> {
    const row = await this.db.first<{ provider: 'openrouter'; model_id: string; key_hint: string; verified_at: string | null; connected_at: string }>('SELECT provider, model_id, key_hint, verified_at, connected_at FROM model_connections WHERE workspace_id = ?', [p.workspaceId]);
    return c.ModelResponse.parse({ connection: row ? { provider: row.provider, modelId: row.model_id, keyHint: row.key_hint, verifiedAt: row.verified_at, connectedAt: row.connected_at } : null, options: c.DEFAULT_MODEL_OPTIONS });
  }

  async connect(p: Principal, input: unknown): Promise<c.ModelResponse> {
    const parsed = c.ConnectModel.safeParse(input);
    if (!parsed.success) throw new ApiError('INVALID_REQUEST', 400, 'bad model connection');
    const { apiKey, modelId = DEFAULT_MODEL, verify } = parsed.data;
    let verifiedAt: string | null = null;
    if (verify) {
      if (!(await this.verifier(apiKey))) throw new ApiError('INVALID_KEY', 400);
      verifiedAt = iso(this.clock.now());
    }
    const now = iso(this.clock.now());
    await this.db.run(
      `INSERT INTO model_connections (workspace_id, provider, model_id, key_ciphertext, key_hint, verified_at, connected_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(workspace_id) DO UPDATE SET provider = excluded.provider, model_id = excluded.model_id, key_ciphertext = excluded.key_ciphertext, key_hint = excluded.key_hint, verified_at = excluded.verified_at, connected_at = excluded.connected_at`,
      [p.workspaceId, 'openrouter', modelId, await this.encrypt(p.workspaceId, apiKey), c.keyHint(apiKey), verifiedAt, now]);
    return this.get(p);
  }

  async disconnect(p: Principal): Promise<c.ModelResponse> {
    await this.db.run('DELETE FROM model_connections WHERE workspace_id = ?', [p.workspaceId]);
    return this.get(p);
  }

  /** Decrypts the key for an execution. Only the runtime calls this; the key never leaves the process. */
  async resolveForExecution(workspaceId: string): Promise<ExecutionModel | null> {
    const row = await this.db.first<{ provider: 'openrouter'; model_id: string; key_ciphertext: string }>('SELECT provider, model_id, key_ciphertext FROM model_connections WHERE workspace_id = ?', [workspaceId]);
    if (!row) return null;
    return { provider: row.provider, modelId: row.model_id, apiKey: await this.decrypt(workspaceId, row.key_ciphertext) };
  }
  async requireForExecution(workspaceId: string): Promise<ExecutionModel> {
    const m = await this.resolveForExecution(workspaceId);
    if (!m) throw new ApiError('MODEL_NOT_CONNECTED', 409);
    return m;
  }
  async isConnected(workspaceId: string): Promise<boolean> {
    return !!(await this.db.first('SELECT 1 AS one FROM model_connections WHERE workspace_id = ?', [workspaceId]));
  }
}

/** Verifies an OpenRouter key by calling GET /key (no model usage, no cost). */
export function openRouterKeyVerifier(baseUrl: string, fetchImpl: typeof fetch = fetch): KeyVerifier {
  return async (apiKey) => {
    try {
      const r = await fetchImpl(`${baseUrl}/key`, { headers: { Authorization: `Bearer ${apiKey}` } });
      return r.ok;
    } catch { return false; }
  };
}
