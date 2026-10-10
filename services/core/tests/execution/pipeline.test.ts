import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { extractVista, staticChecks, SYSTEM_PROMPT, buildUserPrompt } from '../../src/execution/composer';
import { REFERENCES } from '../../src/execution/kit/references';
import { shimTag, SHIM_SOURCE } from '../../src/execution/kit/shim';
import { OpenRouterProvider, StubProvider, ProviderError } from '../../src/execution/provider';
import { playwrightValidator, sharedChromium, closeSharedChromium } from '../../src/node/playwright-validator';

after(async () => { await closeSharedChromium(); });

test('composer: extracts header + document, inlines the shim, tolerates code fences', () => {
  const raw = '```html\n' + REFERENCES[0].html + '\n```';
  const r = extractVista(raw, 'fallback');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.vista.header.title, 'AI 데이터센터, 전력이 먼저다');
  assert.deepEqual(r.vista.header.features, ['motion']);
  assert.ok(r.vista.html.includes('id="campsite-vista"'));
  assert.ok(!r.vista.html.includes('{{SHIM}}'));
  assert.ok(!r.vista.html.includes('campsite:manifest'));
  const noHeader = extractVista('<html><head></head><body><div></div></body></html>', '제목 없음');
  assert.ok(noHeader.ok && noHeader.vista.header.title === '제목 없음' && noHeader.vista.html.includes('id="campsite-vista"'));
  const bad = extractVista('<!-- campsite:manifest {"title":""} --><html></html>', 'x');
  assert.ok(!bad.ok);
  assert.ok(!extractVista('just prose, no document', 'x').ok);
});

test('static checks reject network, eval, external assets and missing shim; accept references', () => {
  for (const ref of REFERENCES) assert.deepEqual(staticChecks(ref.html.replace('{{SHIM}}', shimTag())), [], ref.id);
  const base = `<html><head>${shimTag()}</head><body><script>SNIPPET</script></body></html>`;
  for (const [snippet, msg] of [['fetch("/x")', 'fetch()'], ['new XMLHttpRequest()', 'XMLHttpRequest'], ['eval("1")', 'eval()'], ['import("x")', 'import()'], ['var u="https://cdn.example.com/a.js"', 'remote reference']])
    assert.ok(staticChecks(base.replace('SNIPPET', snippet)).some(e => e.includes(msg)), msg);
  assert.ok(staticChecks('<html><head><script src="https://x/y.js"></script></head></html>').some(e => e.includes('<script src>')));
  assert.ok(staticChecks('<html><head></head></html>').some(e => e.includes('shim missing')));
  assert.deepEqual(staticChecks(`<html><head>${shimTag()}</head><body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>`), []);
});

test('system prompt carries the hard rules and the user prompt carries repair feedback', () => {
  assert.ok(SYSTEM_PROMPT.includes('{{SHIM}}') && SYSTEM_PROMPT.includes('No network') && SYSTEM_PROMPT.includes('campsite:manifest'));
  const u = buildUserPrompt({ prompt: '전력', channelBrief: '데이터센터', recent: [{ title: 'T', summary: 'S' }], trigger: 'scheduled', repairFeedback: ['console error: x'], previousHtml: '<html></html>' });
  assert.ok(u.includes('scheduled update') && u.includes('- T: S') && u.includes('console error: x') && u.includes('<html></html>'));
  assert.ok(SHIM_SOURCE.includes('campsite:ready') && SHIM_SOURCE.includes('campsite:state'));
});

test('real Chromium validator: all reference Vistas pass (ready, motion, no network, no console errors) and produce posters', async () => {
  const validator = playwrightValidator(sharedChromium);
  for (const ref of REFERENCES) {
    const r = await validator.validate(ref.html.replace('{{SHIM}}', shimTag()));
    assert.deepEqual(r.errors, [], ref.id);
    assert.ok(r.ok);
    assert.ok(r.poster && r.poster.byteLength > 1000, 'poster png');
    assert.ok((r.motionDelta ?? 0) >= 0.004, `${ref.id} motion ${r.motionDelta}`);
  }
});

test('real Chromium validator: rejects a static page, a page with a blocked network call, and a page with a runtime error', async () => {
  const validator = playwrightValidator(sharedChromium);
  const still = `<html><head>${shimTag()}</head><body style="background:#fff"><h1>정지 화면</h1></body></html>`;
  const r1 = await validator.validate(still);
  assert.ok(!r1.ok && r1.errors.some(e => e.includes('no visible motion')));
  const net = REFERENCES[0].html.replace('{{SHIM}}', shimTag()).replace('</body>', '<img src="/remote.png"></body>');
  const r2 = await validator.validate(net);
  assert.ok(!r2.ok && r2.errors.some(e => e.includes('network request blocked') || e.includes('Content Security Policy')), r2.errors.join(';'));
  const err = REFERENCES[0].html.replace('{{SHIM}}', shimTag()).replace('</body>', '<script>undefinedFunction()</script></body>');
  const r3 = await validator.validate(err);
  assert.ok(!r3.ok && r3.errors.some(e => e.includes('console error')), r3.errors.join(';'));
});

test('OpenRouter client: sends BYOK bearer + headers, parses completions, maps 401/429 to non-retryable/retryable', async () => {
  const seen: { auth?: string; title?: string; body?: unknown }[] = [];
  let mode: 'ok' | '401' | '429' = 'ok';
  const server = createServer((req, res) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, title: req.headers['x-title'] as string, body: JSON.parse(data) });
      if (mode === '401') { res.writeHead(401); res.end('{"error":{"message":"bad key"}}'); return; }
      if (mode === '429') { res.writeHead(429); res.end('{}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'test/model', usage: { prompt_tokens: 12, completion_tokens: 34 }, choices: [{ message: { content: 'hello' } }] }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const provider = new OpenRouterProvider(`http://127.0.0.1:${port}/api/v1`);
  const out = await provider.chat({ modelId: 'test/model', apiKey: 'sk-or-test', system: 'S', user: 'U' });
  assert.deepEqual(out, { text: 'hello', tokensIn: 12, tokensOut: 34, modelId: 'test/model' });
  assert.equal(seen[0].auth, 'Bearer sk-or-test'); assert.equal(seen[0].title, 'Campsite');
  assert.deepEqual((seen[0].body as { messages: unknown[] }).messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
  mode = '401';
  await assert.rejects(() => provider.chat({ modelId: 'm', apiKey: 'k', system: 'S', user: 'U' }), (e: ProviderError) => e instanceof ProviderError && !e.retryable && e.status === 401);
  mode = '429';
  await assert.rejects(() => provider.chat({ modelId: 'm', apiKey: 'k', system: 'S', user: 'U' }), (e: ProviderError) => e instanceof ProviderError && e.retryable);
  server.close();
});

test('stub provider picks a reference by keywords and answers evaluation JSON', async () => {
  const stub = new StubProvider({ skipScheduled: true });
  const r = await stub.chat({ modelId: 'stub', apiKey: '', system: '', user: 'HBM 시장 점유율' });
  assert.ok(r.text.includes('HBM 시장, 세 개의 기둥'));
  const j = await stub.chat({ modelId: 'stub', apiKey: '', system: '', user: 'This is a scheduled update.', json: true });
  assert.equal(JSON.parse(j.text).skip, true);
});
