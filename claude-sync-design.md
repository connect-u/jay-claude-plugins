# claude-sync: LLM 기반 협업 개발 동기화 레이어

## 0. 한 줄 요약

여러 개발자가 각자의 Claude Code 세션으로 동시에 개발할 때, **각자의 컨텍스트와 결정사항을 의미 단위로 동기화**해서 중복 구현 / 엇갈린 추상화 / 사라지는 결정 문제를 해결하는 MCP 기반 협업 레이어.

---

## 1. 문제 정의

### 1.1 배경

LLM 에이전트가 개발 생산성을 끌어올리면서, 기존 협업 도구의 한계가 드러나고 있다:

- 한 사람이 하루에 기능 여러 개를 뽑아낸다
- 각자의 에이전트가 **각자의 합리적 판단**으로 유틸/추상화/타입을 생성한다
- git은 텍스트 충돌은 잡지만, **의미적 충돌**(둘 다 retry 유틸을 다른 모양으로 만듦)은 못 잡는다
- 대화 세션 안의 결정사항은 한 사람의 머릿속/세션에 갇혀있다

### 1.2 해결하려는 3가지 핵심 문제

**P1. 컨텍스트 사일로**
A의 Claude가 3시간 걸려 만든 맥락을, B의 Claude는 전혀 모른다. B는 git에서 코드만 보고 처음부터 다시 설명해야 한다.

**P2. 의미적 충돌**
1번 브랜치와 2번 브랜치가 동시에 진행될 때, 둘 다 비슷한 모듈을 다른 인터페이스로 만든다. 머지 시점에야 발견된다.

**P3. 휘발성 결정**
"왜 Redis 대신 SQS로 갔는가" 같은 결정이 대화 세션 안에서 발생하고, 어디에도 기록되지 않은 채 사라진다. 3개월 뒤 아무도 이유를 모른다.

### 1.3 시장의 빈 자리

- Cursor/Claude Code rules — 정적 컨텍스트만, 동적 동기화 없음
- Graphite/Stacked PRs — PR 의존성은 풀지만 LLM 컨텍스트 충돌 미해결
- Linear/Jira MCP — 티켓 정보는 주는데 코드 충돌과 연결 안 됨
- Sourcegraph Cody — 코드 검색은 잘하는데 협업 동기화는 별개

**"동시 진행 중인 다른 에이전트들의 작업을 내 에이전트가 인지하게 만드는 레이어"가 비어있다.**

---

## 2. 핵심 철학

### 2.1 Init은 "정하지 않을 것"을 정하는 자리

전통적 init: 모든 걸 미리 정한다 → 곧 무용지물이 됨
claude-sync init: **안 바뀔 좁은 핵심만 정하고**, 나머지는 발생 시점에 캡처할 그릇만 만든다.

### 2.2 결정은 발견되는 것이지 선언되는 것이 아니다

좋은 설계는 코드를 짜면서 발견된다. 따라서 도구는 "init에서 잘 정하기"가 아니라 **"발견을 잘 캡처하기"** 에 집중해야 한다.

### 2.3 자동 감지 + 1초 확정

완전 자동 캡처는 노이즈로 망가지고, 완전 수동은 까먹어서 망가진다.
**에이전트가 감지 → 사람이 1초 안에 확정/거부** 가 실용적 최적점이다.

### 2.4 컨텍스트는 레포의 1급 시민

`.sync/` 디렉토리는 코드만큼 중요하다. PR에 코드 변경과 컨텍스트 변경이 함께 들어간다.

---

## 3. 시스템 구조

### 3.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                  개발자 A의 Claude Code                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Hook: 대화 흐름에서 결정 후보 감지                  │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ MCP Client → claude-sync MCP Server                │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│                claude-sync MCP Server (local)           │
│  - 결정 캡처 / 확정                                      │
│  - 인텐트 등록                                           │
│  - 충돌 감지                                             │
│  - 컨텍스트 조회                                         │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│            Shared State Store (팀 단위)                  │
│  v1: 레포 안 .sync/ 디렉토리 (JSON/Markdown)             │
│  v2: 별도 서비스 (Postgres + 벡터 DB)                    │
└─────────────────────────────────────────────────────────┘
                          ↕
              [개발자 B, C, ... 의 동일 구조]
