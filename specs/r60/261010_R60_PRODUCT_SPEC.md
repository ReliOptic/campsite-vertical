# 261010 Campsite Vertical — Product Spec R6.0

문서 버전: R6.0 · 2026-10-10 · 상태: 구현 정본
출처: 사용자의 R6.0 7개 제품 결정, 「Campsite for Duo 백서」(2026-10-06), Agent-first Cloud Runtime 아키텍처 노트, R5.8 S1/S2/S3 원문.
이 파일은 저장소에 `specs/r60/`이 없던 상태에서 위 첨부 문서를 근거로 재구성한 것이다. R5.8 원문(`specs/R5.8_*.md`)과 충돌하는 항목은 이 문서가 우선한다.

## 0. 한 문장 정의

Campsite는 **계정마다 배정된 에이전트 런타임**이 사용자의 관심사(Channel)에 따라 **HTML 모션그래픽·3D Vista**를 지속적으로 생산하고, 사용자는 **For Me**에서 자기 Vista를, **Discovery**에서 다른 계정이 발행한 Vista를 소비·구독·포크하는 agent-first 플랫폼이다. VM이나 에이전트 인프라를 보여주는 제품이 아니다. 사용자가 보는 것은 Vista뿐이다.

## 1. R5.8 → R6.0 확정 결정

| # | 영역 | R5.8 | R6.0 확정 |
|---|---|---|---|
| Q1 | Fork | 제외 | Vista와 Channel 모두 Fork 가능 |
| Q2 | 공개 | 비공개 피드 | 개별 Vista를 **명시적으로 발행**(publish)해야 Discovery에 노출 |
| Q3 | 실행 | 최초 1회 | **최초 + 정기(Channel 주기) + 수동 재실행** |
| Q4 | 모델 키 | 개발자 키 | **사용자별 OpenRouter BYOK**(암호화 저장, 모델 호출에만 사용) |
| Q5 | 음성/짧은 입력 | 제외 | 우상단 마이크 → **현재 Vista 맥락에 대한 질문** → 에이전트 답변 |
| Q6 | Duo | 제외 | iPhone Duo 바깥→안쪽 **연속 재생**, 모델 생성 Vista 포함 |
| Q7 | Vista | HTML/SVG 모션 | **모션그래픽 + 인터랙티브 3D** 모두 |
| — | 계정 | 단일 | **독립 계정 3개** 교차 검증(발행·구독·포크) |
| — | Runtime | VPS Docker | **Cloudflare-native 우선**(Workers + Durable Objects + D1 + R2 + Browser Rendering) |
| — | 기기 | 모바일 단일 | 브라우저 안에 **iPhone 17 / iPhone Duo 프레임** |

보존: Task/Run → Artifact/Revision → Feed 구조, Zod 계약 정본, Run 멱등성·fencing, R2 불변 revision, 분리된 Vista Origin + `sandbox="allow-scripts"` iframe, 표면 비노출 규칙(copy.ts 금지어), 흰 배경·검정 컴포넌트·절제된 모션.

## 2. 계정 배정 모델 ("계정이 생기면 하나가 배정된다")

- 계정 생성(최초 로그인) 시 Core는 `workspace` 1개를 만들고, 해당 workspace 전용 **WorkspaceRuntime**(Cloudflare Durable Object, 로컬에서는 동일 인터페이스의 프로세스 내 런타임)을 식별자로 묶는다. 이 런타임이 "계정에 배정된 Campsite Runner"다: Channel 일정(alarm), Run 실행, 모델 호출, 검증, 커밋을 단일 스레드로 소유한다.
- 물리 자원은 Run이 실행될 때만 사용한다. Vista 재생에는 런타임이 깨어 있을 필요가 없다(Artifact Gateway가 R2에서 서빙).
- 플랜 차등은 `profiles.json` 하나로: 활성 Channel 수, 최소 주기, 일일 Run 한도, 동시 Run, 타임아웃, 수리 횟수.
- 사용자 화면에는 "런타임·VM·컨테이너·DO" 같은 용어가 나오지 않는다.

## 3. 사용자 경험 명세

