// Ports: the few environment capabilities the domain needs. Cloudflare bindings and local
// Node adapters implement the same interfaces so one domain runs in both places.
export type SqlParam = string | number | null | Uint8Array;
export interface SqlStatement { sql: string; params?: SqlParam[] }
export interface SqlResult { changes: number }
export interface Db {
  run(sql: string, params?: SqlParam[]): Promise<SqlResult>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  first<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /** Executes statements atomically (D1 batch / SQLite transaction). Returns per-statement change counts. */
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
  /** Runs DDL (migrations). */
  exec(sql: string): Promise<void>;
}
export interface StoredObject { body: Uint8Array; contentType?: string; size: number }
export interface ObjectStore {
  put(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
export interface CoreSecrets {
  sessionSecret: string;
  vistaSigningSecret: string;
  modelKeySecret: string;
}
export interface CoreConfig {
  appOrigin: string;        // e.g. https://app.campsite.example
  vistaOrigin: string;      // e.g. https://vista.campsite.example (separate registrable domain)
  cookieSecure: boolean;
  devAccounts: boolean;     // enables POST /auth/dev/login
  google?: { clientId: string; clientSecret: string; redirectUri: string };
  openRouterBaseUrl: string; // https://openrouter.ai/api/v1 (overridable for local fakes)
  leaseSeconds: number;
  capabilityTtlSeconds: number;
}
