# Agent Memory Convention — IMPLEMENTATION.md

> 상태: v0.1 구현 완료 (2026-07-08). 구현체 이름: **memorj** (구 engram — 2026-07-14 개명)
> 스펙 문서(spec-v0.1-draft-r2.md)는 의미론만 담는다. 구현 결정은 전부 이 문서에 쌓는다.
> 대상 하네스: Claude Code (첫 어댑터). 산출물: hook 세트 + MCP 서버.

## 진행 규칙 (구현 세션의 에이전트에게)

- 아래 결정들은 **순서대로** 진행한다 — 뒤의 결정이 앞의 결정에 의존한다
- 각 결정에서 스펙의 불변식·보장과 충돌하는 선택지는 즉시 기각한다
- 결정하면 이 문서에 결정 내용 + 근거를 기록하고 다음으로 간다
- 스펙 문서를 수정해야 하는 발견(가정이 깨진 경우 등)이 나오면 멈추고 사람에게 보고한다

---

## 0. Claude Code hook API 사실 확인 — 완료 ✅ (2026-07-08, 공식 문서 검증)

스펙이 서 있는 가정 2개를 공식 문서로 검증했다. **둘 다 성립. 스펙 영향 없음 — §7.3 채널 설계 유지.**

- [x] **가정 A: 성립.** Stop hook이 종료를 차단하고 이유/지시를 반환할 수 있다
  - 차단 2경로: exit code 2 (stderr가 피드백) / stdout JSON `{"decision": "block", "reason": "..."}` — reason이 에이전트에게 지시로 전달됨
  - 입력(stdin JSON): `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `stop_hook_active`
  - `stop_hook_active` = 이번 정지가 이미 Stop hook의 block에서 이어진 것인지 — 루프 가드 재료
  - 네이티브 가드: 연속 8회 block 시 Claude Code가 hook을 무시 (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`로 조정) — 규약 자체 cap(2, §6)은 이 안쪽에서 동작
- [x] **가정 B: 성립.** SessionStart hook의 stdout(또는 JSON `additionalContext`)이 컨텍스트에 주입된다
  - 형태: system reminder로 에이전트에게 보임 (유저 화면엔 비표시). 크기 제한은 문서에 미명시 — manifest 토큰 예산은 자체 관리
  - matcher 4종: `startup | resume | clear | compact` — epoch/주입 정책을 matcher별 분기 가능 (→ 결정 5)
- [x] 부가: 두 hook 모두 입력에 `session_id` + `transcript_path` 포함 (→ 결정 4의 (a) 성립 근거)
- [x] 부가: **MCP 서버는 session_id를 받지 못한다 (공식 문서상 메커니즘 없음)** → 서버↔hook 세션 연동은 파일 기반 핸드오프로 해결 (→ 결정 3·4)
- [x] 부가: 플러그인 한 패키지에 `hooks/hooks.json` + `.mcp.json` 동시 배포 가능. `${CLAUDE_PLUGIN_ROOT}`로 자기 경로 참조
- [x] **발견: Stop hook의 발동 시점 = 매 턴 종료 (세션 종료 아님)** → 정산 단위를 어댑터가 재정의 (결정 4)

근거: code.claude.com/docs/en/hooks-guide.md, hooks.md, plugins.md

## 1. 프로젝트 식별자

manifest 조립과 `.memory/` 위치 결정의 전제. "지금 어느 프로젝트인가"를 무엇으로 판별하나.

