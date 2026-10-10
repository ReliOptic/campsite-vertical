#!/usr/bin/env node
/**
 * Campsite R6.0 Vertical — end-to-end gate (local-node environment: node:sqlite, fs store, real Chromium validator,
 * stub model). Three independent accounts drive the real web app through the real Core over HTTP.
 * Output: one line per check — PASS / FAIL — plus a JSON summary written to e2e/artifacts/summary.json.
 *
 *   node e2e/vertical.mjs            # builds nothing; run `node apps/web/scripts/build.mjs` first
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 18787, VISTA = 18788;
const origin = `http://127.0.0.1:${APP}`;
const dataDir = resolve(root, 'e2e/artifacts/data');
const shots = resolve(root, 'e2e/artifacts/shots');
rmSync(resolve(root, 'e2e/artifacts'), { recursive: true, force: true });
mkdirSync(shots, { recursive: true });

const results = [];
let failed = 0;
function check(name, ok, detail = '') { results.push({ name, ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); }
async function expect(name, fn) { try { const r = await fn(); check(name, r === undefined ? true : !!r, typeof r === 'string' ? r : ''); } catch (e) { check(name, false, e.message?.slice(0, 200)); } }

// ---- server --------------------------------------------------------------------------------------
const server = spawn(resolve(root, 'node_modules/.bin/tsx'), ['src/node/server.ts'], { cwd: resolve(root, 'services/core'), env: { ...process.env, APP_PORT: String(APP), VISTA_PORT: String(VISTA), CAMPSITE_DB: resolve(dataDir, 'core.sqlite'), CAMPSITE_STORE: resolve(dataDir, 'store'), AUTH_DEV_ACCOUNTS: '1', MODEL_PROVIDER: 'stub' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
for (let i = 0; i < 60; i++) { try { const r = await fetch(`${origin}/auth/options`); if (r.ok) break; } catch { /* wait */ } await new Promise(r => setTimeout(r, 500)); }

