import { staticChecks } from './composer';

export interface ValidationResult { ok: boolean; errors: string[]; poster: Uint8Array | null; durationMs: number | null; motionDelta: number | null; consoleErrors: string[] }
export interface Validator { validate(html: string, opts?: { motionThreshold?: number }): Promise<ValidationResult> }

export const VISTA_TEST_URL = 'http://vista.local/index.html';
export const VALIDATION_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'none'";

/** Script injected before the Vista runs: records bridge messages for the validator to read. */
export const RECORDER_SCRIPT = `window.__campsite = []; window.addEventListener('message', function (e) { try { if (e.data && typeof e.data.type === 'string') window.__campsite.push(e.data); } catch (_) {} });`;

/** Pixel-difference between two PNG screenshots, computed inside a browser page as a string expression
 *  (avoids bundler helper injection; works on Playwright and puppeteer-style page.evaluate). */
export const DIFF_SCRIPT = `(async function ([a, b]) {
  var load = function (src) { return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = 'data:image/png;base64,' + src; }); };
  var imgs = await Promise.all([load(a), load(b)]); var ia = imgs[0], ib = imgs[1];
  var w = Math.min(ia.width, ib.width, 270), h = Math.min(ia.height, ib.height, 480);
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var ctx = cv.getContext('2d');
  ctx.drawImage(ia, 0, 0, w, h); var da = ctx.getImageData(0, 0, w, h).data;
  ctx.clearRect(0, 0, w, h); ctx.drawImage(ib, 0, 0, w, h); var db = ctx.getImageData(0, 0, w, h).data;
  var diff = 0; for (var i = 0; i < da.length; i += 4) { if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 48) diff++; }
  return diff / (w * h);
})`;
export function diffExpression(aBase64: string, bBase64: string): string { return `${DIFF_SCRIPT}(${JSON.stringify([aBase64, bBase64])})`; }

/** Minimal page surface shared by Playwright (local) and puppeteer-style (Browser Rendering) adapters. */
export interface ValidatorPage {
  open(html: string): Promise<void>;                 // serves html at VISTA_TEST_URL with VALIDATION_CSP, blocks all other requests
  blockedRequests(): string[];
  consoleErrors(): string[];
  messages(): Promise<{ type: string; durationMs?: number }[]>;
  wait(ms: number): Promise<void>;
  screenshot(): Promise<Uint8Array>;
  diff(a: Uint8Array, b: Uint8Array): Promise<number>;
  close(): Promise<void>;
}

export class PageValidator implements Validator {
  constructor(private readonly newPage: () => Promise<ValidatorPage>) {}
  async validate(html: string, opts: { motionThreshold?: number } = {}): Promise<ValidationResult> {
    const errors = staticChecks(html);
    if (errors.length) return { ok: false, errors, poster: null, durationMs: null, motionDelta: null, consoleErrors: [] };
    const page = await this.newPage();
    try {
      await page.open(html);
      let ready: { type: string; durationMs?: number } | undefined;
      const started = Date.now();
      while (Date.now() - started < 3000) {
        ready = (await page.messages()).find(m => m.type === 'campsite:ready');
        if (ready) break;
        await page.wait(100);
      }
      if (!ready) errors.push('no campsite:ready message within 3s');
      await page.wait(600);
      const poster = await page.screenshot();
      await page.wait(2000);
      const later = await page.screenshot();
      const motionDelta = await page.diff(poster, later);
      const threshold = opts.motionThreshold ?? 0.004;
      if (motionDelta < threshold) errors.push(`no visible motion between 0.6s and 2.6s (changed ${(motionDelta * 100).toFixed(2)}% of pixels, need ≥ ${(threshold * 100).toFixed(1)}%)`);
      for (const u of page.blockedRequests()) errors.push(`network request blocked: ${u}`);
      const consoleErrors = page.consoleErrors();
      for (const e of consoleErrors.slice(0, 5)) errors.push(`console error: ${e.slice(0, 200)}`);
      return { ok: errors.length === 0, errors, poster, durationMs: ready?.durationMs ?? null, motionDelta, consoleErrors };
    } finally { await page.close(); }
  }
}
