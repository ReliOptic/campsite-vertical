import { PageValidator, RECORDER_SCRIPT, VALIDATION_CSP, VISTA_TEST_URL, diffExpression, type ValidatorPage } from '../execution/validator';

/** Structural subset of the @cloudflare/puppeteer API used here (the package is not vendored in this repository). */
export interface PuppeteerLike {
  launch(binding: unknown): Promise<{ newPage(): Promise<PuppeteerPage>; close(): Promise<void> }>;
}
export interface PuppeteerPage {
  setViewport(v: { width: number; height: number; deviceScaleFactor?: number }): Promise<void>;
  setRequestInterception(on: boolean): Promise<void>;
  on(event: 'request', cb: (req: { url(): string; respond(r: { status: number; headers: Record<string, string>; body: string }): Promise<void>; abort(): Promise<void> }) => void): void;
  on(event: 'console', cb: (msg: { type(): string; text(): string }) => void): void;
  on(event: 'pageerror', cb: (err: Error) => void): void;
  evaluateOnNewDocument(script: string): Promise<void>;
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  evaluate(script: string): Promise<unknown>;
  screenshot(opts: { type: 'png'; encoding: 'binary' }): Promise<Uint8Array>;
  setContent(html: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Cloudflare Browser Rendering adapter — same checks as the local Playwright adapter.
 * NOT_RUN in this repository: requires a Workers Paid account with the Browser Rendering binding.
 */
export function browserRenderingValidator(puppeteer: PuppeteerLike, binding: unknown): PageValidator {
  return new PageValidator(async () => {
    const browser = await puppeteer.launch(binding);
    const page = await browser.newPage();
    const blocked: string[] = [];
    const consoleErrors: string[] = [];
    await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 1 });
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(`uncaught: ${e.message}`));
    await page.evaluateOnNewDocument(RECORDER_SCRIPT);
    const adapter: ValidatorPage = {
      async open(html) {
        await page.setRequestInterception(true);
        page.on('request', req => {
          if (req.url() === VISTA_TEST_URL) void req.respond({ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': VALIDATION_CSP, 'X-Content-Type-Options': 'nosniff' }, body: html });
          else { blocked.push(req.url()); void req.abort(); }
        });
        await page.goto(VISTA_TEST_URL, { waitUntil: 'load', timeout: 10_000 });
      },
      blockedRequests: () => [...blocked],
      consoleErrors: () => [...consoleErrors],
      messages: async () => (await page.evaluate('window.__campsite || []')) as { type: string; durationMs?: number }[],
      wait: ms => new Promise(r => setTimeout(r, ms)),
      screenshot: () => page.screenshot({ type: 'png', encoding: 'binary' }),
      diff: async (a, b) => {
        const p2 = await browser.newPage();
        try { await p2.setContent('<!doctype html><html><body></body></html>'); return (await p2.evaluate(diffExpression(toBase64(a), toBase64(b)))) as number; }
        finally { await p2.close(); }
      },
      close: async () => { await page.close(); await browser.close(); },
    };
    return adapter;
  });
}
function toBase64(bytes: Uint8Array): string { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