```

### 3.2 레포 구조

```
project-root/
├── PROJECT.md              # Frozen Core (좁고 안 바뀜)
├── CLAUDE.md               # Living Context 인덱스 (자라남)
├── .sync/
│   ├── intents/            # 진행 중인 작업 의도들
│   │   ├── 2026-05-13-payment-retry.json
│   │   └── 2026-05-13-user-notification.json
│   ├── decisions/          # 확정된 결정 (ADR)
│   │   ├── 0001-error-format.md
│   │   ├── 0002-queue-redis-to-sqs.md
│   │   └── ...
│   ├── contracts/          # 인터페이스 계약
│   │   ├── api/
│   │   └── types/
│   └── drafts/             # 감지됐지만 미확정 결정 후보
│       └── session-{id}.json
└── src/...
```

---

## 4. 핵심 기능

### 4.1 Frozen Core — PROJECT.md

3명이 모여서 합의하는 진짜 좁은 것들만. A4 1~2장 이내.

```markdown
# Project: [이름]

## 한 줄 정의
[X를 위한 Y를 만든다]

## 유저 시나리오 (핵심 3~5개)
1. ...
2. ...

## 시스템 경계
- 우리가 만드는 것:
- 외부 의존:

## 비기능 요구사항 (아키텍처 영향)
- ...

## 기술 스택 (바꾸기 어려운 결정)
- 언어:
- 주요 프레임워크:
- DB:
```

함수 이름, 모듈 구조, 클래스 설계는 **여기 들어가지 않는다**.

### 4.2 Living Context — CLAUDE.md + .sync/

CLAUDE.md는 사람이 직접 쓰지 않는다. 에이전트가 결정사항을 캡처할 때마다 자동 갱신된다.

```markdown
# Claude Context Index

## 활성 규칙
- 에러 응답은 problem+json 포맷 (ADR-0001)
- 비동기 작업은 SQS 사용 (ADR-0002, supersedes ADR... )

## 도메인 용어
- "주문" = 결제 완료 이후 상태만 의미

## 현재 진행 중인 작업
- @alice: payment-retry (intents/2026-05-13-...)
- @bob: user-notification (intents/2026-05-13-...)

## 최근 결정 (최근 10개)
- 2026-05-13: SQS로 전환 (ADR-0002)
- ...
```

### 4.3 Intent Registry — 작업 시작 선언

```bash
# CLI 또는 Claude Code slash command
/sync claim "결제 실패 시 재시도 큐 추가"
```

자동으로:
1. 영향받을 디렉토리/모듈 추정 (LLM이 PROJECT.md + 기존 코드 보고 판단)
2. `.sync/intents/{date}-{slug}.json` 생성
3. **다른 팀원의 진행 중 intent와 겹치는지 검사**
4. 겹치면 경고: "@bob이 같은 영역(`/payments/*`)에서 작업 중. 조율 필요"

### 4.4 자동 결정 감지 — Hybrid Capture

**감지는 자동, 확정은 사람.**

에이전트가 세션 도중 결정 후보를 감지하면:
- `.sync/drafts/session-{id}.json`에 누적
- Claude Code 사이드패널 또는 세션 종료 시점에 표시

```
이번 세션에서 감지된 결정 후보:

[1] 에러 응답 포맷 → problem+json
    근거: "프론트에서 파싱 일관성을 위해..."
    [확정] [수정] [무시]

[2] retry는 데코레이터 패턴
    근거: "기존 BillingService 변경 최소화..."
    [확정] [수정] [무시]

[3] 변수명 userId 사용
    → 노이즈로 자동 분류됨 (표시 안 함)
```

확정된 것만 `.sync/decisions/`에 ADR로 PR 생성.

### 4.5 Reversal 감지

가장 가치 큰 기능. 사람은 결정을 뒤집을 때 ADR 업데이트를 거의 안 한다.

```
🔄 이전 결정과 충돌 감지

ADR-0014 (Redis 사용)을 뒤집고 있어요.
지금 대화에서 SQS로 전환하는 흐름이 보입니다.

ADR-0014를 [Superseded]로 표시하고
ADR-0027 (SQS 전환)을 새로 만들까요? [Y/n]
```

### 4.6 사전 충돌 감지 (Pre-conflict Detection)

새 파일/함수/타입 생성 직전, 다른 브랜치들의 진행 중 변경과 비교:

```
⚠ 유사 구현 감지

`/utils/retry.ts` 만들려고 하는데,
@bob의 브랜치 `feature/notification-retry`에서
`/utils/asyncRetry.ts`를 작성 중입니다.

[Bob의 작업 보기] [그래도 진행] [Bob과 통합 제안]
```

### 4.7 Living Context 자동 로딩

다른 사람이 Claude Code를 시작할 때, MCP 서버가 자동으로:
- 최근 N일간의 확정된 결정사항
- 현재 진행 중인 다른 팀원의 intent
- 사용자의 현재 브랜치와 관련된 컨텍스트

를 컨텍스트에 주입한다. 사람이 "어제 누가 뭐 결정했지?" 물을 필요 없음.

---

## 5. 데이터 모델

### 5.1 Intent

```json
{
  "id": "intent-2026-05-13-payment-retry",
  "title": "결제 실패 시 재시도 큐 추가",
  "owner": "alice",
  "created_at": "2026-05-13T10:00:00Z",
  "status": "active | completed | abandoned",
  "estimated_scope": {
    "paths": ["/payments/*", "/workers/retry/*"],
    "modules": ["BillingService", "RetryWorker"]
  },
  "branch": "feature/payment-retry",
  "related_decisions": ["ADR-0002"],
  "linked_ticket": "LIN-1234"
}
```

### 5.2 Decision (ADR)

```markdown
# ADR-0002: 비동기 작업 큐로 SQS 사용

- Status: Accepted
- Date: 2026-05-13
- Supersedes: ADR-0014
- Author: alice (via claude-sync auto-capture, confirmed)

## Context
결제 retry, 알림 발송 등 비동기 작업이 늘어나면서...

## Decision
AWS SQS를 사용한다.

## Consequences
- 운영 부담 감소 (관리형 서비스)
- Redis 대비 throughput 낮음 (충분함)

## Rejected Alternatives
- Redis: 직접 운영 부담
- RabbitMQ: 인프라 추가
```

### 5.3 Decision Draft

```json
{
  "id": "draft-{uuid}",
  "session_id": "claude-session-abc",
  "detected_at": "2026-05-13T11:30:00Z",
  "category": "architecture | api-contract | naming | implementation",
  "confidence": 0.85,
  "title": "에러 응답 포맷 problem+json 사용",
  "context_excerpt": "...관련 대화 인용...",
  "suggested_adr": { /* ADR 초안 */ },
  "status": "pending | confirmed | rejected | merged"
}
```

---

## 6. MCP 인터페이스

claude-sync는 MCP 서버로 구현되어 Claude Code뿐 아니라 Cursor, Cline, Continue 등 모든 MCP 호환 에이전트에서 사용 가능하다.

### 6.1 노출 도구

```
sync_claim_intent(title, scope?) → Intent
sync_list_active_intents() → Intent[]
sync_check_conflict(paths) → Conflict[]

