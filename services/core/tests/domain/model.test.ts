import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, FakeClock, testSecrets, testConfig } from '../helpers/db';
import { Identity } from '../../src/domain/identity';
import { ModelConnections } from '../../src/domain/model';

const KEY = 'sk-or-v1-' + 'a1b2c3d4'.repeat(6);
async function setup(verifier?: (key: string) => Promise<boolean>) {
  const db = testDb(); const clock = new FakeClock();
  const id = new Identity(db, clock, testSecrets);
  const { principal } = await id.loginWithIdentity({ provider: 'dev', subject: 'a@campsite.test', email: 'a@campsite.test', name: 'A', avatarUrl: null });
  const models = new ModelConnections(db, clock, testSecrets, testConfig, verifier ?? (async () => true));
  return { db, models, principal, id };
}

test('connect stores an encrypted key, exposes only a hint, and decrypts for execution', async () => {
  const { db, models, principal } = await setup();
  const res = await models.connect(principal, { provider: 'openrouter', apiKey: KEY, modelId: 'google/gemini-2.5-flash-lite' });
  assert.equal(res.connection?.keyHint, 'sk-or-v1…c3d4');
  assert.equal(JSON.stringify(res).includes(KEY), false);
  const row = await db.first<{ key_ciphertext: string }>('select key_ciphertext from model_connections');
  assert.ok(row && !row.key_ciphertext.includes(KEY) && !row.key_ciphertext.includes('a1b2c3d4'));
  const secret = await models.resolveForExecution(principal.workspaceId);
  assert.equal(secret?.apiKey, KEY);
  assert.equal(secret?.modelId, 'google/gemini-2.5-flash-lite');
});

test('ciphertext is bound to the workspace: another workspace cannot decrypt it', async () => {
  const { db, models, principal, id } = await setup();
  await models.connect(principal, { provider: 'openrouter', apiKey: KEY });
  const other = await id.loginWithIdentity({ provider: 'dev', subject: 'b@campsite.test', email: 'b@campsite.test', name: 'B', avatarUrl: null });
  const row = await db.first<{ key_ciphertext: string }>('select key_ciphertext from model_connections');
  await db.run('insert into model_connections (workspace_id, provider, model_id, key_ciphertext, key_hint, connected_at) values (?,?,?,?,?,?)', [other.principal.workspaceId, 'openrouter', 'x', row!.key_ciphertext, 'h', '2026-10-10T00:00:00.000Z']);
  await assert.rejects(() => models.resolveForExecution(other.principal.workspaceId));
});

test('invalid key is rejected by the verifier and nothing is stored', async () => {
  const { db, models, principal } = await setup(async () => false);
  await assert.rejects(() => models.connect(principal, { provider: 'openrouter', apiKey: KEY, verify: true }), (e: { code: string }) => e.code === 'INVALID_KEY');
  assert.equal((await db.all('select * from model_connections')).length, 0);
});

test('disconnect removes the key; execution then reports MODEL_NOT_CONNECTED', async () => {
  const { models, principal } = await setup();
  await models.connect(principal, { provider: 'openrouter', apiKey: KEY });
  const after = await models.disconnect(principal);
  assert.equal(after.connection, null);
  assert.ok(after.options.length >= 1);
  await assert.rejects(() => models.requireForExecution(principal.workspaceId), (e: { code: string }) => e.code === 'MODEL_NOT_CONNECTED');
});

test('default model is the cheapest option when none is chosen', async () => {
  const { models, principal } = await setup();
  const res = await models.connect(principal, { provider: 'openrouter', apiKey: KEY });
  assert.equal(res.connection?.modelId, 'google/gemini-2.5-flash-lite');
});
