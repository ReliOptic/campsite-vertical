# Offline toolchain note

The R6.0 implementation session had no package registry access (npm/PyPI/CDNs refused by egress policy), no Docker, no `wrangler`.
`scripts/offline-install.mjs` links packages from a pre-installed tool tree into `node_modules`; React type packages come from a
DefinitelyTyped sparse checkout (`../.vendor/dt`) and `csstype` from its repository. Consequences and substitutions:

- `zod` is imported through the `zod/v4` subpath (works on zod 3.25+ and 4.x).
- Web bundling uses esbuild directly (no Vite) and compiles Tailwind v4 programmatically (`apps/web/scripts/build.mjs`).
- UI is **real shadcn/ui (new-york v4)**: `apps/web/src/components/ui/*` are copied verbatim from `shadcn-ui/ui` (only `cn`/registry import paths
  rewritten; `sheet.tsx` gained a `container` prop so sheets portal into the device screen). Their `radix-ui` dependency is bundled from the
  `radix-ui/primitives` git checkout via esbuild aliases (`apps/web/scripts/aliases.mjs`, `tsconfig.json` paths); `react-remove-scroll` and its
  four helpers likewise; `tw-animate-css` and shadcn's `tailwind.css` base are vendored under `src/styles/vendor/`. `lucide-react` is a thin shim over
  `react-icons/lu` (same Lucide SVGs). With registry access: `pnpm add radix-ui lucide-react tw-animate-css` and delete the aliases — the component
  files are unchanged shadcn sources.
- HTTP routing is a 40-line Fetch-API router (no Hono).

With registry access, `pnpm install` restores the declared dependencies; nothing else changes.
