# Campsite R5.8 — Codex Implementation Package

**버전:** 2026-10-10 / R5.8  
**용도:** S1 Web + S2 Runner + S3 Core/Contracts를 **하나의 저장소에서 실제 구현**하도록 Codex에 전달하는 작업 패키지  
**상태:** 구현 사양 및 프롬프트만 포함. 애플리케이션 코드/배포 증거는 포함하지 않음.

## 1. 파일 구조

```text
campsite-r5.8-codex/
├── README.md
├── CODEX_MASTER_PROMPT.md       # 단일 Codex에서 전체 구현 지휘할 때
├── specs/
│   ├── R5.8_S1_Web.md           # 원본, 수정 없음
│   ├── R5.8_S2_Runner.md        # 원본, 수정 없음
│   └── R5.8_S3_Core_Contracts.md# 원본, 수정 없음
├── codex/
│   ├── CODEX_S1_START.md        # 독립 Web 세션 시작
│   ├── CODEX_S2_START.md        # 독립 Runner 세션 시작
│   └── CODEX_S3_START.md        # 독립 Core/Contracts 세션 시작
├── INTEGRATION_GATES.md         # 통합/보안/완료 기준
└── SOURCE_SHA256.txt            # 원본 3개 무결성 확인
```

## 2. 시작 방법

1. **기존 Campsite 코드 저장소 루트**로 ZIP을 풀어 `./campsite-r5.8-codex/`가 생기게 합니다. ZIP 자체는 실행 코드가 아니라 요구사항 패키지입니다.
2. Codex에 `CODEX_MASTER_PROMPT.md` 전체를 전달합니다. 또는 아래 바로 실행용 문장을 사용합니다.
3. 독립 Codex 세션 3개를 운용할 경우 S3가 `packages/contracts` 첫 커밋을 만든 직후, 그 커밋을 S1/S2 각 worktree에 반영합니다. 그 전 S1은 디자인/mock, S2는 독립 stub/Authoring Kit 작업으로 시작할 수 있습니다.
4. `AGENTS.md`, 작업 중인 브랜치/미커밋 변경, 기존 repo package manager가 우선합니다. ZIP에 기존 코드를 덮어씌우지 마세요.
5. 배포 자격 증명·실제 도메인이 없더라도 mock/local 경로의 테스트는 진행하고 G1/G2의 실제 통합은 BLOCKED로 보고합니다.

**바로 실행용 Codex 요청:**

> 저장소의 AGENTS.md와 `campsite-r5.8-codex/CODEX_MASTER_PROMPT.md`, specs의 S1/S2/S3 문서를 모두 읽고 지시에 따라 계획 5줄을 보고한 뒤, `packages/contracts` 정본부터 실제 구현하세요. 이후 Web/Runner/Core를 소유 영역에 따라 구현하고 G1(Stub), G2(Real Vista)의 테스트 결과와 미검증 부분을 증거로 남기세요. 계획만 작성하고 멈추지 마세요.

## 3. 선후 관계

| 단계 | 소유 | 필수 산출물 | 다른 세션과의 관계 |
|---|---|---|---|
| P0 | S3 | `packages/contracts`, `profiles.json`, fixtures, schema CI, 계약 커밋 | S1/S2에 전달 |
| 독립 작업 | S1 | UI tokens, mock, For Me Player | P0 전에도 가능 |
| 독립 작업 | S2 | Hermes spike, CLI, `--stub`, Vista Kit/Validator | P0 전에도 가능 |
| 배관 | S3 | Auth, D1, claim, R2, signed Vista Gateway | 계약 정본 사용 |
| G1 | 세션 통합 | Stub Vista가 실제 Feed/Player에 나타남 | 모든 세션 |
| G2 | 세션 통합 | 실제 AI Vista 생성·검증·재생 및 복원 | 모든 세션 |

## 4. 계약 주의점

- S1/S2 중복 기재된 인터페이스와 Plan 표는 설명용 스냅샷이며 구현 정본은 S3가 생성하는 `packages/contracts`입니다. S1/S2 원문은 수정하지 않았습니다.
- S3에서 보안 필수로 추가한 Runner 헤더 `X-Run-Attempt`는 **S2 구현에 반드시 반영**해야 하는 통합 handoff입니다. 기존 job/request body를 변경할 필요는 없습니다.
- `manifest.files`의 poster, shim 등을 빠짐없이 선언해야 하며, 서명 URL은 상대 자산 경로에도 동작해야 합니다.
- `CANCELED`는 Run 상태 enum이 아니라 실패 코드입니다. `READY`를 FeedEntry에 원자적으로 게시하는 것은 R5.8 정책입니다.
- `browser=false`는 에이전트 브라우징 툴 제한이며 오프라인 Vista Validator용 Chromium을 금지하는 것이 아닙니다.
- S3의 Cron handler/housekeeping은 G4의 **Channel 정기 실행**을 구현했다는 뜻이 아닙니다.

## 5. 본 패키지의 완료 여부

- ✅ 원본 S1/S2/S3 번들링 및 체크섬
- ✅ 통합 Codex 프롬프트·세션별 시작 프롬프트
- ✅ 구현/통합 게이트 점검표
- ⬜ 실제 Git 저장소 분석·수정
- ⬜ 계약 구현/코드/테스트
- ⬜ G1/G2 실구동 검증
