// Build: esbuild bundle (React 19, TSX) + Tailwind v4 programmatic compile with a source scanner (no CLI/oxide needed).
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });

function walk(dir, out = []) { for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx?|html|css)$/.test(e)) out.push(p); } return out; }
const CANDIDATE_RE = /[^\s"'`<>=]+/g;
function candidates() {
  const set = new Set();
  for (const f of walk(join(root, 'src'))) for (const m of readFileSync(f, 'utf8').match(CANDIDATE_RE) ?? []) set.add(m);
  return [...set];
}
async function css() {
  const twRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../node_modules/tailwindcss');
  const { compile } = require(join(twRoot, 'dist/lib.js'));
  const source = readFileSync(join(root, 'src/styles/app.css'), 'utf8');
  const compiler = await compile(source, { base: root, loadStylesheet: async (id, base) => {
    const p = id === 'tailwindcss' ? join(twRoot, 'index.css') : id.startsWith('tailwindcss/') ? join(twRoot, id.slice('tailwindcss/'.length)) : resolve(base, id);
    return { path: p, base: dirname(p), content: readFileSync(p, 'utf8') };
  } });
  writeFileSync(join(outDir, 'app.css'), compiler.build(candidates()));
}
const esbuildOptions = {
  entryPoints: [join(root, 'src/main.tsx')], bundle: true, outfile: join(outDir, 'app.js'), format: 'esm', target: ['es2022', 'safari16'], jsx: 'automatic',
  sourcemap: true, minify: !watch, define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') }, logLevel: 'info', legalComments: 'none',
};
async function html() {
  copyFileSync(join(root, 'public/index.html'), join(outDir, 'index.html'));
  for (const f of readdirSync(join(root, 'public'))) if (f !== 'index.html') copyFileSync(join(root, 'public', f), join(outDir, f));
}
if (watch) {
  const ctx = await context({ ...esbuildOptions, plugins: [{ name: 'css', setup(b) { b.onEnd(async () => { await css(); await html(); console.log('css+html rebuilt'); }); } }] });
  await ctx.watch();
} else {
  await build(esbuildOptions); await css(); await html();
  console.log(`built ${outDir}`);
}
