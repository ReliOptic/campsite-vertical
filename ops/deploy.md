# Campsite Core — Cloudflare deployment runbook (R6.0)

Status: **not yet executed** (no account in the build environment). Steps below are what the configuration expects.

## What runs where
- **Worker `campsite-core`** (`services/core/src/cloudflare/worker.ts`): user API on the app origin, Vista gateway on the Vista origin, cron sweep every 5 minutes.
- **Durable Object `WorkspaceRuntimeDO`**: one per account (`idFromName(runtimeId)`); owns the schedule (alarm) and executes that account's runs with the account's own OpenRouter key.
- **D1 `campsite`**: `services/core/migrations/0001_init.sql` (same SQL the Node host runs on `node:sqlite`).
- **R2 `campsite-artifacts`** (private): `staging/...` and immutable `artifacts/<ws>/<ch>/<vista>/<rev>/...`.
- **Browser Rendering** binding `BROWSER`: validation + poster capture (Workers Paid plan).

## Prerequisites you provide
1. Cloudflare account on Workers Paid; two registrable domains (app, Vista) or two zones.
2. Google OAuth client (redirect `https://<app>/auth/google/callback`) — optional at first; dev accounts can be enabled with `AUTH_DEV_ACCOUNTS=1` for a closed test.
3. Your own OpenRouter key is entered **in the app** (BYOK); the deployment itself needs no model key.

## Steps
```
cd services/core
npx wrangler d1 create campsite                      # paste database_id into wrangler.jsonc
npx wrangler r2 bucket create campsite-artifacts
npx wrangler secret put SESSION_SECRET
npx wrangler secret put VISTA_SIGNING_SECRET
npx wrangler secret put MODEL_KEY_SECRET            # 32+ random bytes; rotating it invalidates stored BYOK ciphertexts
npx wrangler secret put GOOGLE_CLIENT_ID            # optional
npx wrangler secret put GOOGLE_CLIENT_SECRET        # optional
npx wrangler d1 migrations apply campsite --remote
npm i @cloudflare/puppeteer                         # resolved at bundle time (ambient types in src/cloudflare/types)
npx wrangler deploy
```
Set `APP_ORIGIN` / `VISTA_ORIGIN` vars to the real origins. Static web assets: build `apps/web` and serve `dist/` as Worker static assets or from the app origin.

## Smoke checks after deploy (map to the V-gates)
1. `GET https://<app>/auth/options` → `{google:true|false, dev:...}`.
2. Log in, connect an OpenRouter key with a cheap model, create a channel → run reaches READY; `GET /api/runtime` shows the DO; Vista plays from `https://<vista>/v/...` with the CSP header.
3. Log out, set a 60-min schedule on the channel (Pro plan), wait for the slot (or trigger the cron) → a new Vista or SKIPPED appears.
4. Second account: Discovery shows the publication; subscribe; fork; Jiwoo-style third account sees two publications.

## Operating notes
- Alarms are per-DO; the 5-minute cron sweep re-wakes any workspace with a due channel or queued run and expires stale leases (`sweepDueWorkspaces`).
- READY ≠ published. Publication is an explicit user action; unpublish bumps `access_version` so old links stop resolving.
- Staging objects older than 24h for finished runs are garbage-collected by the cron; committed revisions are never GC'd.
- Cost levers per plan live in `packages/contracts/profiles.json` (channels, interval, daily cap, concurrency, timeout, repairs).
