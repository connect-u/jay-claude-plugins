# memorj

Agent Memory Convention v0.1의 레퍼런스 구현 — Claude Code 어댑터.

> 에이전트 세션에서 생성되는 지식이, 사람의 정리 노력 없이, 축적되어
> 이후의 모든 세션이 — 도구와 무관하게 — 그 위에서 시작하게 한다.

memorj: memory의 y를 j로 — jarness 계보의 말장난. "그거 기억나?" "메모르지."

스펙과 구현 결정 기록은 [`docs/`](docs/) 참조:
- `spec-v0.1-draft-r2.md` — 규약 스펙 (의미론)
- `IMPLEMENTATION.md` — 구현 결정과 근거

## 동작

| 시점 | 무엇 | 어떻게 |
|---|---|---|
| SessionStart | epoch +1, manifest 주입 | promoted 전체 + 최근 captured의 제목 지도를 컨텍스트에 주입 |
| 작업 중 | 캡처·조회 | `memory_write` / `memory_search` / `memory_read` (MCP 툴) |
| 턴 종료 | 정산 게이트 | 마지막 정산 이후 tool_use ≥ 5인 턴을 block — 지식 기록 + 승격 심판 강제 |
| 언제든 | 사람의 개입 | 파일 직접 편집, 또는 `memory_promote` / `memory_demote` 지시 |

배경 프로세스 없음. 모든 로직은 hook과 툴 호출 안에서만 (불변식 1).

## 정본 위치

- project 스코프: `<project root>/.memory/entries/*.md` + `.memory/epoch`
- global 스코프: `~/.memory/entries/*.md`
- git 없는 디렉토리: `~/.memory/projects/<slug>/` 폴백
- 세션 핸드오프 상태(파생물, 삭제 무해): `~/.memory/.state/projects/<slug>.json`

엔트리는 plain markdown + YAML frontmatter. 어떤 노트 도구로도 열람 가능.

## Opt-in

프로젝트에서 규약을 켜는 방법 둘 중 하나:
- `mkdir .memory` (명시적)
- 세션 중 에이전트가 첫 `memory_write(scope: project)` 실행 (lazy 생성)

`.memory/`도 `~/.memory/entries/`도 없는 환경에서 hook은 완전히 침묵한다.

## 구현 상수 (dogfooding이 판결)

| 상수 | 값 |
|---|---|
| manifest RECENT 창 | 10 epoch |
| 검색 휴면 경계 | 10 epoch |
| Stop block 상한 (fail-open) | 2 |
| 정산 요구 문턱 (tool_use 수) | 5 |

값은 `server/lib.js` 상단.
