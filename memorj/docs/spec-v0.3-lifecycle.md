# Agent Memory Convention — v0.3: 수명주기 개정 (lifecycle)

> 작성일: 2026-07-23
> 범위: v0.1의 **§5(상태 기계)·§6(읽기 경로)를 대체**하고, v0.2의 마감 게이트(§7.C 일부)를 은퇴시킨다.
> v0.2의 포착 규약(재획득 비용, 발견 즉시, 영수증)은 그대로 유효.
> 방법: dogfooding 판결 + 2026-07-23 설계 세션 (Jay).

---

## 1. 판결 — v0.1 §5/§6이 틀린 지점

- **승격이 일어나지 않는다.** 정본 16건 중 promoted 2, captured 13. settle 8회 이상 전부 빈 마감. 원인은 판단력이 아니라 **회상 실패** — "빌려 쓴 captured를 기억해뒀다가 마감 때 선언하라"는 규율을 요구하는데, 뭘 읽고 썼는지는 시스템이 이미 아는 사실이다. v0.2가 포착에서 쓴 수법(선언→관측)을 승격에도 적용해야 한다.
- **promoted가 두 개념을 한 몸에 묶고 있었다.** (a) 검증된 진실이라는 인식적 지위, (b) manifest 상시 주입이라는 주의(attention) 배분. 사용 측정이 (b)를 넘겨받으면 (a)에 남는 것은 "승격"이 아니라 **고정 선언**이다.
- **"승격 아니면 매장" 이분법.** RECENT 창(10 epoch)을 넘긴 captured는 검증 기회 없이 휴면으로 밀려난다. 자주 쓰이는 지식이 창 밖이라는 이유로 조용해지는 구조.
- **하락 비대칭.** recall 지향 포착의 정밀도를 관리층이 회수한다고 했는데, 회수 도구가 사람의 demote뿐이었다.

## 2. 구조 — 선언·계산·시계의 삼분

| 층 | 값 | 결정자 | 저장 |
|---|---|---|---|
| **정본 상태** (선언) | `captured` / `pinned` / `deprecated` | 판단 (에이전트·사람) | frontmatter |
| **읽기 순위** (계산) | hot / recent / cold | 측정 (사용 로그 + 시계) | 저장 안 함 — 읽기 시점 계산 |
| **시계** | epoch / tick / ts | — | epoch은 정본 옆, tick·ts는 이벤트 로그 |

1차원(한 상태 필드)으로 합치지 않는 이유: cold 전이는 "안 쓰임"이라는 무사건이라 상태로 저장하려면 배치가 필요하고(불변식 1 위반), hot은 관점·시점 의존이라 정본에 박는 순간 거짓말이 되며(팀 공유 시 "누구의 hot인가"에 답이 없음), 파생을 사실로 승격시키는 범주 오류다(보장 4). v0.1 §5.4가 휴면에서 이미 내린 결정("상태가 아니라 읽기 경로의 성질")의 일반화.

## 3. 정본 상태 — 새 §5

### 3.1 상태 3개

- **`captured`** — 저장된 지식. 탄생 룰 유지: 전부 captured로 태어난다 (즉석 과대평가 방지).
- **`pinned`** — 계속 주입되어야 하는 지식. **기준은 미래 필요**("앞으로 모든 세션이 이걸 알아야 하는가")이지 과거 실적이 아니다 — 실적은 hot이 측정한다. 그래서 pinned는 극소수의 불변("사용자는 신재유다", "TZ는 UTC 고정")로 유지된다. 자주 쓰이는 지식은 pin하지 않는다 — 환경이 바뀌면 자연히 식어야 하니까 (hot이 맡는 게 맞다). 이 극소수 원칙이 곧 manifest 토큰 방어다.
- **`deprecated`** — 폐기된 지식. 정지 표지판이지 이정표가 아니다: 정상 흐름(검색·manifest)에 나타나지 않고, 낡은 id로 도달해도 "쓰지 마라"는 신호면 충분하다. 현재 진실은 주제 검색이 자연히 찾는다 (후계자는 정의상 같은 주제).

