# Agent Memory Convention — IMPLEMENTATION.md

> 상태: 골격 (구현 세션에서 결정하며 채움)
> 스펙 문서(agent-memory-convention-v0.1-draft-r2.md)는 의미론만 담는다. 구현 결정은 전부 이 문서에 쌓는다.
> 대상 하네스: Claude Code (첫 어댑터). 산출물: hook 세트 + MCP 서버.

## 진행 규칙 (구현 세션의 에이전트에게)

- 아래 결정들은 **순서대로** 진행한다 — 뒤의 결정이 앞의 결정에 의존한다
- 각 결정에서 스펙의 불변식·보장과 충돌하는 선택지는 즉시 기각한다
- 결정하면 이 문서에 결정 내용 + 근거를 기록하고 다음으로 간다
- 스펙 문서를 수정해야 하는 발견(가정이 깨진 경우 등)이 나오면 멈추고 사람에게 보고한다

---

## 0. Claude Code hook API 사실 확인 — 필수 선행 ⚠️

스펙이 서 있는 가정 2개를 공식 문서로 검증한다. 여기가 깨지면 §7.3 채널 설계가 수정 대상.

- [ ] **가정 A**: Stop hook이 종료를 차단(block)하고 에이전트에게 이유/지시를 반환할 수 있다
  - 확인: 입출력 JSON 포맷, block 시 에이전트가 받는 것의 정확한 형태, 재시도 루프의 동작
- [ ] **가정 B**: SessionStart hook이 세션 컨텍스트에 텍스트를 주입할 수 있다
  - 확인: 주입의 형태(시스템? 유저 메시지?), 크기 제한
- [ ] 부가 확인: hook이 받는 입력에 세션 식별자·transcript 경로가 포함되는가 (→ 결정 4, 5의 재료)
- [ ] 부가 확인: MCP 서버와 hook이 같은 세션을 식별할 공통 키가 있는가

## 1. 프로젝트 식별자

manifest 조립과 `.memory/` 위치 결정의 전제. "지금 어느 프로젝트인가"를 무엇으로 판별하나.

- 후보: git root 기준 / cwd 기준 / `.memory/` 디렉토리의 존재 자체를 마커로 (상향 탐색)
- 제약: 보장 3 (git 없는 프로젝트도 성립해야 — git root 단독 기준은 불가)
- 열림: 모노레포 — 서브 디렉토리별 `.memory/`를 허용하나, 최근접 하나만 인식하나
- 결정: _(미정)_

## 2. 파일 규칙

- 확정 (스펙에서 이월):
  - 엔트리당 파일 하나, 플랫 디렉토리, 상태는 frontmatter에만, 전이 = 필드 편집
  - frontmatter 필드: id, title, type, state, scope, project, epoch, created, source, session, promoted_by, supersedes
  - `.memory/epoch` — 정수 하나, 근사적 단조 증가면 충분 (lock 없음)
- [ ] id 생성 규칙 정식화 — 예시 포맷 `YYYY-MM-DD-<4hex>`의 확정: hex의 출처(random?), 충돌 처리, 파일명 = id + `.md`?
- [ ] 파일명에 title 슬러그를 포함하나 (Obsidian 가독성) vs id만 (rename 불변성) — 경로는 의미를 갖지 않는다는 원칙과의 정합 검토
- 결정: _(미정)_

## 3. MCP 툴 시그니처 (4개)

- [ ] `memory_write` — frontmatter 스키마 준용. 확정 사항: state 파라미터 없음(전부 captured 탄생), title 필수, supersedes 옵션(지정 시 슬롯 상속 로직 발동). 열림: 한 호출에 엔트리 하나? 복수?
- [ ] `memory_settle` 또는 write의 변형 — 세션 정산의 표현. 열림: 빈 정산(no_entries) + 승격 심판(빌려 쓴 captured의 promote)을 어떻게 담나 — 별도 툴 vs write의 모드
- [ ] `memory_search(query)` — grep 기반. 열림: 반환 형태 (제목+id만? 스니펫? 최대 개수), 휴면 후순위의 구현 (epoch 필터? 정렬?)
- [ ] `memory_read(id)` — 본문 반환. 단순할 것
- [ ] `memory_promote(id)` / demote — 사람 지시 대행용. promoted_by 기록 포함
- 결정: _(미정)_

## 4. Stop hook 판정 로직

"이번 세션에 정산이 있었나"를 hook이 아는 방법.

- 후보 (0번 확인 결과에 의존):
  - (a) hook이 transcript를 파싱해 memory_write/settle 호출 탐지
  - (b) MCP 서버가 세션별 정산 플래그를 로컬에 남기고 hook이 읽음 — 서버-hook 공유 상태 발생, 위치·수명 설계 필요
- 제약: 불변식 1 (판정은 세션의 사건 안에서 — 별도 데몬 불가)
- [ ] 무한 루프 가드의 구현: block 최대 횟수? no_entries 선언의 전달 경로?
- 결정: _(미정)_

## 5. SessionStart 로직

한 번의 hook이 하는 일, 순서대로:

1. 프로젝트 식별 (결정 1)
2. epoch 읽기 + 증가 + 쓰기
3. 미정산 감지 — [ ] 판별 방법: 직전 세션의 정산 플래그/transcript 검사 (결정 4와 같은 재료). 감지 시: 세션 로그 기반 후처리 트리거 (복구 경로 — 구현은 v0.1에서 최소로: 사람에게 알림만? 자동 재증류까지?)
4. manifest 조립 — promoted 전체 + 최근 K epoch의 captured, 제목 수준. [ ] 정확한 포맷 문자열 확정
5. 주입 (가정 B의 형태로)

- 결정: _(미정)_

## 6. 상수 기본값 (dogfooding이 판결할 초기값)

| 상수 | 제안 초기값 | 튜닝 신호 |
|---|---|---|
| 최근 창 K (manifest의 captured 구역) | 10 epoch | manifest가 시끄러움 ↔ 신생 지식이 안 보임 |
| 휴면 K (검색 후순위 경계) | 10 epoch | 휴면 오탐 (깊은 검색으로 깨어나는 빈도) |
| Stop block 최대 횟수 | 2 | 루프 발생 여부 |

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