- 후보: git root 기준 / cwd 기준 / `.memory/` 디렉토리의 존재 자체를 마커로 (상향 탐색)
- 제약: 보장 3 (git 없는 프로젝트도 성립해야 — git root 단독 기준은 불가)
- 열림: 모노레포 — 서브 디렉토리별 `.memory/`를 허용하나, 최근접 하나만 인식하나
- 결정: **최근접 `.memory/` 마커 상향 탐색 → git root → cwd 순으로 루트 판별** ✅
  - cwd에서 상향 탐색해 최근접 `.memory/`를 찾으면 그것이 정본 위치이자 프로젝트의 정의. 모노레포는 자동 해결 — 서브 디렉토리별 `.memory/` 허용, 최근접 하나만 인식 (git이 최근접 `.git`을 찾는 것과 동형)
  - 마커 없으면 git root를 루트로 보고, 첫 project 스코프 쓰기 시점에 `.memory/` lazy 생성 — init 의식 불요 (보장 1)
  - git도 없으면 정본은 `~/.memory/projects/<slug>/` 폴백 (스펙 §3) — 임의 디렉토리 오염 방지
  - slug = 루트 basename + 루트 절대경로 sha256 앞 4hex (동명 프로젝트 충돌 회피)
  - 근거: git root 단독 기준은 보장 3 위반. 마커 우선이라 사람이 `.memory/`를 만들어 위치를 강제 지정할 자유도도 보존

## 2. 파일 규칙

- 확정 (스펙에서 이월):
  - 엔트리당 파일 하나, 플랫 디렉토리, 상태는 frontmatter에만, 전이 = 필드 편집
  - frontmatter 필드: id, title, type, state, scope, project, epoch, created, source, session, promoted_by, supersedes
  - `.memory/epoch` — 정수 하나, 근사적 단조 증가면 충분 (lock 없음)
- [x] id 생성 규칙 정식화
- [x] 파일명 슬러그 여부
- 결정: ✅
  - id = `YYYY-MM-DD-<4hex>`, hex는 random. 충돌 시 재생성 (같은 디렉토리 내 파일 존재 검사 — 일 단위 네임스페이스라 4hex로 충분)
  - 파일명 = `<id>.md`, **title 슬러그 불포함** — 경로는 의미를 갖지 않는다. 제목의 정본은 frontmatter `title` 하나뿐 (파일명에 이중화하면 제목 수정 = rename이 되어 id 안정성이 깨짐. Obsidian 가독성은 파일 첫 화면의 frontmatter title로 충분)
  - 디렉토리 배치:
    - project: `<root>/.memory/entries/*.md` (플랫 — 상태별 폴더 없음, 전이 = frontmatter 편집), `<root>/.memory/epoch`. **세션 핸드오프 상태는 정본 밖** — `~/.memory/.state/projects/<slug>.json` (파생물·삭제 무해. 정본 디렉토리엔 정본+epoch만: repo 오염 없음, `.memory` 미생성 시점에도 상태 기록 가능)
    - global: `~/.memory/entries/*.md` (epoch 없음 — global 스코프에 휴면 없음, §4.3)
  - entries/ 하위 분리 근거: 정본(엔트리)과 운영 파일(epoch, .state)의 시각적 구분 — 사람이 Obsidian으로 열었을 때 엔트리만 보이는 폴더가 있는 게 열람 품질

## 3. MCP 툴 시그니처 (4개)