sync_propose_decision(title, context, category) → Draft
sync_confirm_decision(draft_id, edits?) → ADR
sync_reject_decision(draft_id, reason?) → void

sync_get_recent_decisions(n, filter?) → ADR[]
sync_get_context_for_paths(paths) → Context
sync_detect_reversal(current_intent) → Reversal[]
```

### 6.2 Claude Code Hooks

```yaml
# .claude/hooks.yaml
on_session_start:
  - sync_load_living_context

on_message:
  - sync_detect_decision_candidates  # 백그라운드

on_file_create:
  - sync_check_similar_implementations

on_session_end:
  - sync_review_drafts  # 확정 UI 표시
```

---

## 7. 노이즈 관리 전략

**가장 중요한 IP가 될 부분.** 모든 결정을 다 캡처하면 컨텍스트가 쓰레기로 가득 찬다.

### 7.1 카테고리별 차등 임계값

| 카테고리 | 기본 정책 |
|---------|----------|
| API 계약 / 스키마 변경 | 항상 draft 생성 |
| 외부 의존성 추가 | 항상 draft 생성 |
| 아키텍처 패턴 (큐, 캐시 전략 등) | 항상 draft 생성 |
| 도메인 용어 정의 | draft 생성 |
| 구현 디테일 (패턴 선택, 라이브러리) | 신뢰도 ≥ 0.8일 때만 |
| 변수명/함수명 | 캡처 안 함 (단, 도메인 용어로 승격 가능) |

### 7.2 팀별 학습

reject 패턴을 학습해서 자동 필터 조정.
- "이 팀은 라이브러리 선택은 ADR로 안 함"
- "이 팀은 네이밍 결정도 ADR로 캡처함"

### 7.3 결정의 "확정 시점" 처리

대화 중 결정이 흔들릴 때 (Redis→SQS→Redis→SQS):
- 매 변경마다 draft 갱신
- 세션 종료 또는 명시적 확정 시점에 최종본만 ADR
- 흔들림 과정은 ADR의 "Considered Alternatives" 섹션에 보존

---

## 8. 워크플로우 예시

### 8.1 새 프로젝트 시작

```bash
$ claude-sync init my-project
✓ PROJECT.md 템플릿 생성
✓ CLAUDE.md 스켈레톤 생성
✓ .sync/ 구조 생성
✓ Claude Code MCP 설정 추가

# 3명이 PROJECT.md 채우기 (30분~1시간)
# 이후 각자 작업 시작
```

### 8.2 일상 워크플로우 (Alice)

```bash
# 아침
$ claude-code
# → 자동으로 어제 이후의 결정사항 / Bob, Charlie의 active intent 로딩

