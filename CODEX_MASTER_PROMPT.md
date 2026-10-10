# Campsite R5.8 — Codex 통합 구현 프롬프트

당신은 Campsite R5.8의 **구현 책임자이자 통합 엔지니어**입니다. 지금 필요한 것은 기획안 재작성이나 UI 시안이 아니라, 기존 저장소에서 **작동하는 For Me 수직 통합 제품**을 실제 코드·테스트 증거로 만드는 것입니다.

## 0. 기준 문서 및 보존 원칙

- 저장소 루트의 `AGENTS.md`, 하위 폴더 지침, 기존 코드·테스트·lockfile·설정부터 확인하고 기존 변경을 보존하세요.
- 이 패키지의 다음 세 원문을 모두 읽으세요.
  1. `campsite-r5.8-codex/specs/R5.8_S1_Web.md` — `apps/web/**` 전담
  2. `campsite-r5.8-codex/specs/R5.8_S2_Runner.md` — `services/runner/**` 전담
  3. `campsite-r5.8-codex/specs/R5.8_S3_Core_Contracts.md` — `packages/contracts/**`, `services/core/**`, `ops/**`, 공용 루트 설정 전담
- 세 원문은 요구사항 기준이며 임의로 단순화하거나 재작성하지 마세요. 실제 스키마 정본은 S3가 먼저 구현하는 `packages/contracts`입니다. 두 문서가 불일치하면 독단적으로 덮지 말고 `ops/contract-change-requests.md`에 차이·영향·테스트를 기록하고 S3 계약 소유권을 지키세요.
- 특히 S3의 `X-Run-Attempt` fencing 요구, `Channel`/`FeedItem` 응답, `manifest.files` 완비, 별도 Vista Origin/상대 경로 capability, opaque iframe origin의 메시지 검증을 누락하지 마세요.
- 이번 완료 범위는 **G2 (Google 로그인 → Workspace/Plan 논리 배정 → Channel 생성 → 실제 Runner 생성/검증 → R2 Revision/Feed 커밋 → For Me Player 재생/재방문)**입니다. 결제·Discovery·사용자 BYOK(G3)·정기 Channel 재실행(G4)·Duo·소셜 기능은 구현하지 않습니다.
- **로그인마다 전용 VM을 실제로 생성하지 마세요.** 사용자에게는 논리 Workspace를 만들고 실제 컨테이너 자원은 Run 시 사용합니다. 모델 구독과 API 추론 비용은 별개이며, 임의의 무제한 유료 호출을 하지 마세요.

## 1. 실행 전략: 계약 먼저, 구현은 병렬, 통합은 게이트 기반

1. **Preflight**: 저장소 구조·현재 브랜치·미커밋 변경·사용 가능한 도구(Docker/Node/pnpm/Cloudflare CLI/테스트 브라우저)를 확인하고 위험·막힘을 짧게 보고하세요. 기존 사용자의 변경은 절대 폐기하지 마세요.
2. **S3 Phase 0 최우선**: 공용 루트와 `packages/contracts`의 Zod schema, JSON Schema export, profiles, fixtures, 타입·계약 테스트를 구현하세요. 테스트를 실행하고 정본의 **첫 커밋 해시**를 산출하세요. 커밋 정책·권한·Git 상태로 커밋이 불가하면 상태를 숨기지 말고 변경 내용과 해시 부재를 보고하세요.
3. **병렬 작업 분리**: 가능하다면 Git worktree/브랜치 3개로 격리하여 `codex/Campsite-S1-Web`, `codex/Campsite-S2-Runner`, `codex/Campsite-S3-Core`를 운영하세요. 생성된 계약 커밋을 S1·S2에 명시적으로 반영한 후 각 세션에 아래 `codex/CODEX_S*.md` 지시를 부여하세요. 다중 세션 실행을 지원하지 않는 환경이면 **한 Codex 세션에서 소유 경계를 지키며 단계별 구현**하세요. 생성하지 않은 세션을 실행했다고 주장하지 마세요.
4. **S1**: 디자인 시스템·mock/UI부터 개발하고 contract fixture 기반으로 로그인·채널 레일·For Me·생성 상태·Player를 구현하세요. 실제 사용자 문구가 `copy.ts` 외에 노출되거나 기술 용어가 UI로 새어 나오면 실패입니다.
5. **S2**: Hermes 판정 스파이크를 수행하되 붙잡히지 말고, 교체 가능한 `AgentEngine` 뒤에서 단독 CLI `--stub` → 실제 생성 → 오프라인 Validator → Core 연결 순서로 진행하세요. Runner 컨테이너의 자원/네트워크·비밀정보 격리를 강제하고 결과물이 실제 HTML 모션그래픽인지 브라우저에서 검사하세요.
6. **S3**: Google OIDC+세션·D1·Quota/Idempotency·원자적 Claim/Lease/Fencing·Private R2 staging/immutable revision·signed Vista Gateway·Feed API를 구현하세요. Core는 Runner에 인바운드 연결하지 않습니다.
7. **G1**: Stub Runner로 실제 API/DB/R2/iframe 배관을 끝까지 통과시키고 `ops/evidence/G1.md`에 실행 명령·결과·스크린샷 경로를 남기세요.
8. **G2**: 실제 모델 출력·수리/검증·저장/재생·새로고침 복원·권한 차단·중복 submit·취소/만료 복구까지 테스트하고 `ops/evidence/G2.md`에 증거를 남기세요. 환경/키/도메인이 없어 실제 통합을 실행하지 못하면 **BLOCKED**로 명시하고 mock/smoke와 구별하세요.

