# R5.8 contract decisions

5.8.0: all Runner run mutations require X-Run-Attempt (1 or 2), node binding and an unexpired lease. No request body changes. Tests: contracts.test.ts; Core fencing integration tests.

Cancellation lacked a user API in S1/S2. Added POST /api/runs/:id/cancel returning RunResponse; authenticated owner, Origin/CSRF enforced; terminal status FAILED with error CANCELED. No additional user interface required. Tests: Core cancellation integration test.

Manifest JSON Schema cannot represent cross-field refinements (uniqueness, total bytes, entry/poster membership). Zod and Python validator independently enforce these checks. Export is structural; do not treat JSON Schema validation alone as artifact acceptance.

Sources were delivered directly at repository root rather than campsite-r5.8-codex/. Original documents remain untouched.

# R6.0 contract decisions (6.0.0)

- Imports use `zod/v4` subpath: identical API on zod 4.x and on zod 3.25+ (which embeds v4). Needed because this environment can only link a pre-installed zod 3.25.76; no behavioral change. JSON Schema patterns for `email`/`datetime` differ slightly between zod builds; `schemas/` is regenerated from the installed build.
- `RunStatus` gains `SKIPPED` (terminal, scheduled run with no meaningful change; no revision/feed entry). `RunTrigger` = initial|manual|scheduled|fork. `FailCode` unchanged.
- `ErrorCode` gains `MODEL_NOT_CONNECTED`, `INVALID_KEY`.
- `MeResponse` gains `workspaceId`, `model` summary, `nextUpdateAt`. `Channel` gains `schedule`, `origin`. `CreateChannel` gains optional `intervalMin`. New `PATCH /api/channels/:id`.
- `FeedItem`/`VistaResponse` gain `revisionId`, `published`, `origin`, `features`; `VistaResponse` also `channelId`, `owned`, `scenes`, `captions`, `durationHintMs`.
- `Manifest` v1 additive optional fields: `features`, `scenes`, `captions`, `sources` (Duo left pane + provenance). Still strict.
- Bridge: `HostMessage` adds `campsite:seek`, `campsite:scene`, `campsite:restore`; `VistaMessage` (vista→host) = ready | state | scene. `ReadyMessage` kept for compatibility.
- New surfaces: BYOK (`/api/model`), publication (`/api/vistas/:id/publish`), discovery, subscriptions, forks, ask, semantic state (`/api/vistas/:id/state`), runtime status, dev login (`/auth/dev/login`, only when `AUTH_DEV_ACCOUNTS` is set).
- `profiles.json` gains `maxConcurrentRuns` (free 1, plus 2, pro 4). Other R5.8 values unchanged.
- Runner API (external node path) preserved; `Job.trigger` optional. The in-platform WorkspaceRuntime uses the same run state machine functions.
- Tests: `packages/contracts/tests/contracts.test.ts`, `tests/r60.test.ts`.