# 작업 선언
Alice: /sync claim "결제 실패 재시도 추가"
Claude: ✓ Intent 등록됨. 
        ⚠ Bob이 /workers/* 에서 작업 중. 충돌 가능성 있음.

# 개발 진행 (대화-개발 형태)
Alice: retry 로직 짜자. 데코레이터 패턴이 좋을 것 같아.
Claude: [draft 감지: retry는 데코레이터 패턴]
        ... 코드 작성 ...

# 세션 종료
Claude: 이번 세션에서 결정 2건 감지됨:
        [1] retry는 데코레이터 패턴 [확정]
        [2] 에러 포맷 problem+json [확정]
        → ADR PR 생성하시겠어요? [Y]
```

### 8.3 Bob이 다음날 시작

```bash
$ claude-code
Claude: 어제 Alice가 결정한 내용:
        - retry는 데코레이터 패턴 (ADR-0023)
        - 에러 포맷 problem+json (ADR-0024)
        
        Alice의 작업이 /workers/retry/* 와 겹쳤었어요.
        merged된 코드를 보고 작업 시작할까요?
```

---

## 9. 단계별 개발 계획

### Phase 1: MVP (1~2개월, 자체 사용)

**목표:** 우리 팀이 가설 검증

- [ ] MCP 서버 골격 (Node.js or Python)
- [ ] `.sync/` 디렉토리 구조 + JSON/Markdown 저장
- [ ] `sync_claim_intent`, `sync_list_active_intents`
- [ ] `sync_propose_decision`, `sync_confirm_decision` (수동 확정만)
- [ ] CLAUDE.md 자동 갱신
- [ ] Claude Code slash command 통합

**검증 지표:**
- 팀이 자발적으로 쓰는가
- 머지 충돌 / 중복 구현 횟수가 줄어드는가
- 3개월 뒤 ADR 들이 실제로 참조되는가

### Phase 2: 자동 감지 (2~3개월)

- [ ] 결정 후보 자동 감지 (hook 기반)
- [ ] Draft 리뷰 UI (CLI 또는 웹)
- [ ] 카테고리별 차등 임계값
- [ ] Reversal 감지

### Phase 3: 충돌 감지 (2~3개월)

- [ ] 의미적 유사도 기반 사전 충돌 감지
- [ ] 다른 브랜치 변경사항 인덱싱
- [ ] 인터페이스 계약 잠금

### Phase 4: 제품화 (외부 공개 검토)

- [ ] 별도 백엔드 서비스 (선택)
- [ ] 팀별 학습 / 필터 튜닝
- [ ] 대시보드 / 분석
- [ ] Cursor, Cline 등 타 에이전트 지원 확장

---

## 10. 리스크와 미해결 문제

### 10.1 사람의 채택 저항

"또 도구야?" 반응. 강제하면 안 쓰고, 자율로 두면 안 쓴다.
→ **자동화 비율을 최대한 높이고, 사용자에게 즉각적 보상**(다른 사람 컨텍스트 자동 수신) 제공.

### 10.2 노이즈가 신호를 죽임

자동 감지 정확도가 낮으면 사람이 draft 리뷰를 포기한다.
→ 처음엔 보수적 임계값 (놓치는 게 잘못 캡처하는 것보다 낫다).

### 10.3 결정이 코드와 어긋남

ADR엔 "SQS 쓴다" 인데 코드는 Redis인 상황.
→ 향후 PR 시점에 ADR과 코드 일치성 검증 (linter 형태).

### 10.4 프라이버시 / 보안

대화 내용이 .sync/drafts/에 남는다. 민감한 내용이 들어갈 수 있음.
→ 처음부터 redaction 정책 + 로컬 처리 우선.

### 10.5 내부 도구와 제품의 갭

우리 팀에선 슬랙/구두 합의로 메워지는 부분이, 외부 팀엔 도구가 다 잡아야 한다.
→ 6개월 자체 사용 후 일반화 검토.

---

## 11. 다음 액션

1. **이 문서 리뷰** — 팀 3명이 빠진 게 없는지
2. **수동 실험** — 다음 프로젝트에서 위 워크플로우를 수동으로 1사이클 돌려보기
   - PROJECT.md 직접 작성
   - 결정 발생 시 markdown 파일로 떨궈보기
   - 어느 부분이 마찰이 큰지 기록
3. **MVP 스코프 확정** — 수동 실험 결과 보고 Phase 1 범위 조정
4. **기술 스택 결정** — MCP 서버 언어 (Node vs Python), 저장 포맷
5. **개발 시작**

---

## Appendix A: 참고 자료

- MCP 스펙: https://modelcontextprotocol.io
- Architecture Decision Records: https://adr.github.io
- Trunk-based development: https://trunkbaseddevelopment.com
