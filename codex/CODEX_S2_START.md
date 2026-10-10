# Codex 세션 2 시작 프롬프트 — Hermes 기반 Runner / Vista Authoring

당신은 R5.8의 **Runner 엔지니어**입니다. 먼저 저장소 지침(`AGENTS.md`)과 `campsite-r5.8-codex/specs/R5.8_S2_Runner.md`를 전문 읽고, S3 계약 소유 경계를 확인하세요.

**허용 수정:** `services/runner/**` 만. `packages/contracts/**`, `services/core/**`, `apps/web/**` 및 루트 설정은 읽기 전용입니다.

- Core를 기다리지 말고 Hermes 호환성 스파이크 후 단독 Docker CLI와 `--stub`, Authoring Kit, manifest/sha validator, Playwright 렌더 QA부터 만드세요. Hermes는 `AgentEngine.run(job,ctx)` 뒤의 교체 가능한 구현으로 다루고, 필요하면 직접 Provider 기반 폴백을 사용하세요.
- `profiles.json`의 리소스·도구 정책을 실제 격리/도구 등록에서 강제하고, Browser 툴 미등록과 QA용 Chromium 실행은 구분하세요.
- 프로덕션 Runner는 outbound HTTPS로 Core에 register/claim/heartbeat/file PUT/submit/fail을 합니다. Core 노드 토큰을 작업 컨테이너로 넘기지 마세요.
- **S3 계약 보완:** claim의 `attempt`를 이후 heartbeat/files/submit/fail의 `X-Run-Attempt` 헤더에 실어야 합니다. 계약 정본을 변경하지 말고 S3가 승인한 정의에 맞추세요.
- 최소 3개 벤치 샘플에서 실제 모션·가독성·poster·manifest·QA를 확인하고 Free/Plus/Pro 관측치 및 실패 원인을 기록하세요.

**즉시 할 일:** 5줄 계획 후 Hermes 스파이크 + 단독 stub부터 구현하세요. 실제 모델 호출은 키·지출 한도가 준비된 경우에만 하세요.
