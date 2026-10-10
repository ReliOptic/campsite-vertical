import * as c from '@campsite/contracts';
import { shimTag } from './kit/shim';
import { STAGE_CSS, STAGE_JS } from './kit/stage';
import { REFERENCES } from './kit/references';

export interface ComposeInput { prompt: string; channelBrief: string; recent: { title: string; summary: string }[]; trigger: c.RunTrigger; repairFeedback?: string[]; previousHtml?: string }
export interface VistaHeader { title: string; summary: string; durationHintMs: number; aspect: c.Aspect; features?: c.VistaFeature[]; scenes?: c.Scene[]; captions?: c.Caption[]; sources?: { label: string; note?: string }[] }
export interface ComposedVista { html: string; header: VistaHeader }

export const SYSTEM_PROMPT = `You are Campsite's Vista composer. You turn research into a single self-contained HTML motion-graphic ("Vista") that a reader consumes on a phone, full-bleed, in about 20–45 seconds, with optional interaction and 3D.

OUTPUT FORMAT (strict):
1. First line: an HTML comment with a JSON manifest header:
   <!-- campsite:manifest {"title":"…","summary":"…","durationHintMs":24000,"aspect":"9:16","features":["motion","3d","interactive"],"scenes":[{"id":"intro","label":"…","atMs":0}],"captions":[{"atMs":0,"text":"…"}],"sources":[{"label":"…"}]} -->
   title ≤ 60 chars, summary 1–2 sentences, durationHintMs 15000–60000, features subset of motion|3d|interactive, 2–5 scenes with unique ids, captions short (one per scene), sources = real named references (no URLs required).
2. Then one complete HTML document. Nothing else (no markdown fences, no prose).

HARD RULES (violations are rejected by an automated validator):
- No network: no fetch/XMLHttpRequest/WebSocket/EventSource/import()/<script src>/<link href>/@import/url(http…)/remote fonts/CDNs. Everything inline. Images only as inline SVG or data: URIs.
- No eval/new Function/document.write. No top navigation, forms or popups.
- Must include the Campsite bridge: put the literal placeholder {{SHIM}} inside <head>. Do not write your own bridge.
- Stage: a 1080×1920 .stage inside .stage-fit scaled to the viewport (use the provided STAGE_CSS/STAGE_JS verbatim). Scenes are <section class="scene" data-scene="id" data-at="ms" style="animation-delay:Xs"> with animation-delay equal to data-at. One hidden #master element with animation:fade <durationHintMs> linear both drives the timeline.
- Motion must be real: CSS keyframes / Web Animations so document.getAnimations() can play/pause/seek. The first 2 seconds must visibly change.
- Interaction (optional): pointer drag, sliders, taps. Persist meaningful user choices with Campsite.state({key: value}) (flat, ≤ 40-char keys, strings ≤ 200 chars) and restore them in Campsite.onRestore(state).
- 3D (optional): CSS perspective + preserve-3d or 2D canvas projections. No WebGL libraries (none are available offline). Keep it legible on a 390px-wide phone.
- Typography: Korean copy (ko), short lines, one idea per scene: 핵심 한 줄 → 근거 시각화 → 변화·비교·전망. Numbers get units and dates. Cite sources in a .src line.
- Palette tokens are in STAGE_CSS (--snow, --charcoal, --stone, --butter, --sky, --lavender). White/snow background; the Vista may use accents freely but must not look like a dashboard or a slide deck.
- Size: whole document ≤ 300 KB.

STAGE_CSS:
${STAGE_CSS}

STAGE_JS (include verbatim in a <script> after the stage):
${STAGE_JS}

REFERENCE (one complete example that passes validation; match its structure, exceed its craft):
${REFERENCES[0].html.replace('{{SHIM}}', '{{SHIM}}')}
`;

export function buildUserPrompt(input: ComposeInput): string {
  const recent = input.recent.length ? `Recent Vistas in this channel (do not repeat them; build on them):\n${input.recent.map(r => `- ${r.title}: ${r.summary}`).join('\n')}` : 'This is the first Vista of the channel.';
  const trigger = input.trigger === 'scheduled' ? 'This is a scheduled update. Focus on what changed since the recent Vistas.' : input.trigger === 'fork' ? 'This channel was forked from another reader; produce a fresh take on the same brief.' : '';
  const repair = input.repairFeedback?.length ? `\n\nYour previous output was rejected by the validator with these errors. Fix every one of them and return the complete corrected document:\n${input.repairFeedback.map(e => `- ${e}`).join('\n')}\n\nPrevious document:\n${input.previousHtml ?? ''}` : '';
  return `Channel brief: ${input.channelBrief}\n\nRequest: ${input.prompt}\n\n${recent}\n${trigger}${repair}`;
}

