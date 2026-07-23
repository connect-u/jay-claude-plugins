# memorj

Agent Memory Convention의 레퍼런스 구현 — Claude Code 어댑터.

> 에이전트 세션에서 생성되는 지식이, 사람의 정리 노력 없이, 축적되어
> 이후의 모든 세션이 — 도구와 무관하게 — 그 위에서 시작하게 한다.

memorj: memory의 y를 j로 — jarness 계보의 말장난. "그거 기억나?" "메모르지."

스펙과 구현 결정 기록은 [`docs/`](docs/) 참조:
- `spec-v0.1-draft-r2.md` — 규약 스펙 v0.1 (§0~6·8 유효)
- `spec-v0.2-capture.md` — 쓰기 경로 개정 (§7 대체) + 이후 결정
- `IMPLEMENTATION.md` — 구현 결정과 근거

## 동작 (v0.2 — 발견 즉시 기록, 마감 전용 게이트)

| 시점 | 무엇 | 어떻게 |
|---|---|---|
| SessionStart | epoch +1, manifest 주입 | promoted 전체 + 최근 captured의 제목 지도 + 기록 규약을 컨텍스트에 주입 |
| SubagentStart | 서브에이전트 기록 규약 주입 | 서브에이전트도 발견 즉시 기록 (마감은 메인의 일) |
| 작업 중 | 발견 즉시 캡처 + 영수증 | 기준은 재획득 비용 — `memory_write` 직후 사용자에게 📝 영수증 표시 |
| 턴 종료 | 마감 게이트 | 미마감 `memory_write`가 있을 때만 block (최대 2회 후 fail-open). 기록 없는 턴은 침묵 |
| 언제든 | 사람의 개입 | 파일 직접 편집, 또는 `memory_promote` / `memory_demote` 지시 |

배경 프로세스 없음. 모든 로직은 hook과 툴 호출 안에서만 (불변식 1).

## 정본·저장 위치 (전부 `.memorj` 아래)

- 프로젝트 정본: `<project root>/.memorj/entries/*.md` + `.memorj/epoch`
- 프로젝트 설정 오버라이드: `<project root>/.memorj/config.json`
- 사용자 기본 설정: `~/.memorj/config.json`
- git 없는 디렉토리: `~/.memorj/projects/<slug>/` 폴백
- 세션 핸드오프 상태(파생물, 삭제 무해): `~/.memorj/.state/projects/`

엔트리는 plain markdown + YAML frontmatter. 어떤 노트 도구로도 열람 가능.
global 지식 스코프는 v0.2.1에서 유예 — 관리 라운드에서 재설계 (스펙 §5.1).

## 설정 — `/memorj:setting`

읽기는 폴백 체인: 프로젝트 `.memorj/config.json` → 사용자 `~/.memorj/config.json` → 기본값.

| 키 | 의미 | 기본값 |
|---|---|---|
| `language` | 저장 엔트리·영수증의 언어 (에이전트 대면 지시문은 항상 영문) | `English` |

`/memorj:setting`으로 조회·변경 (인자 없이 = 현재 설정 표시 + 초기 세팅). 사용자 기본값에 한 번만 세팅하면 모든 프로젝트에 적용되고, 공유 저장소는 `--project`로 고정한다. 저장 언어를 섞지 말 것 — 검색이 grep 기반이라 언어 일관성이 곧 recall이다.

## Opt-in

프로젝트에서 규약을 켜는 방법 둘 중 하나:
- `mkdir .memorj` (명시적)
- 세션 중 에이전트가 첫 `memory_write` 실행 (lazy 생성)

`.memorj/`가 없는 프로젝트에서 hook은 완전히 침묵한다.

## 구현 상수 (dogfooding이 판결)

| 상수 | 값 |
|---|---|
| manifest RECENT 창 | 10 epoch |
| 검색 휴면 경계 | 10 epoch |
| Stop block 상한 (fail-open) | 2 |

값은 `server/lib.js` 상단.
