# R5.8 contract decisions

5.8.0: all Runner run mutations require X-Run-Attempt (1 or 2), node binding and an unexpired lease. No request body changes. Tests: contracts.test.ts; Core fencing integration tests.

Cancellation lacked a user API in S1/S2. Added POST /api/runs/:id/cancel returning RunResponse; authenticated owner, Origin/CSRF enforced; terminal status FAILED with error CANCELED. No additional user interface required. Tests: Core cancellation integration test.

Manifest JSON Schema cannot represent cross-field refinements (uniqueness, total bytes, entry/poster membership). Zod and Python validator independently enforce these checks. Export is structural; do not treat JSON Schema validation alone as artifact acceptance.

Sources were delivered directly at repository root rather than campsite-r5.8-codex/. Original documents remain untouched.
