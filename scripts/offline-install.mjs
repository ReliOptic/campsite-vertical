#!/usr/bin/env node
// Offline dependency linker for environments where the npm registry is unreachable.
// It never downloads anything: it links packages already present on the machine
// (a pre-installed tool tree, plus optional source checkouts for type packages).
// Normal environments should use `pnpm install`; this script is a fallback that
// produces the same node_modules layout the workspace expects.
import { existsSync, mkdirSync, readdirSync, symlinkSync, rmSync, lstatSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const poolDir = process.env.CAMPSITE_OFFLINE_POOL ?? '/opt/npm-tools/node_modules';
const vendorDir = process.env.CAMPSITE_OFFLINE_VENDOR ?? resolve(root, '..', '.vendor');
const nm = join(root, 'node_modules');

if (!existsSync(poolDir)) {
  console.error(`offline pool not found: ${poolDir}`);
  process.exit(1);
}
mkdirSync(nm, { recursive: true });
mkdirSync(join(nm, '.bin'), { recursive: true });

function link(target, dest) {
  if (existsSync(dest) || isDangling(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  symlinkSync(target, dest, 'dir');
}
function isDangling(p) { try { lstatSync(p); return true; } catch { return false; } }

let linked = 0;
for (const name of readdirSync(poolDir)) {
  if (name.startsWith('.')) continue;
  if (name.startsWith('@')) {
    for (const sub of readdirSync(join(poolDir, name))) { link(join(poolDir, name, sub), join(nm, name, sub)); linked++; }
  } else { link(join(poolDir, name), join(nm, name)); linked++; }
}
for (const bin of readdirSync(join(poolDir, '.bin'))) link(join(poolDir, '.bin', bin), join(nm, '.bin', bin));

// Type packages from source checkouts (DefinitelyTyped sparse checkout + csstype).
const typeSources = {
  '@types/react': join(vendorDir, 'dt', 'types', 'react'),
  '@types/react-dom': join(vendorDir, 'dt', 'types', 'react-dom'),
  'csstype': join(vendorDir, 'csstype'),
};
for (const [name, src] of Object.entries(typeSources)) {
  if (existsSync(src)) { link(src, join(nm, ...name.split('/'))); linked++; } else console.warn(`skip ${name}: ${src} missing`);
}

// Workspace packages.
const workspaces = { '@campsite/contracts': join(root, 'packages', 'contracts') };
for (const [name, src] of Object.entries(workspaces)) link(src, join(nm, ...name.split('/')));

// Record what was linked so CI/evidence can tell offline links from a registry install.
const manifest = { mode: 'offline-link', pool: poolDir, vendor: vendorDir, linked, at: new Date().toISOString() };
writeFileSync(join(nm, '.offline-link.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`linked ${linked} packages into ${nm} (offline mode)`);
