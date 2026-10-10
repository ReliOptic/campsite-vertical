# Offline toolchain note

The R6.0 implementation session had no package registry access (npm/PyPI/CDNs refused by egress policy), no Docker, no `wrangler`.
`scripts/offline-install.mjs` links packages from a pre-installed tool tree into `node_modules`; React type packages come from a
DefinitelyTyped sparse checkout (`../.vendor/dt`) and `csstype` from its repository. Consequences and substitutions:

- `zod` is imported through the `zod/v4` subpath (works on zod 3.25+ and 4.x).
- Web bundling uses esbuild directly (no Vite) and compiles Tailwind v4 programmatically (`apps/web/scripts/build.mjs`).
- UI primitives follow the shadcn structure (cva + tailwind-merge + clsx) without Radix (not available offline); the top sheet is a custom
  accessible dialog. Icons are Lucide via `react-icons/lu`. Motion uses the white paper's tokens as CSS transitions/animations (no `motion` package).
- HTTP routing is a 40-line Fetch-API router (no Hono).

With registry access, `pnpm install` restores the declared dependencies; nothing else changes.