### 3.2 전이 — 전부 선언, 전부 in-flow

```
memory_write ──────────────→ captured   (탄생 룰)
memory_pin(id) ────────────→ pinned     (재사용 순간의 판단 / 사람 지시 대행)
memory_unpin(id) ──────────→ captured   (사람 지시 대행 전용)
memory_write(supersedes: X) → X는 deprecated, 새 엔트리 탄생
                              (X가 pinned였으면 새 엔트리가 pinned로 탄생 — 슬롯 상속)
```

- pin의 자연 시점은 **재사용 순간** — captured를 당겨 쓰면서 "이건 상수다"를 체감할 때. 탄생 직후 pin은 사람이 명시했을 때만 (즉석 과대평가 방지).
- deprecate의 자연 시점은 **모순 발견 순간** — 새 지식을 쓰는 자리에서 supersedes로 선언. 후계자 없는 폐기(환경 변화로 그냥 무효)는 사람의 파일 편집으로 가능 — 에이전트 도구는 두지 않는다 (v0.3 범위 밖, 필요가 증명되면).
- **settle은 은퇴한다.** 포착은 발견 즉시(v0.2), 승격 근거는 측정(§4), pin·deprecate는 in-flow — settle에 남는 일이 없다. 실적(전부 빈 마감)이 증명. 마감 게이트·미마감 경고도 함께 은퇴 — 게이트가 지키던 "write 후 settle 짝"이라는 개념 자체가 사라진다.

### 3.3 역방향은 저장하지 않는다

**정본에는 선언만 적는다. 모든 역방향 데이터는 읽기 시점 계산이다.**

- `superseded_by` 폐지. 후계자 찾기 = `supersedes` 정방향 전수 스캔 (모든 연산이 이미 전 엔트리를 파싱하므로 추가 비용 0). deprecated 읽기 화면에 후계자를 표시하지도 않는다 — 정지 표지판이면 충분 (§3.1).
- `links:` (신설, 선택) — 이 기록이 딛고 선 엔트리 id들. **탄생 시점에 정방향만** 적는다. "누가 이걸 딛고 섰나"(referenced-by)는 계산. 참조당한 파일은 건드리지 않는다 — 엔트리는 불변의 탄생 기록으로 남는다.

## 4. 읽기 순위 — 새 §6

### 4.1 순위 (계산, 저장 안 함)

| 순위 | 정의 (잠정) | 의미 |
|---|---|---|
| pinned | 상태 그 자체 | 항상 주입 |
| **hot** | captured 중 최근 `RECENT_K` epoch 내 **서로 다른 epoch에서** `HOT_MIN_EPOCHS`(2)회 이상 read | 실적이 살려둠 — pin 후보 풀 |
| recent | captured 중 탄생 epoch이 `RECENT_K` 이내 (hot 제외) | 실적 없는 신참의 cold-start 유예 |
| cold | 나머지 captured | 주입 0 — 검색으로만 부활 |

- distinct epoch을 세는 이유: 한 세션에서 10번 읽은 것 ≠ 10세션에서 한 번씩 읽은 것.
- **판정식 파라미터는 잠정치다.** 어느 시계(epoch/tick/ts)를 어떤 비중으로 쓸지는 이벤트 데이터가 쌓인 뒤 튜닝 — 지금 확정은 데이터 없는 튜닝이다. 기록은 지금부터, 공식은 나중에.

### 4.2 Manifest 재편

```
[PINNED]                     ← 전부, 항상
[HOT — pin candidates]       ← 측정이 모아준 재사용 실적. "항상 필요한 불변이면 pin하라"
[RECENT]                     ← 신참 유예 창
```

settle이 하던 회고는 manifest가 이어받는다: pin 판단이 필요한 재료(hot)가 매 세션 시작에 눈앞에 있다. 의식 없이 상기만.