### 3.1 공통 셸
- 브라우저 리뷰 스테이지에 **iPhone 17(390×844)**, **iPhone Duo 닫힘(390×844)/펼침(840×900, hinge 408–432)** 프레임을 두고 그 안에서 실제 앱이 동작한다. 기기 전환은 명시적 토글(실기기 접힘 감지가 아님).
- 흰 배경(#FFFFFF), 컴포넌트는 검정, 로고는 "왼쪽 원 + 오른쪽 삼각형" 마크(브랜드 보드)이며 과하지 않게 상단에만.
- 비로그인 사용자는 일반 홈페이지(워드마크 + 로그인 버튼)만 본다. 기존 계정은 재로그인 시 자기 workspace 상태(채널·Vista·구독)가 복원된다.

### 3.2 For Me
- 하단 **Profile Rail**만(원형 채널 아바타 + 새 채널 + 프로필). **오른쪽 Action rail 없음**.
- Vista는 **풀블리드**. 호스트 UI는 iframe 위의 독립 레이어이며 Vista 내용을 가리지 않도록 최소화.
- 우상단 **마이크 버튼**: 짧은 입력(음성 또는 텍스트)을 받아 **현재 Vista 맥락**으로 에이전트에 질문, 답변은 상단 시트에 표시.
- **Deep dive 아이콘**: 선택한 외부 앱(ChatGPT/Claude)으로 현재 Vista 제목·요약·프롬프트를 iPhone 공유하기처럼 넘긴다(웹에서는 딥링크/공유 시트).
- 세로 스와이프 = 같은 채널의 이전·다음 Vista, 채널 전환 = Profile Rail.
- 발행 버튼은 Vista 소유자에게만, 명시적 확인 후 Discovery에 노출.

### 3.3 Discovery
- 다른 계정이 **발행한** Vista만 최신순. 하단은 **채널 안내 + 구독** 영역, 오른쪽은 **Action rail**(좋아요 대신 구독·포크·Deep dive·더보기: 숏폼 피드 문법).
- 우상단 **포크 아이콘**: Fork = 원작 Vista(불변 revision)와 그 Channel 지침을 **내 workspace의 사본**으로 가져오는 것. 사본은 내 모델·내 키로 다시 실행될 수 있고, 원작·출처(originVistaId, originChannelId, originWorkspaceId)는 보존된다. 원작자의 비공개 개인화 문맥은 전달되지 않는다.
- 구독 = 발행자의 Channel을 내 Discovery 상단 구독 탭과 Profile Rail(구독 섹션)에 고정. 구독은 발행 권한을 넓히지 않는다.

### 3.4 상단 시트(Muse Feed instruction 참조)
- 모델 설정·프롬프트·Ask 응답은 **화면 전체가 아래로 밀려 내려가고 상단에서 검은 패널이 내려오는** 단일 패턴. M_OPEN 320ms E_ENTER, M_CLOSE 240ms E_EXIT(백서 모션 토큰).
- 최초 로그인 후 모델 연결이 없으면 **모델 설정 시트**가 먼저 열린다: OpenRouter 키 입력(MVP), ChatGPT OAuth 등은 확장점. 키는 서버에서 암호화 저장되며 이후 화면에 다시 표시되지 않는다.
- 모델이 연결되면 **"어떤 Vista를 만들까요"** 프롬프트 시트가 열린다(백서 제1부 1절 문구). Enter는 줄바꿈, ⌘/Ctrl+Enter 또는 버튼으로 전송. 취소/만들기 두 버튼.

### 3.5 Duo 정책
- 바깥(닫힘) 화면을 먼저 만들고, 펼치면 **오른쪽 pane이 바깥과 같은 위치·같은 revision·같은 재생 시각**으로 이어진다. 왼쪽 pane에는 관련 조작(재생·장면 이동·자막·출처)과 재분배된 타이포그래피가 들어간다.
- 접힘/펼침 전환은 자연스러운 애니메이션(M_RELAYOUT 180ms E_CHANGE)이며 새 생성 호출을 만들지 않는다.
- Vista 내부 semantic state(장면, 선택, 재생 위치)는 `state.commit` 브리지로 호스트에 전달되고, 접힘 전환·재접속 후 복원된다.

## 4. 생산 파이프라인

1. **Intent**: 채널 brief 또는 수동 프롬프트 → Run(QUEUED, trigger: initial|manual|scheduled|fork).
2. **Generate**: WorkspaceRuntime이 사용자 BYOK로 OpenRouter 호출. Authoring Kit(시스템 프롬프트·토큰·shim·3D 가이드)로 단일 `index.html` 산출.
3. **Validate**: 정적 검사(외부 네트워크·eval 금지) → 헤드리스 브라우저 로드(콘솔 오류 0, `campsite:ready`) → 모션 확인(0s/2s 픽셀 차) → poster 캡처. 실패 시 수리 루프(`maxRepair`).
4. **Commit**: staging → 불변 revision prefix → D1 한 트랜잭션(vista, revision, feed_entry, run READY).
5. **Scheduled run**: 변화 평가 단계에서 의미 있는 변화가 없으면 `SKIPPED`(새 revision·Feed 없음).
6. **Publish**: 소유자의 명시적 발행 → `publications` → Discovery.

## 5. 범위 밖(이번 Vertical)
실제 결제, ChatGPT/Claude OAuth 발행 커넥터, 네이티브 ActivityKit, 실기기 접힘 감지, 공개 검색·추천 점수.

## 6. 완료 조건(요약; 세부는 TDD_GATES)
3개 계정이 각각 로그인 → BYOK 연결 → 채널 생성 → 실제 파이프라인으로 Vista 생성·재생 → 발행 → 다른 계정 Discovery에서 확인·구독·포크 → 정기 실행으로 후속 Vista → Duo 전환 연속성 → 로그아웃/재접속 복원. 모든 단계는 실행된 테스트로 PASS/FAIL/BLOCKED/NOT_RUN을 기록한다.
