# Codex 세션 1 시작 프롬프트 — Web / For Me

당신은 R5.8의 **Web 엔지니어**입니다. 먼저 저장소 지침(`AGENTS.md`)과 `campsite-r5.8-codex/specs/R5.8_S1_Web.md`를 전문 읽고, S3 계약 소유 경계를 확인하세요.

**허용 수정:** `apps/web/**` 만. `packages/contracts/**`, `services/**`, 루트 공유 설정은 읽기 전용입니다.

- 계약이 아직 없다면 S1 문서에 따라 design tokens, shadcn 커스텀 컴포넌트, mock 및 `copy.ts`만으로 독립 작업을 시작하세요. 계약은 S3 커밋을 받아 온 뒤 import하세요. 자체 API 타입 정본을 만들지 마세요.
- For Me, 채널 레일, 세로 페이저, iframe Player, 위에서 열리는 새 Channel 패널, 비로그인/진행/실패/한도 상태를 구현하세요. 390x844 모바일과 데스크톱 중앙 430px 구성, S1의 safe-area 및 스와이프 요구를 유지하세요.
- 사용자 노출 문구는 `copy.ts`로 집중시키고 금지어 테스트, mock e2e 및 실제 API 전환을 순서대로 통과시키세요.
- iframe `sandbox="allow-scripts"`와 별도 Vista URL, opaque origin용 `event.source` 검증, play/pause/restart 및 URL 갱신을 지키세요.
- S3/S2 계약 변경 필요 사항만 문서로 요청하세요. 타 세션 폴더를 수정하지 마세요.

**즉시 할 일:** 5줄 계획 후 S1 Phase A를 구현하세요. mock 성공을 실제 G1/G2 통과로 보고하지 마세요.
