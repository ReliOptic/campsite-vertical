# Campsite R5.8 — 통합 실행 게이트 및 실패 기준

이 체크리스트는 **세 원본 지시서에서 요구한 완료 조건의 실행 순서**를 정리한 것입니다. 각 항목은 실제 실행 명령과 출력·환경/시각·로그/스크린샷 경로를 기록하기 전까지 PASS 처리하지 마세요.

## G0 — 계약 정본
- [ ] `AGENTS.md` 및 현재 브랜치/미커밋 변경 확인
- [ ] S3가 `packages/contracts` ESM/Zod, profiles, fixture, JSON Schema export, CI 구현
- [ ] S1/S2가 동일 계약 버전/커밋을 사용함을 기록
- [ ] `X-Run-Attempt` 헤더 보완을 S2가 실제 구현·테스트
- [ ] 계약 변경은 `ops/contract-change-requests.md`에 근거/테스트 기록

## G1 — Stub 배관 통합
- [ ] Google OAuth (또는 별도 명시된 제한적 로컬 테스트 인증)로 `/api/me` 검증
- [ ] Workspace 1개만 생성, Plan/quota 확인
- [ ] Channel 생성과 최초 Run 자동 등록 / idempotency 확인
- [ ] Runner daemon outbound register → claim → heartbeat → file PUT → submit
- [ ] `--stub` Vista의 구조/manifest/sha/poster 검증, READY revision 저장
- [ ] private R2 → signed Vista URL → iframe의 상대 에셋까지 load
- [ ] For Me 새 Vista 표시/재생/재방문, 남의 사용자에게 비공개
- [ ] 동시 claim·중복 submit·취소/만료 시도/경로 조작 보안 테스트
- [ ] `ops/evidence/G1.md`에 실행 명령·환경·PASS/FAIL/BLOCKED 기록

## G2 — 실제 생성 및 UX 검증
- [ ] Runner 단독 생성(벤치 3종) + Playwright 오프라인 QA
- [ ] 실제 모델 요청 → Vista HTML/SVG/CSS 모션 → poster → manifest
- [ ] Validator 실패 시 수리·포기 루프가 제한 횟수대로 동작
- [ ] 생성 중 UI 상태 변화 및 완성 시 Player 자동 재생
- [ ] iframe play/pause/restart 및 서명 URL 갱신/만료 동작
- [ ] 브라우저 새로고침 후 Feed/Revision 재진입
- [ ] 권한/Quota/회수/실패/재시도/중복 게시 테스트
- [ ] Chromium + 실제 사용 가능한 Safari/시뮬레이터에서 모바일 뷰포트 검증
- [ ] `ops/evidence/G2.md`에 테스트·이미지/영상·실패 내용·남은 이슈 기록

## 보안/운영 게이트
- [ ] node Bearer+binding 및 attempt+lease fencing
- [ ] nonce/state/PKCE/JWKS, 서버 세션 철회, Origin/CSRF 검사
- [ ] D1 원자적 quota/claim 및 idempotency
- [ ] R2 staging와 published revision 분리, 원자적 DB 게시
- [ ] HTML sandbox `allow-scripts` only, 별도 Vista Origin, signed capability 만료/철회
- [ ] Manifest/경로/해시/크기/파일 수/CSP 및 zero-remote-network 정책
- [ ] Job 컨테이너 비루트·자원 상한·비밀 정보 분리·사설망 차단
- [ ] 유료 모델 호출 상한과 운영비 관측값 확인

## 보고 출력 형식

```
Gate: G0 | G1 | G2
Environment: local / staging / production
PASS: 실제 수행 명령과 검증 결과
FAIL: 실제 재현된 실패와 원인
BLOCKED: 계정·키·네트워크·디바이스 미준비 등
Changed paths: ...
Contracts commit: <hash or not available>
Evidence: ops/evidence/<gate>.md
Next: ...
```

`npm run build` 성공만으로 G2가 완료된 것이 아닙니다. 데모/mock 성공을 실제 Google OAuth, 모델 호출, R2 저장, 브라우저 재생이 검증된 것처럼 표현하지 마세요.
