# Campsite Vertical — R6.0

Agent-first platform: each account gets its own runtime that turns channel briefs into HTML motion-graphic / 3D **Vistas**; readers consume them in **For Me**, publish them to **Discovery**, subscribe to each other's channels and fork what they like. Specs: `specs/r60/`.

```
campsite-vertical/
├── packages/contracts     # 6.0.0 Zod contracts, fixtures, JSON Schema (single authority)
├── services/core          # domain + state machine, execution pipeline, account runtime, HTTP API & Vista gateway
│   ├── src/node           # local host: node:sqlite, fs store, Playwright validator, dual-origin server
│   └── src/cloudflare     # Worker + WorkspaceRuntime Durable Object + Browser Rendering adapter (wrangler.jsonc)
├── apps/web               # React 19 app in iPhone 17 / iPhone Duo frames (For Me, Discovery, top sheets, Vista player)
├── e2e/vertical.mjs       # 3-account browser gate (38 checks)
└── ops/                   # evidence, deploy runbook, contract change log
```

## Run locally
```
pnpm install                      # or: node scripts/offline-install.mjs (registry-less environments)
pnpm build:web
pnpm -C services/core dev         # app http://127.0.0.1:8787 · Vista origin http://127.0.0.1:8788 · provider stub
```
Open the app, pick a device frame, sign in with one of the three test accounts (Hana / Minsu / Jiwoo), paste an OpenRouter key (any `sk-or-…` in stub mode), create a channel. `MODEL_PROVIDER=openrouter` switches to real generation with each account's own key (verified with `GET /key`, no model cost).

## Verify
```
pnpm contracts                                   # 14 contract tests + schema export
pnpm -C services/core test                       # 50 tests incl. real Chromium validation of reference Vistas
pnpm -C apps/web test                            # copy non-disclosure
pnpm e2e                                         # 3 accounts end-to-end, artifacts in e2e/artifacts/
```
Results and what is BLOCKED (Cloudflare deploy, real model, Google OIDC live): `ops/evidence/R60.md`.

Previous R5.8 package documents are kept unchanged under `specs/`, `codex/`, `CODEX_MASTER_PROMPT.md`, `INTEGRATION_GATES.md`.
