import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam, SqlResult, SqlStatement } from '../ports';

/** Db port over Node's built-in SQLite. Same SQL dialect as Cloudflare D1. */
export class NodeSqliteDb implements Db {
  readonly db: DatabaseSync;
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  }
  async run(sql: string, params: SqlParam[] = []): Promise<SqlResult> {
    const r = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(r.changes) };
  }
  async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }
  async first<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    const row = this.db.prepare(sql).get(...(params as never[]));
    return (row as T) ?? null;
  }
  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    const out: SqlResult[] = [];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const s of statements) {
        const r = this.db.prepare(s.sql).run(...((s.params ?? []) as never[]));
        out.push({ changes: Number(r.changes) });
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return out;
  }
  async exec(sql: string): Promise<void> { this.db.exec(sql); }
  close() { this.db.close(); }
}