- [x] 툴 6개로 확정. 서버는 stdio MCP (플러그인 `.mcp.json`, `${CLAUDE_PLUGIN_ROOT}` 기동). 구현 언어: **Node 내장만** — Claude Code가 이미 요구하는 런타임, 외부 의존 0 (JSON-RPC stdio 직접 구현, ~수백 줄)
- 결정: ✅
  - `memory_write({title, type, body, scope, supersedes?})` — **한 호출에 엔트리 하나** (스키마 명료성; 복수는 반복 호출로). state 파라미터 없음 — 전부 captured 탄생. 단 supersedes가 promoted 엔트리를 가리키면 슬롯 상속(§5.3)을 서버가 자동 적용: 새 엔트리 promoted 탄생(`promoted_by: supersession`) + 옛 엔트리 superseded 전이. id·epoch·created·session·source는 서버가 채움
  - `memory_settle({promote?: id[]})` — 정산 선언. **no_entries 플래그 불요: settle 호출의 발생 자체가 빈 정산 선언** (hook은 발생만 검사, 개수 불강요 — 스펙 §7.4와 정합·단순화). 낳은 지식은 settle 전에 memory_write 반복 호출, 빌려 쓴 captured의 승격은 promote 배열로 (`promoted_by: agent` 기록)
  - `memory_search({query})` — grep 기반 (대소문자 무시, title+본문 대상). 반환: 건당 `{id, title, type, state, epoch}` + 매치 스니펫 1줄, 최대 20건. 랭킹 = 상태 우선순위(promoted > 활성 captured > 휴면 captured) 내 epoch 내림차순. superseded는 기본 제외, `include_superseded: true`로 포함 (깊은 검색 = 히스토리까지)
  - `memory_read({id})` — frontmatter + 본문 전체 반환. 단순 유지
  - `memory_promote({id})` / `memory_demote({id})` — 사람 지시 대행 전용 (`promoted_by: human` / captured 복귀). 에이전트가 자발 호출하지 않도록 툴 description에 명시
  - **session 필드의 출처 (§0 ⚠️의 해결)**: 서버는 session_id를 모름 → SessionStart hook이 `~/.memory/.state/projects/<slug>.json`에 `{session_id, transcript_path}`를 기록, 서버가 쓰기 시점에 읽어 스탬프. 동시 세션의 race는 epoch과 동일하게 근사 허용 (session은 참고용 포인터, 의미론 없음 — §4.5)

## 4. Stop hook 판정 로직

"이번 세션에 정산이 있었나"를 hook이 아는 방법.

- 후보 (0번 확인 결과에 의존):
  - (a) hook이 transcript를 파싱해 memory_write/settle 호출 탐지
  - (b) MCP 서버가 세션별 정산 플래그를 로컬에 남기고 hook이 읽음 — 서버-hook 공유 상태 발생, 위치·수명 설계 필요
- 제약: 불변식 1 (판정은 세션의 사건 안에서 — 별도 데몬 불가)
- [x] 무한 루프 가드 확정
- 결정: **(a) transcript 파싱** ✅
  - (b) 기각 근거: MCP 서버가 session_id를 모르므로(§0) 플래그의 세션 귀속이 부정확. transcript는 하네스가 보장하는 세션 사건의 정본이고 hook이 경로를 직접 받는다
  - **구현 중 발견: Stop hook은 세션 종료가 아니라 매 턴 종료마다 발동한다.** 스펙 위반은 아님 — §7.3이 이미 "턴 종료 시도"로 표현하고, "세션"의 정의는 하네스 어댑터에 위임(§4.4). 단 매 턴 정산 강제는 순수 대화 턴에까지 의식을 요구하므로 기각. **Claude Code 어댑터의 정산 단위: "마지막 정산 이후 tool_use가 T(=5)개 이상 쌓인 턴의 종료"** — 실질 작업 없는 턴은 무정산 통과. 정산은 세션당 1회가 아니라 작업 덩어리당 1회가 될 수 있다 (주기적 정산 — 세션 정산 의미론의 세분화)
  - 검사: transcript에서 마지막 settle tool_use 이후의 `"type":"tool_use"` 개수를 센다. settle 매치는 반드시 `"name":"mcp__…memory_settle"` 필드 패턴으로 — block reason 텍스트에 등장하는 "memory_settle" 문자열과의 오인 방지. 검사 범위가 transcript 전체라 resume 세션의 과거 정산이 인정되는 근사 허용 (v0.1)
  - 미정산 시: `{"decision": "block", "reason": "<정산 지시문>"}` — 지시문에 이중 역할(낳은 지식 memory_write + 빌려 쓴 captured 심판 후 memory_settle) 명시
  - 루프 가드: block 횟수를 상태 파일의 `stop_blocks`로 추적, **최대 2회, 초과 시 통과 (fail-open)** — 정산 강제가 세션을 인질로 잡지 않는다. 카운터는 정산 성공 시 리셋. 미정산 통과분은 다음 SessionStart의 미정산 감지(결정 5)가 복구. Claude Code 네이티브 8회 cap의 안쪽
  - 발동 범위: 프로젝트 `.memory/` 또는 `~/.memory/entries/`가 존재할 때만 — 규약 미사용 프로젝트의 세션을 방해하지 않는다 (opt-in = `mkdir .memory` 또는 첫 memory_write)

