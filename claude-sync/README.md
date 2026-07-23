# claude-sync

> LLM 에이전트를 활용한 공동 개발의 협업 문제를 해결하는 MCP 기반 동기화 레이어

## 무엇인가

여러 개발자가 각자의 LLM 에이전트(Claude Code, Cursor 등)로 동시에 개발할 때 발생하는 문제들:

- **컨텍스트 사일로** — 각자의 세션이 격리되어 어제의 결정을 다른 사람의 에이전트는 모름
- **의미적 충돌** — git이 못 잡는 충돌. 둘이 비슷한 유틸을 다르게 만듦
- **휘발성 결정** — 대화 안의 중요한 결정이 어디에도 남지 않음
- **조율 누락** — 조율이 필요한 순간을 사람이 깨닫지 못함

claude-sync는 이 문제들을 두 가지 레이어로 해결한다:

1. **예방적** — 합의된 규약, ADR, 인터페이스 계약 위에서 작업이 흘러가게
2. **반응적** — 충돌/번복/조율 필요 순간을 에이전트가 감지하고 적절히 개입

## 차별점

**Active Coordination** — 에이전트가 *조율이 필요한 순간을 감지*해서 사람들을 슬랙으로 모은다. 사람이 "지금 조율해야겠다" 깨달을 필요가 없다.

다른 협업 도구들은 사람이 *시작*해야 한다. claude-sync는 *시작을 자동화*한다.

## 문서

- [`docs/design.md`](docs/design.md) — 시스템 설계 (메인)
- [`docs/prerequisite-conventions.md`](docs/prerequisite-conventions.md) — 도입 전 팀 합의 사항
- [`docs/scenarios.md`](docs/scenarios.md) — 검증 시나리오

## 현재 상태

🚧 **Design phase.** 아직 코드 없음. 다음 액션:

1. 수동 1사이클 — 다음 프로젝트에서 워크플로우 직접 실행
2. MVP 스코프 확정
3. ADR-0001: 기술 스택 결정
4. MCP 서버 첫 커밋

`PROJECT.md` 의 Frozen Core 와 `.sync/decisions/` 부터 채워 나가는 중.

## 도그푸딩

이 프로젝트 자체가 claude-sync의 철학을 따른다. 그래야 우리가 만드는 도구가 진짜로 쓸 만한지 알 수 있다.

- `.sync/intents/` — 진행 중인 작업 의도
- `.sync/decisions/` — 확정된 ADR
- `.sync/coordinations/` — 다자 조율 기록
- `.sync/drafts/` — 미확정 결정 후보
- `PROJECT.md` — Frozen Core
- `CLAUDE.md` — Living Context 인덱스 (예정)
