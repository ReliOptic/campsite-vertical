# 261010 Campsite Vertical — Execution Directive (R6.0)

당신은 Campsite R6.0 Vertical의 lead implementation engineer다. 목표는 설계 문서나 정적 데모가 아니라 **동작하는 제품**이다.

## 읽기 순서
1. `specs/r60/261010_R60_PRODUCT_SPEC.md` — 제품 요구 정본
2. `specs/r60/261010_R60_TDD_GATES.md` — 작업 패키지·TDD·수락 게이트
3. 이 파일
4. 보존 참고: `specs/R5.8_S1_Web.md`, `R5.8_S2_Runner.md`, `R5.8_S3_Core_Contracts.md`, `packages/contracts`

## 실행 규칙
- 저장소 점검(브랜치·미커밋 변경·기존 테스트) → 첫 실패 계약 테스트 → 구현 → 다음 WP. 계획만 쓰고 멈추지 않는다.
- 기존 사용자 작업(contracts, 명세, 체크섬 파일)은 삭제·덮어쓰기하지 않는다. 계약 변경은 `ops/contract-change-requests.md`에 기록하고 버전을 올린다.
- 아키텍처: Cloudflare Workers + Durable Objects(계정별 WorkspaceRuntime) + D1 + R2 + Browser Rendering. 동일 도메인 로직을 로컬 어댑터(node:sqlite, fs, Playwright, 타이머)로 실행·테스트한다. 로컬 통과를 Cloudflare 통과로 표기하지 않는다.
- 외부 비용 금지: 실제 모델 호출은 사용자가 제공한 키와 승인이 있을 때만. 테스트는 stub/fake 모델을 기본으로 한다.
- 자격증명은 코드·fixture·로그·커밋에 넣지 않는다. 사용자 BYOK는 서버 암호화 저장, 모델 호출에만 복호화.
- 화면에 인프라 용어를 노출하지 않는다(copy.ts 금지어 테스트).
- 보고는 PASS/FAIL/BLOCKED/NOT_RUN으로, 로컬 mock과 실제 배포를 구분한다.

## 우선순위
For Me 경험(생성→검증→재생→복원)을 최우선으로 하되 Discovery·BYOK·정기 실행·발행·구독·포크·모션+3D Vista·Duo 연속성을 최종 범위에서 제외하지 않는다.

## 완료 보고 항목
구현/변경 파일, 커밋, 계약 버전·호환성, 게이트별 결과·증거, 미구현과 원인, 배포·운영에 남은 조건.