## 5. SessionStart 로직

한 번의 hook이 하는 일, 순서대로:

1. 프로젝트 식별 (결정 1)
2. epoch 읽기 + 증가 + 쓰기
3. 미정산 감지
4. manifest 조립
5. 주입 (stdout)

- 결정: **matcher별 분기** ✅
  - `startup | clear`: 위 5단계 전부 — epoch++ 는 여기서만 (새 작업 단위의 시작)
  - `resume | compact`: manifest 재주입만, epoch 불변 (같은 작업 단위의 연속. compact는 컨텍스트가 압축돼 manifest가 소실됐을 수 있으므로 재주입 필수)
  - 미정산 감지 (v0.1 최소): 상태 파일(`~/.memory/.state/projects/<slug>.json`)에 직전 세션 기록이 있는데 settled 마크가 없으면, manifest 앞에 한 줄 경고 주입 — "직전 세션 미정산. transcript: <경로>. 사용자와 상의해 재증류 여부 결정" — 자동 재증류는 v0.1 스코프 밖 (복구는 예외 경로, §7.4)
  - settled 마크: Stop hook이 settle 검출 성공 시 상태 파일에 기록 (세션 중 1회 이상 정산 = settled)
  - manifest 포맷: 스펙 §6.1 그대로 — `[PROMOTED — 이 스코프의 진실]` 전체 + `[RECENT — 최근 K epoch의 미검증 후보]`, 항목 = `[type] title (id: xxxx)`. global 스코프 엔트리는 별도 구획으로 앞에 (global은 전 프로젝트 공통 가드레일)
  - global 스코프의 RECENT: epoch이 없으므로 최근 창은 project만. global captured는 검색으로만 발견 → **주의: 스펙 §6 "최근 captured는 발견 가능해야 (MUST)"와의 정합** — global captured의 생존 기회 창구가 없다. v0.1 결정: global RECENT는 created 시각 기준 최근 N건(10)으로 대체 (벽시계가 아니라 개수 — epoch 정신 유지)

## 6. 상수 기본값 (dogfooding이 판결할 초기값)

| 상수 | 제안 초기값 | 튜닝 신호 |
|---|---|---|
| 최근 창 K (manifest의 captured 구역) | 10 epoch | manifest가 시끄러움 ↔ 신생 지식이 안 보임 |
| 휴면 K (검색 후순위 경계) | 10 epoch | 휴면 오탐 (깊은 검색으로 깨어나는 빈도) |
| Stop block 최대 횟수 | 2 | 루프 발생 여부 |
| 정산 요구 문턱 T (마지막 정산 이후 tool_use 수) | 5 | 정산 스팸 ↔ 캡처 누락 |

## 7. Dogfooding 셋업

- [ ] 첫 대상 프로젝트: 이 프로젝트 자체 (`.memory/`의 epoch 1 = 이 스펙 논의)
- [ ] 측정 4종 기록 방법 (스펙 §9): agent 승격 정밀도 / manifest 크기 추이 / 휴면 오탐 / 정산 품질 — 별도 도구 없이 git log + 파일 스캔으로 시작
- [ ] `~/.memory/` git init (VCS 위임 SHOULD 이행)

## 부록: 스펙에서 내려온 제약 요약 (구현 중 상시 참조)

- 불변식 1: 배치/cron/데몬 금지 — 모든 로직은 hook과 툴 호출 안에서
- 불변식 2: 시스템은 삭제하지 않는다 — 휴면은 읽기 계산일 뿐, graveyard 없음
- 보장 4: manifest·인덱스·플래그 등 모든 파생물은 정본에서 재구축 가능해야
- 필드 최소성: 새 필드는 현재 시제의 소비자가 있어야
- 판정 기준: "빌리려는 게 git의 원리인가 기계인가" — 기계면 git에게
