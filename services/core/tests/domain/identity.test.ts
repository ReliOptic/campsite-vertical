import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, FakeClock, testSecrets } from '../helpers/db';
import { Identity } from '../../src/domain/identity';

test('first login creates exactly one user, workspace, runtime and entitlement; relogin reuses them', async () => {
  const db = testDb(); const clock = new FakeClock();
  const id = new Identity(db, clock, testSecrets);
  const a = await id.loginWithIdentity({ provider: 'dev', subject: 'a@campsite.test', email: 'a@campsite.test', name: 'A', avatarUrl: null });
  const again = await id.loginWithIdentity({ provider: 'dev', subject: 'a@campsite.test', email: 'a@campsite.test', name: 'A renamed', avatarUrl: null });
  assert.equal(a.principal.workspaceId, again.principal.workspaceId);
  assert.equal(a.principal.runtimeId, again.principal.runtimeId);
  assert.notEqual(a.sessionToken, again.sessionToken);
  const rows = await db.all<{ n: number }>('select count(*) as n from workspaces');
  assert.equal(rows[0].n, 1);
  const me = await id.me(a.principal);
  assert.equal(me.user.name, 'A renamed', 'profile fields follow the latest login');
});

test('concurrent first logins for the same identity still yield one workspace', async () => {
  const db = testDb(); const id = new Identity(db, new FakeClock(), testSecrets);
  const results = await Promise.all(Array.from({ length: 5 }, () => id.loginWithIdentity({ provider: 'google', subject: 'sub-1', email: 'g@x.test', name: 'G', avatarUrl: null })));
  assert.equal(new Set(results.map(r => r.principal.workspaceId)).size, 1);
});

test('google subject is the stable identity even when email changes', async () => {
  const db = testDb(); const id = new Identity(db, new FakeClock(), testSecrets);
  const a = await id.loginWithIdentity({ provider: 'google', subject: 'sub-9', email: 'old@x.test', name: 'X', avatarUrl: null });
  const b = await id.loginWithIdentity({ provider: 'google', subject: 'sub-9', email: 'new@x.test', name: 'X', avatarUrl: null });
  assert.equal(a.principal.userId, b.principal.userId);
});

test('sessions: resolve, expire, revoke; tampered tokens never resolve', async () => {
  const db = testDb(); const clock = new FakeClock(); const id = new Identity(db, clock, testSecrets);
  const { sessionToken, principal } = await id.loginWithIdentity({ provider: 'dev', subject: 'b@campsite.test', email: 'b@campsite.test', name: 'B', avatarUrl: null });
  assert.equal((await id.resolveSession(sessionToken))?.workspaceId, principal.workspaceId);
  assert.equal(await id.resolveSession(sessionToken.slice(0, -2) + 'zz'), null);
  await id.logout(sessionToken);
  assert.equal(await id.resolveSession(sessionToken), null);
  const s2 = await id.loginWithIdentity({ provider: 'dev', subject: 'b@campsite.test', email: 'b@campsite.test', name: 'B', avatarUrl: null });
  clock.tick(31 * 24 * 3600 * 1000);
  assert.equal(await id.resolveSession(s2.sessionToken), null, 'expired');
});

test('three independent accounts get three isolated workspaces and runtimes', async () => {
  const db = testDb(); const id = new Identity(db, new FakeClock(), testSecrets);
  const ws = [];
  for (const n of ['a', 'b', 'c']) ws.push((await id.loginWithIdentity({ provider: 'dev', subject: `${n}@campsite.test`, email: `${n}@campsite.test`, name: n.toUpperCase(), avatarUrl: null })).principal);
  assert.equal(new Set(ws.map(w => w.workspaceId)).size, 3);
  assert.equal(new Set(ws.map(w => w.runtimeId)).size, 3);
  for (const w of ws) assert.equal(w.plan, 'free');
});
