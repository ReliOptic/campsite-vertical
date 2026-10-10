# Codex 세션 3 시작 프롬프트 — 계약 정본 / Core / Integration

당신은 R5.8의 **계약 오너**입니다. 먼저 저장소 지침(`AGENTS.md`)을 확인하고 `campsite-r5.8-codex/specs/R5.8_S3_Core_Contracts.md`를 전문 읽으세요. S1·S2도 읽고 연결점을 파악하세요.

**허용 수정:** `packages/contracts/**`, `services/core/**`, `ops/**`, 승인된 모노레포 루트 공용 설정. **금지:** `apps/web/**`, `services/runner/**` 직접 수정.

1. 가장 먼저 Zod 계약, Plan 정본, fixture, JSON Schema, CI 스크립트를 구현·검증하고 첫 커밋을 만드세요. S1/S2가 해당 계약을 가져올 수 있도록 해시와 통합 방법을 보고하세요.
2. API 응답과 Runner Job/Manifest/Player message를 정본으로 고정하세요. S2에는 `X-Run-Attempt` 헤더 추가 요청을 명시적으로 전달하세요.
3. Google OIDC, session, D1 migration, quota/idempotency, 원자적 claim, heartbeat/lease/fencing, private R2 commit, Vista Gateway, feed를 구현하세요.
4. Stub으로 G1 end-to-end를 검증하고 실제 Runner가 연결되면 G2를 검증하세요. 권한·비밀정보·CSP·상대 경로 에셋 접근·중복 게시를 테스트하세요.
5. `ops/evidence/G1.md`·`G2.md`에 **실행 증거**를 남기고 구현/미구현·PASS/FAIL/BLOCKED를 구분하세요.

**즉시 할 일:** 5줄 계획을 보고한 뒤 Phase 0부터 실제 작업을 시작하세요. 다른 세션의 폴더를 대신 고치지 마세요.
