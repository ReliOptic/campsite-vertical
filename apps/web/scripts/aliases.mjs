// Source aliases for packages that are vendored as git checkouts (no registry access):
// shadcn's `radix-ui` → Radix primitives monorepo sources; react-remove-scroll family → their sources.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = process.env.CAMPSITE_OFFLINE_VENDOR ?? resolve(appRoot, '../../../.vendor');
const prim = join(vendor, 'primitives', 'packages');
export const aliases = {};
if (existsSync(prim)) {
  for (const n of readdirSync(join(prim, 'react'))) aliases[n === 'radix-ui' ? 'radix-ui' : `@radix-ui/react-${n}`] = join(prim, 'react', n, 'src', 'index.ts');
  for (const n of readdirSync(join(prim, 'core'))) aliases[`@radix-ui/${n}`] = join(prim, 'core', n, 'src', 'index.ts');
  aliases['@radix-ui/primitive/is-development'] = join(prim, 'core', 'primitive', 'src', 'internal', 'is-development.false.ts');
  aliases['react-remove-scroll-bar/constants'] = join(vendor, 'react-remove-scroll-bar', 'src', 'constants.ts');
  for (const n of ['react-remove-scroll', 'react-remove-scroll-bar', 'react-style-singleton', 'use-sidecar', 'use-callback-ref', 'get-nonce']) aliases[n] = join(vendor, n, 'src', 'index.ts');
}
aliases['lucide-react'] = join(appRoot, 'src/vendor/lucide-react.tsx');
aliases['detect-node-es'] = join(appRoot, 'src/vendor/detect-node-es.ts');
export const vendorDir = vendor;
