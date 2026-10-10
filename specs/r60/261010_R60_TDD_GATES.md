# 261010 Campsite Vertical — Work Packages, TDD, Acceptance Gates (R6.0)

상태 표기: PASS(실행·통과) · FAIL(실행·실패) · BLOCKED(환경·자격증명 부재) · NOT_RUN. 로컬 mock/fake와 실제 배포 서비스를 반드시 구분한다.

## 원칙
- Contract-first: 모든 WP는 `packages/contracts`의 스키마·fixture를 먼저 바꾸고(실패 테스트), 구현으로 통과시킨다.
- 같은 상태기계를 로컬(node:sqlite·fs·타이머)과 Cloudflare(D1·R2·DO alarm)에서 같은 코드로 실행한다. 로컬 통과는 "로직 검증"이지 "배포 검증"이 아니다.
- 사용자 화면 문구는 `copy.ts` 한 곳, 금지어 테스트로 CI에서 강제.

## 작업 패키지

| WP | 범위 | 테스트 파일 | 완료 기준 |
|---|---|---|---|
| WP0 | 오프라인 툴체인, specs/r60 | `packages/contracts/tests` | 기존 5개 계약 테스트 PASS, typecheck PASS |
| WP1 | Contracts 6.0.0 | `packages/contracts/tests/*.test.ts` | 신규 스키마(ModelConnection, Publication, Subscription, Fork, Discovery, Ask, DuoState, Runtime) fixture parse, JSON Schema export, 버전 6.0.0 |
| WP2 | Core 도메인 | `services/core/tests/domain/*.test.ts` | 상태 전이 전수, fencing, idempotency, quota 동시성, 세션, BYOK 암·복호화, publish/subscribe/fork 권한 |
| WP3 | 실행 파이프라인 | `services/core/tests/execution/*.test.ts` | stub·fake OpenRouter로 Generate→Validate(실제 Chromium)→Commit, 수리 루프, 정적 검사 거부 |
| WP4 | 스케줄러 | `services/core/tests/scheduler/*.test.ts` | next_run_at 계산, alarm/타이머로 QUEUED 생성, 중복 금지, SKIPPED |
| WP5 | HTTP API·Gateway | `services/core/tests/http/*.test.ts` | 모든 엔드포인트 계약 응답, 비소유자 NOT_FOUND, 서명 capability 만료·경로 우회 거부, CSP |
| WP6 | Web | `apps/web/tests/*.test.ts`, Playwright 컴포넌트 | copy 금지어, iframe sandbox 고정, 상단 시트 모션 토큰, 기기 프레임 전환 |
| WP7 | E2E | `e2e/*.spec.ts` | 아래 게이트 V1–V6 |
| WP8 | 패키징·운영 | — | wrangler 설정·마이그레이션·런북, 증거 파일 |

## 수락 게이트

### V0 Contracts
- [ ] `pnpm contracts`(또는 오프라인 동등 명령) 녹색, `schemas/` 재생성 diff 없음.

### V1 계정·런타임 배정
- [ ] 계정 3개(dev 계정 또는 Google) 최초 로그인 → workspace 1개씩, 동시 로그인에도 1개.
- [ ] 각 workspace에 런타임 식별자 배정, `/api/me`에 플랜·사용량.
- [ ] BYOK 등록 → 암호화 저장, 응답에 키 원문 없음, 키 없는 상태에서 Run 생성 시 `MODEL_NOT_CONNECTED`.

### V2 생산·재생
- [ ] 채널 생성 → Run QUEUED → 런타임 실행 → Generate(fake 모델 응답 또는 실제 모델) → 실제 Chromium 검증(콘솔 0, ready, 모션) → poster → READY → Feed.
- [ ] For Me에서 iframe `sandbox="allow-scripts"`로 재생, 새로고침 후 동일 Vista.
- [ ] 정적 검사가 `fetch`/외부 URL/`eval`을 거부하고 수리 루프가 `maxRepair`까지 돈다.

### V3 발행·Discovery·구독·포크
- [ ] 계정 A 발행 → 계정 B Discovery에 노출, 미발행 Vista는 노출 안 됨.
- [ ] B 구독 → B의 구독 목록, A의 다음 발행이 B 피드 상단.
- [ ] B 포크 → B workspace에 사본 채널·Vista(origin 보존), A의 비공개 정보 없음, B 키로 재실행 가능.
- [ ] C가 A/B의 비공개 자원 ID로 접근 시 NOT_FOUND.

### V4 정기 실행
- [ ] 브라우저 세션 없이 스케줄 틱 → QUEUED → 실행 → 새 Vista 또는 SKIPPED.
- [ ] 같은 틱 중복 호출에도 Run 1개. 플랜 최소 주기·일일 한도 강제.

### V5 Duo 연속성
- [ ] 닫힘→펼침 전환에서 같은 vistaId·revision·재생 시각 유지, 오른쪽 pane 콘텐츠 위치 동일, 왼쪽 pane에 조작·자막.
- [ ] `state.commit` → 서버 저장 → 재접속 시 복원.

### V6 Ask·Deep dive
- [ ] 마이크/짧은 입력 → `/api/ask`(현재 vistaId 맥락) → 답변 시트.
- [ ] Deep dive → ChatGPT/Claude 선택 → 딥링크 생성(앱 전환은 OS 영역).

### 배포 게이트(권한 있을 때만)
- [ ] `wrangler deploy` Core + Gateway, D1 migration 적용, R2 private, DO alarm 동작, Browser Rendering 세션.
- [ ] 실제 OpenRouter 키로 저렴한 모델 1회 생성 → Vista 재생.

## 보고 형식
```
Gate: V0..V6 | Deploy
Environment: local-node(node:sqlite, fs, Chromium) | cloudflare(staging|production)
PASS/FAIL/BLOCKED/NOT_RUN: 명령·결과·증거 경로
Changed paths · Contracts version · Next
```