## 2. 구현상 반드시 지켜야 할 보안 및 동시성

- Web API는 인증된 사용자 소유권·CSRF·Idempotency를 검사하고, quota와 채널/Run 생성은 동시 호출에서도 안전해야 합니다.
- Runner API는 **노드 Bearer + node/attempt/lease fencing**을 적용하고 `claim`은 원자적이어야 합니다. 만료한 이전 attempt의 제출은 받아들이지 마세요.
- Private R2에 파일을 stage → 크기·sha·Manifest·허용 경로 검증 → 불변 경로 복사 완료 → DB의 READY+FeedEntry를 커밋하세요. 중단되거나 재시도되어도 사용자 Feed에 부분 또는 중복 게시가 없어야 합니다.
- 플레이어는 앱과 다른 등록 도메인의 signed Vista Gateway를 사용하고, relative asset까지 토큰으로 접근 가능해야 합니다. `iframe sandbox="allow-scripts"`를 지키고 세션·키를 postMessage에 보내지 마세요.
- HTML은 신뢰할 수 없는 실행물입니다. 문자열 검사만으로 안전하다고 간주하지 말고 Validator 무네트워크 격리, CSP, 크기/경로 allowlist, 사용자 리소스 제한을 테스트하세요.
- 비밀키를 Git/로그/fixture에 쓰지 마세요. 실제 비용을 발생시키는 OpenRouter 호출은 예산·상한을 확인한 경우에만 진행하세요.

## 3. 작업 품질과 보고 방식

- 모든 단계에서 실제 명령을 실행하세요. 설치·타입체크·단위 테스트·계약 테스트·Playwright·Docker 빌드/실행·배포 검증을 **수행한 것과 수행하지 못한 것**으로 구분하세요.
- 사용자 경험은 S1 문서의 흰 배경·모바일 한 화면 한 Vista·상단 새 채널 패널·채널 레일·For Me 중심을 유지하세요. 인프라 화면·데모 데이터로 실제 G2를 가장하지 마세요.
- 실패하면 먼저 원인과 가장 작은 수정 경로를 찾고 재시험하세요. 기존 작업을 삭제하거나 요구사항을 축소해 테스트를 녹색으로 만들지 마세요.
- 작업 도중 README/증거에 빠진 기능을 명시하세요. 외부 계정·키·도메인이 없어 막혀도 가능한 로컬 구현·테스트까지 진행하세요.
- 단계별 보고는 `완료된 코드/커밋`, `PASS와 명령`, `FAIL/BLOCKED`, `S1↔S2↔S3 계약 변경`, `G1/G2 상태`, `다음 통합 단계`로 간결하게 하세요.

**지금 즉시** ① `AGENTS.md`와 세 지시서를 읽고 ② 정확히 5줄의 실행 계획을 출력한 뒤 ③ 계약 정본 Phase 0을 코드로 구현하세요. 검토/계획만 출력하고 멈추지 마세요.
