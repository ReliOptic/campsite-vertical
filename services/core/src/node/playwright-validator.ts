import type { Browser, Page } from 'playwright';
import { PageValidator, RECORDER_SCRIPT, VALIDATION_CSP, VISTA_TEST_URL, diffExpression, type ValidatorPage } from '../execution/validator';

/** Local validator adapter on Playwright Chromium (same checks the Cloudflare Browser Rendering adapter runs). */
export function playwrightValidator(getBrowser: () => Promise<Browser>): PageValidator {
  return new PageValidator(async () => {
    const browser = await getBrowser();
    const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1, javaScriptEnabled: true, offline: false });
    const page = await context.newPage();
    const blocked: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(`uncaught: ${e.message}`));
    await page.addInitScript(RECORDER_SCRIPT);
    const adapter: ValidatorPage = {
      async open(html) {
        await page.route('**/*', route => {
          const url = route.request().url();
          if (url === VISTA_TEST_URL) return route.fulfill({ status: 200, body: html, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': VALIDATION_CSP, 'X-Content-Type-Options': 'nosniff' } });
          blocked.push(url);
          return route.abort('blockedbyclient');
        });
        await page.goto(VISTA_TEST_URL, { waitUntil: 'load', timeout: 10_000 });
      },
      blockedRequests: () => [...blocked],
      consoleErrors: () => [...consoleErrors],
      messages: () => page.evaluate(() => (window as unknown as { __campsite: { type: string; durationMs?: number }[] }).__campsite ?? []),
      wait: ms => page.waitForTimeout(ms),
      screenshot: async () => new Uint8Array(await page.screenshot({ type: 'png' })),
      diff: async (a, b) => {
        const diffPage = await context.newPage();
        try {
          await diffPage.setContent('<!doctype html><html><body></body></html>');
          return await diffPage.evaluate(diffExpression(Buffer.from(a).toString('base64'), Buffer.from(b).toString('base64'))) as number;
        } finally { await diffPage.close(); }
      },
      close: async () => { await context.close(); },
    };
    return adapter;
  });
}

let shared: Promise<Browser> | null = null;
export function sharedChromium(): Promise<Browser> {
  if (!shared) shared = import('playwright').then(pw => pw.chromium.launch({ headless: true }));
  return shared;
}
export async function closeSharedChromium() { if (shared) { const b = await shared; shared = null; await b.close(); } }
export type { Page };
