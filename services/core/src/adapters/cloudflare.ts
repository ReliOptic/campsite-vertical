// Cloudflare binding adapters. Minimal structural types are declared here because
// @cloudflare/workers-types is not vendored; they match the documented D1/R2 Worker APIs.
import type { Db, ObjectStore, SqlParam, SqlResult, SqlStatement, StoredObject } from '../ports';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<{ results?: T[]; meta: { changes?: number; rows_written?: number } }>;
  all<T = unknown>(): Promise<{ results: T[]; meta: { changes?: number } }>;
  first<T = unknown>(): Promise<T | null>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ results?: T[]; meta: { changes?: number; rows_written?: number } }[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
}
export interface R2ObjectBody { arrayBuffer(): Promise<ArrayBuffer>; size: number; httpMetadata?: { contentType?: string } }
export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
}

export class D1Db implements Db {
  constructor(private readonly d1: D1Database) {}
  async run(sql: string, params: SqlParam[] = []): Promise<SqlResult> {
    const r = await this.d1.prepare(sql).bind(...params).run();
    return { changes: r.meta.changes ?? r.meta.rows_written ?? 0 };
  }
  async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return (await this.d1.prepare(sql).bind(...params).all<T>()).results;
  }
  async first<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    return this.d1.prepare(sql).bind(...params).first<T>();
  }
  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    const rs = await this.d1.batch(statements.map(s => this.d1.prepare(s.sql).bind(...(s.params ?? []))));
    return rs.map(r => ({ changes: r.meta.changes ?? r.meta.rows_written ?? 0 }));
  }
  async exec(sql: string): Promise<void> { await this.d1.exec(sql); }
}

export class R2Store implements ObjectStore {
  constructor(private readonly bucket: R2Bucket) {}
  async put(key: string, body: Uint8Array, contentType?: string) { await this.bucket.put(key, body, contentType ? { httpMetadata: { contentType } } : undefined); }
  async get(key: string): Promise<StoredObject | null> {
    const o = await this.bucket.get(key);
    if (!o) return null;
    return { body: new Uint8Array(await o.arrayBuffer()), size: o.size, contentType: o.httpMetadata?.contentType };
  }
  async head(key: string) { return this.bucket.head(key); }
  async delete(key: string) { await this.bucket.delete(key); }
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, cursor });
      keys.push(...page.objects.map(o => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return keys;
  }
}
