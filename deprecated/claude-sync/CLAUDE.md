# CLAUDE.md

> **Living Context.** 자동 갱신될 예정 (현재는 수동). Claude Code 세션 시작 시 자동 로드.

## 프로젝트

claude-sync — LLM 공동 개발을 위한 MCP 기반 동기화 레이어.
자세한 미션과 시나리오는 `PROJECT.md` 참고.

## 활성 ADR

- **ADR-0001** — 도그푸딩 의지. claude-sync 자체가 claude-sync 철학을 수동으로라도 따른다.

## 진행 중 작업 (Intents)

- (현재 없음 — 다음 작업 시작 시 `.sync/intents/` 에 생성)

## 핵심 설계 문서

- `docs/design.md` — 시스템 설계 v2
- `docs/prerequisite-conventions.md` — 도입 전 팀 합의 사항
- `docs/scenarios.md` — 검증 시나리오 A~D

## 도메인 용어

- **Intent** — 작업 의도 선언. 살아있는 객체.
- **Decision (ADR)** — 확정된 결정.
- **Coordination** — 다자 조율 기록.
- **Migration Plan** — 큰 변경의 실행 계획.
- **Retrospective** — 사후 회고.
- **Frozen Core** — PROJECT.md의 안 바뀌는 핵심.
- **Living Context** — 자라나는 컨텍스트 (이 파일 + .sync/).
- **Active Coordination** — 에이전트가 조율을 *시작*하는 기능. 우리 제품의 차별점.
- **Hybrid Capture** — 자동 감지 + 사람의 1초 확정.

## 현재 단계

**Design phase.** 코드 미작성.

다음 마일스톤:
1. 수동 1사이클 (다른 프로젝트에 이 워크플로우 적용해 마찰점 발견)
2. ADR-0002: 기술 스택 결정 (언어, 저장 포맷, Slack SDK)
3. MVP 스코프 확정 (design.md §10 Phase 1 참고)
4. MCP 서버 첫 커밋

## 작업 시 주의

이 프로젝트는 **자체 도그푸딩 (ADR-0001)** 한다. 새 결정은 ADR로, 새 작업은 intent로 기록. 수동이라도.

대화 중 결정 후보가 나오면 `.sync/drafts/` 에 기록하고, 확정 시 `.sync/decisions/` 로 승격.
