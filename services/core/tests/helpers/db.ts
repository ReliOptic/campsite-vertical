import { readFileSync } from 'node:fs';
import { NodeSqliteDb } from '../../src/adapters/node-sqlite';
import { MemoryStore } from '../../src/adapters/local-store';
import type { Clock, CoreConfig, CoreSecrets } from '../../src/ports';
export function testDb(): NodeSqliteDb {
  const db = new NodeSqliteDb(':memory:');
  db.db.exec(readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8'));
  return db;
}
export class FakeClock implements Clock { constructor(public t = new Date('2026-10-10T00:00:00.000Z')) {} now() { return new Date(this.t); } tick(ms: number) { this.t = new Date(this.t.getTime() + ms); } }
export const testSecrets: CoreSecrets = { sessionSecret: 's'.repeat(32), vistaSigningSecret: 'v'.repeat(32), modelKeySecret: 'm'.repeat(32) };
export const testConfig: CoreConfig = { appOrigin: 'http://app.test', vistaOrigin: 'http://vista.test', cookieSecure: false, devAccounts: true, openRouterBaseUrl: 'http://fake.openrouter.test/api/v1', leaseSeconds: 90, capabilityTtlSeconds: 600 };
export const store = () => new MemoryStore();