const HEADER_RE = /<!--\s*campsite:manifest\s*(\{[\s\S]*?\})\s*-->/;
const HeaderSchema = c.Manifest.pick({ title: true, summary: true, durationHintMs: true, aspect: true, features: true, scenes: true, captions: true, sources: true });

/** Extracts the manifest header + document from raw model output and inlines the bridge shim. */
export function extractVista(raw: string, fallbackTitle: string): { ok: true; vista: ComposedVista } | { ok: false; errors: string[] } {
  let text = raw.trim();
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const errors: string[] = [];
  const m = text.match(HEADER_RE);
  let header: VistaHeader;
  if (!m) { header = { title: fallbackTitle.slice(0, 60), summary: fallbackTitle.slice(0, 200), durationHintMs: 24000, aspect: '9:16' }; errors.push('missing campsite:manifest header (defaults applied)'); }
  else {
    try {
      const parsed = HeaderSchema.safeParse(JSON.parse(m[1]));
      if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(i => `manifest header ${i.path.join('.')}: ${i.message}`) };
      header = parsed.data as VistaHeader;
    } catch (e) { return { ok: false, errors: [`manifest header is not valid JSON: ${(e as Error).message}`] }; }
  }
  let html = text.replace(HEADER_RE, '').trim();
  const start = html.search(/<!doctype html>|<html/i);
  if (start < 0) return { ok: false, errors: ['no <html> document found in output'] };
  html = html.slice(start);
  const end = html.lastIndexOf('</html>');
  if (end >= 0) html = html.slice(0, end + 7);
  if (html.includes('{{SHIM}}')) html = html.replace('{{SHIM}}', shimTag());
  else if (!html.includes('id="campsite-vista"')) html = html.includes('</head>') ? html.replace('</head>', `${shimTag()}</head>`) : html.replace(/<html[^>]*>/i, `$&<head>${shimTag()}</head>`);
  return { ok: true, vista: { html, header } };
}

/** Static policy checks shared by every validator implementation. */
export function staticChecks(html: string): string[] {
  const errors: string[] = [];
  const bytes = new TextEncoder().encode(html).byteLength;
  if (bytes > 300 * 1024) errors.push(`document is ${Math.round(bytes / 1024)} KB (limit 300 KB)`);
  const rules: [RegExp, string][] = [
    [/\bfetch\s*\(/, 'fetch() is not allowed'], [/XMLHttpRequest/, 'XMLHttpRequest is not allowed'], [/\bWebSocket\b/, 'WebSocket is not allowed'], [/\bEventSource\b/, 'EventSource is not allowed'],
    [/\bimport\s*\(/, 'dynamic import() is not allowed'], [/<script[^>]+src\s*=/i, '<script src> is not allowed'], [/<link[^>]+href\s*=/i, '<link href> is not allowed'], [/@import\b/, '@import is not allowed'],
    [/\beval\s*\(/, 'eval() is not allowed'], [/new\s+Function\s*\(/, 'new Function() is not allowed'], [/document\.write\s*\(/, 'document.write() is not allowed'],
    [/\bnavigator\.sendBeacon\b/, 'sendBeacon is not allowed'], [/<form\b/i, '<form> is not allowed'], [/window\.open\s*\(/, 'window.open() is not allowed'], [/<iframe\b/i, 'nested iframes are not allowed'],
  ];
  for (const [re, msg] of rules) if (re.test(html)) errors.push(msg);
  const urls = html.match(/https?:\/\/[^\s"'<>)]+/gi) ?? [];
  for (const u of urls) if (!/^https?:\/\/www\.w3\.org\//i.test(u)) { errors.push(`remote reference not allowed: ${u.slice(0, 80)}`); break; }
  if (!html.includes('id="campsite-vista"')) errors.push('bridge shim missing');
  return errors;
}