const browser = await chromium.launch();
const KEY = 'sk-or-v1-' + 'e2e0e2e0'.repeat(6);
async function account(name, device = 'iphone', own = false) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/401|404/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${origin}/?device=${device}`);
  if (own) { await page.getByTestId('own-name').fill(name, { timeout: 15000 }); await page.getByTestId('own-login').click(); }
  else await page.getByTestId(`dev-login-${name.toLowerCase()}`).click({ timeout: 15000 });
  const api = async (method, path, body) => page.evaluate(async ({ method, path, body }) => { const r = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; }, { method, path, body });
  return { name, ctx, page, errors, api, shot: (n) => page.screenshot({ path: resolve(shots, `${name.toLowerCase()}-${n}.png`) }) };
}
const waitVista = (page, timeout = 90000) => page.waitForSelector('[data-testid="vista-frame"][data-ready="1"]', { timeout });

try {
  // ---- V1 accounts & BYOK ----------------------------------------------------------------------
  const hana = await account('Hana'), minsu = await account('Minsu'), jiwoo = await account('Jiwoo', 'iphone', true); // Jiwoo is created through the 'own account' form
  const mes = {};
  for (const a of [hana, minsu, jiwoo]) {
    await expect(`V1 ${a.name}: model sheet opens first on a fresh account`, () => a.page.getByTestId('model-sheet').waitFor({ timeout: 10000 }));
    await a.page.getByTestId('model-key').fill(KEY);
    await a.page.getByTestId('model-connect').click();
    await expect(`V1 ${a.name}: prompt sheet follows model connection`, () => a.page.getByTestId('prompt-sheet').waitFor({ timeout: 10000 }));
    mes[a.name] = (await a.api('GET', '/api/me')).body;
    await expect(`V1 ${a.name}: key never echoed, hint only`, async () => mes[a.name].model.connected && !JSON.stringify(mes[a.name]).includes(KEY) && mes[a.name].model.keyHint.includes('…'));
  }
  await expect('V1 three accounts → three distinct workspaces', () => new Set(Object.values(mes).map(m => m.workspaceId)).size === 3);
  await hana.shot('01-prompt');

  // ---- V2 generation → playback ----------------------------------------------------------------
  await hana.page.getByTestId('prompt-input').fill('AI 데이터센터의 전력 병목을 추적하고, 큰 변화가 생기면 원인과 영향을 보여 주세요.');
  await hana.page.getByTestId('schedule-1440').click();
  await hana.page.getByTestId('prompt-create').click();
  await expect('V2 Hana: status line shows progress copy', async () => { await hana.page.getByTestId('status-line').waitFor({ timeout: 10000 }); return (await hana.page.getByTestId('status-line').innerText()).includes('있어요'); });
  await hana.shot('02-generating');
  await expect('V2 Hana: Vista ready in For Me (real Chromium validation)', async () => { await waitVista(hana.page); return true; });
  await hana.page.waitForTimeout(1200);
  await hana.shot('03-forme');
  const hanaFeed = (await hana.api('GET', '/api/feed')).body;
  const hanaVistaId = hanaFeed.items[0]?.vistaId;
  await expect('V2 Hana: feed has one READY vista with features/scenes', async () => { const v = (await hana.api('GET', `/api/vistas/${hanaVistaId}`)).body; return v.scenes.length === 3 && v.features.includes('motion'); });
  await expect('V2 iframe sandbox is exactly allow-scripts', async () => (await hana.page.locator('[data-testid="vista-frame"] iframe').getAttribute('sandbox')) === 'allow-scripts');
  await expect('V2 Vista served from the separate origin with CSP', async () => { const src = await hana.page.locator('[data-testid="vista-frame"] iframe').getAttribute('src'); const r = await fetch(src); return src.startsWith(`http://127.0.0.1:${VISTA}/v/`) && r.headers.get('content-security-policy').includes("connect-src 'none'") && r.status === 200; });
  await expect('V2 channel rail shows the latest poster', async () => { const ch = (await hana.api('GET', '/api/channels')).body.items[0]; return typeof ch.latestPosterUrl === 'string' && ch.schedule.intervalMin === 1440 && ch.schedule.enabled; });
  await expect('V2 reload restores the same Vista', async () => { await hana.page.reload(); await waitVista(hana.page); return (await hana.page.locator('[data-testid="vista-frame"]').getAttribute('data-vista-id')) === hanaVistaId; });

  // ---- V3 publish → discovery → subscribe → fork ----------------------------------------------
  await expect('V3 Minsu: Discovery is empty before anyone publishes', async () => { await minsu.page.keyboard.press('Escape'); await minsu.page.getByTestId('mode-discovery').click(); await minsu.page.waitForTimeout(800); return (await minsu.page.getByTestId('empty-state').innerText()).length > 0; });
  await hana.page.getByTestId('publish-button').click();
  await expect('V3 Hana: publish confirmed in-app', async () => { await hana.page.getByTestId('receipt').waitFor({ timeout: 5000 }); return (await hana.page.getByTestId('publish-button').innerText()).includes('발행됨'); });
  await minsu.page.getByTestId('mode-forMe').click(); await minsu.page.getByTestId('mode-discovery').click();
  await expect('V3 Minsu: Hana\'s published Vista appears in Discovery with publisher', async () => { await waitVista(minsu.page); return (await minsu.page.getByTestId('channel-guide').innerText()).includes('Hana'); });
  await minsu.shot('04-discovery');
  await minsu.page.getByTestId('rail-subscribe').click();
  await expect('V3 Minsu: subscribed (rail + guide reflect it; subscriptions API lists it)', async () => { await minsu.page.waitForTimeout(600); const s = (await minsu.api('GET', '/api/subscriptions')).body; return s.items.length === 1 && (await minsu.page.getByTestId('guide-subscribe').innerText()).includes('구독 중'); });
  await minsu.page.getByTestId('fork-button').click();
  await expect('V3 Minsu: fork copies the Vista into For Me with origin and re-runs with Minsu\'s key', async () => { await minsu.page.waitForTimeout(800); await minsu.page.getByTestId('mode-forMe').click(); await waitVista(minsu.page); const feed = (await minsu.api('GET', '/api/feed')).body; const copy = feed.items.find(i => i.origin); return !!copy && copy.origin.workspaceId === mes.Hana.workspaceId && copy.channelId !== hanaFeed.items[0].channelId; });
  await expect('V3 Minsu: forked channel regenerated a second Vista', async () => { for (let i = 0; i < 60; i++) { const feed = (await minsu.api('GET', '/api/feed')).body; if (feed.items.length >= 2) return true; await minsu.page.waitForTimeout(1000); } return false; });
  await minsu.shot('05-forme-forked');
  await minsu.page.getByTestId('publish-button').click(); await minsu.page.waitForTimeout(600);
  await expect('V3 Jiwoo: Discovery lists both publications; fork count on Hana\'s = 1', async () => { await jiwoo.page.keyboard.press('Escape'); await jiwoo.page.getByTestId('mode-discovery').click(); await jiwoo.page.waitForTimeout(800); const d = (await jiwoo.api('GET', '/api/discovery')).body; return d.items.length === 2 && d.items.find(i => i.vistaId === hanaVistaId).forkCount === 1; });
  await expect('V3 Jiwoo: cannot read Minsu\'s private (unpublished) forked copy', async () => { const feed = (await minsu.api('GET', '/api/feed')).body; const priv = feed.items.find(i => i.origin); const r = await jiwoo.api('GET', `/api/vistas/${priv.vistaId}`); return r.status === 404; });
  await expect('V3 Jiwoo: own-feed isolation (empty) and discovery excludes own items', async () => (await jiwoo.api('GET', '/api/feed')).body.items.length === 0);
  await jiwoo.shot('06-discovery-two');

  // ---- V5 Duo continuity + semantic state -----------------------------------------------------
  await hana.page.getByTestId('device-duoOpen').click();
  await expect('V5 Duo open: same vista continues in the right pane, left pane shows scenes/captions', async () => { await hana.page.waitForTimeout(600); const id = await hana.page.locator('[data-testid="vista-frame"]').getAttribute('data-vista-id'); const left = await hana.page.getByTestId('duo-left-pane').innerText(); return id === hanaVistaId && left.includes('장면') && left.includes('자막'); });
  await hana.page.getByTestId('scene-chain').click();
  await expect('V5 scene change is committed as portable state', async () => { for (let i = 0; i < 10; i++) { await hana.page.waitForTimeout(500); const s = (await hana.api('GET', `/api/vistas/${hanaVistaId}/state`)).body; if (s.state.scene === 'chain' && s.state.fold === 'open') return true; } return false; });
  await hana.shot('07-duo-open');
  await expect('V5 reload restores Duo state from the server', async () => { await hana.page.reload(); await waitVista(hana.page); const s = (await hana.api('GET', `/api/vistas/${hanaVistaId}/state`)).body; return s.stateRevision >= 1 && s.state.scene === 'chain'; });
  await hana.page.getByTestId('device-iphone').click();

  // ---- V6 ask + deep dive -------------------------------------------------------------------------
  await hana.page.getByTestId('ask-button').click();
  await hana.page.getByTestId('ask-input').fill('왜 전력이 먼저인가요?');
  await hana.page.getByTestId('ask-send').click();
  await expect('V6 ask answers in the sheet with Vista context', async () => { await hana.page.getByTestId('ask-answer').waitFor({ timeout: 10000 }); await hana.page.waitForTimeout(500); return (await hana.page.getByTestId('ask-answer').innerText()).includes('AI 데이터센터'); });
  await hana.shot('08-ask');
  await hana.page.keyboard.press('Escape'); await hana.page.waitForTimeout(400);
  await hana.page.getByTestId('deepdive-button').click();
  await expect('V6 deep dive offers ChatGPT / Claude hand-off', async () => { await hana.page.getByTestId('deepdive-sheet').waitFor({ timeout: 5000 }); const t = await hana.page.getByTestId('deepdive-sheet').innerText(); return t.includes('ChatGPT') && t.includes('Claude'); });
  await hana.page.keyboard.press('Escape');

  // ---- V4 scheduled run without a browser session --------------------------------------------------
  await expect('V4 scheduled slot due → sweep → new Vista for Hana (no UI involved)', async () => {
    const db = new DatabaseSync(resolve(dataDir, 'core.sqlite'));
    db.prepare("UPDATE channels SET next_run_at = ? WHERE workspace_id = ?").run('2026-01-01T00:00:00.000Z', mes.Hana.workspaceId);
    db.close();
    const before = (await hana.api('GET', '/api/feed')).body.items.length;
    const sweep = await hana.api('POST', '/dev/sweep');
    if (sweep.status !== 200) return `sweep ${sweep.status}`;
    for (let i = 0; i < 60; i++) { const feed = (await hana.api('GET', '/api/feed')).body; if (feed.items.length > before) return true; await new Promise(r => setTimeout(r, 1000)); }
    return 'no new vista after sweep';
  });
  await expect('V4 schedule advanced and exactly one scheduled run exists', async () => { const db = new DatabaseSync(resolve(dataDir, 'core.sqlite')); const runs = db.prepare("SELECT status FROM runs WHERE trigger='scheduled'").all(); const ch = db.prepare('SELECT next_run_at FROM channels WHERE workspace_id = ?').get(mes.Hana.workspaceId); db.close(); return runs.length === 1 && runs[0].status === 'READY' && ch.next_run_at > '2026-01-01'; });

  // ---- V1 re-login restore ----------------------------------------------------------------------------
  await hana.page.getByTestId('profile-button').click();
  await hana.page.getByTestId('logout').click();
  await expect('V1 Hana: logout returns to the plain homepage', () => hana.page.getByTestId('dev-login-hana').waitFor({ timeout: 10000 }));
  await hana.page.getByTestId('dev-login-hana').click();
  await expect('V1 Hana: re-login restores workspace, channel and Vistas', async () => { await waitVista(hana.page); const me = (await hana.api('GET', '/api/me')).body; const feed = (await hana.api('GET', '/api/feed')).body; return me.workspaceId === mes.Hana.workspaceId && feed.items.length >= 2 && me.model.connected; });
  await hana.shot('09-relogin');

  for (const a of [hana, minsu, jiwoo]) await expect(`V0 ${a.name}: no page errors`, async () => a.errors.length === 0 ? true : a.errors.slice(0, 2).join(' | '));
} catch (e) {
  check('harness: no uncaught error', false, String(e?.stack ?? e).slice(0, 300));
} finally {
  await browser.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill(); }
  writeFileSync(resolve(root, 'e2e/artifacts/summary.json'), JSON.stringify({ environment: 'local-node (node:sqlite, fs store, Playwright Chromium validator, stub model)', results, failed, at: new Date().toISOString() }, null, 2));
  writeFileSync(resolve(root, 'e2e/artifacts/server.log'), serverLog);
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