### 4.3 사용 관측 — 이벤트 로그

- 위치: `~/.memorj/.state/projects/<slug>/events.jsonl` — 정본 밖 파생물, 삭제 무해, git 무관. **사용 데이터는 개인의 것** (주의 배분은 개인적, 진실 지위는 공유) — 팀 전파는 하지 않는다.
- 형식: `{id, kind: born|read, epoch, tick, ts}` — append only. 쓰는 주체는 **MCP 서버 자동** (born은 write 처리 중, read는 read 처리 중). 에이전트도 사람도 편집하지 않는다.
- read 이벤트는 captured·pinned만 기록 (deprecated 읽기는 활용이 아니다). manifest 노출·검색 히트는 사용이 아니다 — **본문을 당겨봤다(read)가 유일한 사용 신호**.

### 4.4 시계 3개

| 시계 | 재는 것 | 굵기 | 증가 주체 |
|---|---|---|---|
| epoch | 작업 단위 | 굵음 | SessionStart (startup·clear) — 기존 유지 |
| **tick** | LLM 연산량 | 곱음 | **Stop·SubagentStop 훅, 침묵 +1** |
| ts | 달력 | 곱음 | 이벤트 기록 시각 |

epoch은 활동 기준 논리 시계라는 강점(방치 프로젝트가 안 늙음)을 유지하고 턴마다 올리지 않는다. tick이 "곱고 + 활동 기준"의 빈칸을 채운다 (긴 세션에서 epoch 동결 문제의 답). 게이트를 잃은 Stop 훅은 침묵하는 메트로놈으로 남는다.

## 5. 규모 특성 (설계 보장)

토큰 비용은 지식 총량 N이 아니라 **활성 집합(pinned + hot + recent)에 비례**한다 — manifest는 제목 한 줄씩, 본문은 read로 당길 때만, cold는 0토큰. 레이턴시는 전수 스캔 O(N)이지만 개인 규모(수천 건)에서 무해하고, 병목 시 인덱스는 파생물로 자유 추가 (보장 4). 유일한 무한 상시 비용은 pinned — 극소수 원칙(§3.1)이 방어이며 **manifest 크기 추이가 감시 지표**다.

## 6. 도구·훅 재편 (Claude Code 어댑터)

| 도구 | 변화 |
|---|---|
| `memory_write` | `links` 인자 추가. `scope` 제거 유지 |
| `memory_read` | read 이벤트 기록 + referenced-by 계산 표시. deprecated는 정지 표지판만 |
| `memory_search` | 랭킹 pinned > hot > recent > cold. `include_deprecated` |
| `memory_pin` / `memory_unpin` | 신설 (promote/demote 대체). pin은 에이전트 판단+사람 대행, unpin은 사람 대행 전용 |
| ~~`memory_settle`~~ ~~`memory_promote`~~ ~~`memory_demote`~~ | 은퇴 |

| 훅 | 변화 |
|---|---|
| SessionStart | epoch+1, manifest — 미마감 경고 제거 |
| SubagentStart | 기록 규약 (settle 문구 → pin·deprecate 금지 + links 지침) |
| Stop / SubagentStop | **tick +1, 침묵** (게이트 전체 제거) |

기존 정본과의 호환: 코드가 읽기 시점에 `promoted`→`pinned`, `superseded`→`deprecated`, `promoted_by`→`pinned_by`로 정규화한다 — 파일 마이그레이션 불요.

## 7. 이월 (다음 라운드)

- hot 판정식 확정 (시계 비중, 문턱) — 이벤트 데이터 축적 후
- links 기반 그래프 중심성의 랭킹 반영 — 그래프가 자란 뒤
- pinned 티어링 (상시 주입 vs pin이되 당겨읽기) — manifest 크기 추이가 신호를 주면
- global 스코프 재도입 (v0.2.1 유예 중)
- 후계자 없는 deprecate의 에이전트 도구 — 필요가 증명되면
