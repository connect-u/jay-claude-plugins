# memorj

Agent Memory Convention의 레퍼런스 구현 — Claude Code 어댑터.

> 에이전트 세션에서 생성되는 지식이, 사람의 정리 노력 없이, 축적되어
> 이후의 모든 세션이 — 도구와 무관하게 — 그 위에서 시작하게 한다.

memorj: memory의 y를 j로 — jarness 계보의 말장난. "그거 기억나?" "메모르지."

스펙과 구현 결정 기록은 [`docs/`](docs/) 참조:
- `spec-v0.1-draft-r2.md` — 규약 스펙 v0.1 (§0~4·8 유효)
- `spec-v0.2-capture.md` — 쓰기 경로 개정 (§7 대체) + 이후 결정
- `spec-v0.3-lifecycle.md` — 수명주기 개정 (§5·§6 대체: 상태 3 + 순위 3 + 시계 3)
- `IMPLEMENTATION.md` — 구현 결정과 근거

## 동작 (v0.3 — 발견 즉시 기록, 사용은 측정, 판단은 선언)

| 시점 | 무엇 | 어떻게 |
|---|---|---|
| SessionStart | epoch +1, manifest 주입 | [PINNED] + [HOT] + [RECENT] 제목 지도 + 기록·pin 규약을 컨텍스트에 주입 |
| SubagentStart | 서브에이전트 기록 규약 주입 | 서브에이전트도 발견 즉시 기록 (pin·deprecate 판단은 메인의 일) |
| 작업 중 | 발견 즉시 캡처 + 영수증 | 기준은 재획득 비용 — `memory_write` 직후 사용자에게 📝 영수증 표시 |
| 작업 중 | 사용 자동 관측 | `memory_read`가 곧 사용 신호 — 이벤트 로그에 자동 기록, 선언 불요 |
| 턴·서브에이전트 종료 | tick +1 (침묵) | Stop·SubagentStop이 LLM 연산량 시계를 올린다 — 블록 없음 |
| 언제든 | 사람의 개입 | 파일 직접 편집, 또는 `memory_pin` / `memory_unpin` 지시 |

배경 프로세스 없음. 모든 로직은 hook과 툴 호출 안에서만 (불변식 1).

## 수명주기 (v0.3 — 선언·계산·시계의 삼분)

- **정본 상태 (선언)**: `captured`(탄생) / `pinned`(항상 주입 — 기준은 미래 필요, 극소수 불변만) / `deprecated`(폐기 — supersedes로 대체 선언)
- **읽기 순위 (계산, 저장 안 함)**: hot(최근 창 내 재사용 실적) / recent(신참 유예) / cold(주입 0, 검색으로만)
- **시계 3개**: epoch(작업 단위) / tick(LLM 연산량) / ts(달력) — 사용 이벤트에 셋 다 기록, 판정식은 데이터 축적 후 튜닝
- **역방향은 계산**: 정본에는 선언만. superseded_by 없음, referenced-by는 읽기 시점 계산

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

## 구현 상수 (잠정 — 이벤트 데이터가 판결)

| 상수 | 값 |
|---|---|
| recent 유예 창 = hot 관측 창 | 10 epoch |
| hot 문턱 (창 내 distinct epoch read 수) | 2 |

값은 `server/lib.js` 상단.
