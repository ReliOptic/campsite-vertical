import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy } from '../src/copy';

// Surface non-disclosure rule: no infrastructure or implementation vocabulary on screen.
const FORBIDDEN = ['Runner', 'Gateway', 'R2', 'VM', 'Upload', '업로드', 'Manifest', 'Lease', 'Cron', '슬롯', 'CPU', 'GB', 'MB', '토큰', 'API', 'Hermes', 'OpenRouter', 'Durable', 'Worker', '컨테이너', '런타임', 'D1', 'Cloudflare', 'iframe', 'sandbox'];

function* strings(o: unknown): Generator<string> {
  if (typeof o === 'string') yield o;
  else if (o && typeof o === 'object') for (const v of Object.values(o)) yield* strings(v);
}

test('copy contains no forbidden infrastructure words', () => {
  for (const s of strings(copy)) for (const w of FORBIDDEN) assert.ok(!new RegExp(`(^|[^a-zA-Z])${w}([^a-zA-Z]|$)`).test(s), `"${s}" contains "${w}"`);
});

test('error copy covers every contract error code with natural language', async () => {
  const c = await import('@campsite/contracts');
  for (const code of c.ErrorCode.options) assert.ok(code in copy.errors, code);
  assert.ok(!copy.errors.CHANNEL_LIMIT.match(/\d/), 'limits are filled at runtime');
});
