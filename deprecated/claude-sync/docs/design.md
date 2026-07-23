# claude-sync: 설계 문서 (v2)

> **상태:** Draft v2 · 시나리오 검증 반영본
> **이전 버전:** `design-v1.md` (v1)

---

## 0. 미션

**여러 개발자가 각자의 LLM 에이전트로 동시에 개발할 때 발생하는 협업 문제를 해결한다.**

구체적으로는:
- 컨텍스트 사일로 (각자의 세션이 격리됨)
- 의미적 충돌 (git이 못 잡는 충돌 — 같은 영역의 다른 추상화)
- 휘발성 결정 (대화 안에서만 살다 사라지는 결정사항)
- 조율 누락 (조율이 필요한 순간을 사람이 인지 못함)

## 1. 두 개의 레이어

claude-sync는 두 가지 다른 성격의 일을 동시에 한다.

### 1.1 예방적 레이어 (Preventive)

문제가 발생하기 *전에* 합의된 규약 위에서 작업이 흘러가게 만든다.

- 프로젝트의 Frozen Core (`PROJECT.md`)
- 살아있는 컨텍스트 (`CLAUDE.md`)
- 인터페이스 계약 (`.sync/contracts/`)
- ADR (`.sync/decisions/`)

이 레이어가 잘 작동하면 충돌 자체가 줄어든다.

> **전제조건:** 이 레이어를 활용하려면 팀이 사전에 합의해야 할 규약들이 있다. → `docs/prerequisite-conventions.md` 참고

### 1.2 반응적 레이어 (Reactive)

문제가 발생할 *조짐이 보일 때* 적절히 개입한다.

- 충돌 감지 (Intent 충돌, 시그니처 충돌, 의미적 유사성)
- 결정 번복 추적 (Reversal)
- Active Coordination (조율 트리거)
- Cross-pollination (다른 사람 작업 발견 및 통합)

이 레이어가 잘 작동하면 발생한 문제가 *빠르게* 해소된다.

### 1.3 두 레이어의 관계

예방이 잘 되면 반응이 적게 필요하다. 반응에서 얻은 학습은 예방을 강화한다 (ADR 추가, 규약 갱신).

---

## 2. 핵심 철학

### 2.1 Init은 "정하지 않을 것"을 정하는 자리

전통적 init: 모든 걸 미리 정한다 → 곧 무용지물.
claude-sync init: **안 바뀔 좁은 핵심만** 정하고, 나머지는 발생 시점에 캡처할 *그릇*만 만든다.

### 2.2 결정은 발견되는 것이지 선언되는 것이 아니다

좋은 설계는 코드를 짜면서 발견된다. 도구는 "init에서 잘 정하기"가 아니라 **"발견을 잘 캡처하기"** 에 집중한다.

### 2.3 자동 감지 + 사람의 1초 확정

완전 자동은 노이즈로 망가지고, 완전 수동은 까먹어서 망가진다. **에이전트가 감지 → 사람이 명시적으로 확정** 이 실용적 최적점.

### 2.4 컨텍스트는 레포의 1급 시민

`.sync/`는 코드만큼 중요하다. PR에 코드 변경과 컨텍스트 변경이 함께 들어간다.

### 2.5 도구가 강요하지 않는다 — 모드를 판단한다

같은 도구가 4가지 다른 모드로 행동해야 한다:
- **일반 모드** — 평범한 작업, 백그라운드 감지
- **긴급 모드** — 핫픽스/데모 직전, 개입 최소화
- **Heavy 모드** — Frozen Core 변경, 영향 큰 reversal
- **Onboarding 모드** — 신규자 적극 가이드

모드 판단 자체가 핵심 알고리즘. → `§7 모드 판단`

### 2.6 에이전트 ↔ 에이전트 통신은 만들지 않는다

대신 **에이전트가 사람들의 조율을 *촉발*하고 *결과를 capture*** 한다. 이유:
- 자동 에이전트 합의는 책임 소재가 사라짐
- 사람의 슬랙/미팅 대화가 이미 자연스러운 협업 채널
- 도구는 입구(트리거)와 출구(capture)만 잡으면 됨

### 2.7 Sandbox / Production 자동 분리

브랜치 prefix로 자동 모드 전환:
- `spike/*`, `experiment/*` → Sandbox (sync 최소 개입)
- `feature/*`, `fix/*` → Production (sync 풀가동)
- `main` → 모든 sync 객체의 source of truth

사용자가 별도 선언 안 해도 됨.

---

## 3. 시스템 아키텍처

### 3.1 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│                  개발자 A의 에이전트                       │
│  (Claude Code / Cursor / Cline / Continue ...)           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Hooks: 결정 감지, 충돌 감지, 컨텍스트 로딩          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ MCP Client → claude-sync MCP Server                │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│                claude-sync MCP Server (local)            │
│  - 결정 캡처 / 확정 / Reversal 감지                       │
│  - Intent 등록 / 충돌 검사                                │
│  - 영향 분석 (코드/ADR/Intent 의존성)                     │
│  - 모드 판단                                              │
│  - Coordination 객체 생성                                 │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│            Shared State Store (팀 단위)                   │
│  v1: 레포 .sync/ 디렉토리 (JSON/Markdown, git 기반)       │
│  v2: 별도 서비스 (Postgres + 벡터 인덱스)                 │
└─────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────┐
│              External Integrations                       │
│  - Slack/Discord/Teams (Coordination 봇)                 │
│  - Calendar (미팅 자동 생성)                              │
│  - PR/Issue Tracker (PR 코멘트, 이슈 링크)                │
└─────────────────────────────────────────────────────────┘
                          ↕
              [개발자 B, C, ... 의 동일 구조]
```

### 3.2 레포 구조

```
project-root/
├── PROJECT.md              # Frozen Core (좁고 안 바뀜)
├── CLAUDE.md               # Living Context 인덱스 (자동 갱신)
├── .sync/
│   ├── intents/            # 진행 중 작업 의도
│   ├── decisions/          # 확정된 ADR
│   ├── coordinations/      # 다자 조율 기록 (NEW v2)
│   ├── migrations/         # 마이그레이션 계획 (NEW v2)
│   ├── retrospectives/     # 사후 회고 (NEW v2)
│   ├── contracts/          # API/타입 계약
│   └── drafts/             # 미확정 결정 후보
└── src/...
```

---

## 4. 데이터 모델

### 4.1 Intent

작업 시작 시 선언하는 의도. **살아있는 객체** — 작업 진행에 따라 갱신됨.

```json
{
  "id": "intent-2026-05-13-payment-retry",
  "title": "결제 실패 시 재시도 큐 추가",
  "owner": "alice",
  "branch": "feature/payment-retry",
  "created_at": "2026-05-13T10:00:00Z",
  "status": "active | blocked | completed | abandoned",
  "urgency": "normal | urgent",
  "estimated_scope": {
    "paths": ["/payments/*", "/workers/retry/*"],
    "modules": ["BillingService"]
  },
  "actual_scope": {
    "paths": ["...실시간 갱신..."]
  },
  "will_modify": [
    {"type": "function_signature", "target": "PaymentService.charge"}
  ],
  "depends_on": ["ADR-0023"],
  "blocks": [],
  "blocked_by": ["ADR-0031"]
}
```

### 4.2 Decision (ADR)

확정된 결정.

```yaml
id: ADR-0023
title: retry는 데코레이터 패턴
status: Proposed | Accepted | Scope-Limited | Superseded | Reverted
date: 2026-05-13
author: alice
confirmed_by: [alice]  # 명시적 확정자
supersedes: []
superseded_by: []

# v2 추가
maturity_score: 0.8   # 안정성 (의존 코드량, 번복 빈도 등)
trigger_conditions:   # 이 ADR이 언제 적용되는지
  - "비동기 작업에서 retry 로직이 필요한 경우"
  - "외부 API 호출 실패 처리"
scope_limits:         # Scope-Limited 시 어떤 부분이 유효한지
  applies_to: ["payment workers", "email workers"]
  not_applies_to: []

context: |
  ...
decision: |
  ...
consequences: |
  ...
considered_alternatives:
  - ...
```

### 4.3 Coordination (NEW v2)

다자 조율의 구조화된 기록.

```yaml
id: coordination-0007
title: PaymentService.charge 시그니처 충돌 조율
trigger: signature_conflict
trigger_details:
  intents: [intent-payment-retry, intent-refund]
  target: PaymentService.charge

participants: [alice, charlie]
external_participants: []  # PM, 보안 등

channel: slack
channel_ref: "https://acme.slack.com/archives/.../p123"

started_at: 2026-05-13T10:32:00Z
resolved_at: 2026-05-13T10:58:00Z

options_proposed:
  - {label: "chargeWithOptions 신규", chosen: false}
  - {label: "charge(opts: ChargeOptions) 리팩토링", chosen: true}
  - {label: "Charlie는 charge 미변경", chosen: false}

resolution: |
  PaymentService.charge(opts: ChargeOptions)로 리팩토링.
  ChargeOptions { retryPolicy?, refundContext? }
  
confirmation:
  - {user: alice, signal: "react ✅", at: ...}
  - {user: charlie, signal: "react ✅", at: ...}

actions_taken:
  - {type: "adr_draft", ref: "ADR-0031"}
  - {type: "intent_update", ref: "intent-payment-retry", change: "scope expanded"}
  - {type: "intent_update", ref: "intent-refund", change: "blocked_by: ADR-0031"}
```

### 4.4 Migration Plan (NEW v2)

Frozen Core 변경이나 대규모 reversal의 실행 계획.

```yaml
id: migration-0001
title: Redis Streams → SQS 전환
trigger_adr: ADR-0032
superseded_adrs: [ADR-0014]
affected_adrs: [ADR-0023, ADR-0028, ADR-0029]
affected_loc_estimate: 1200

phases:
  - phase: 1
    name: 신규 큐 SQS, 기존 유지
    duration_estimate: 2w
    owner: diana
  - phase: 2
    name: 중요도 낮은 큐부터 마이그레이션
    duration_estimate: 3w
    sub_tasks:
      - {area: email, owner: bob}
      - {area: settlement, owner: charlie}
      - {area: payment_retry, owner: alice}
  - phase: 3
    name: Redis 제거
    duration_estimate: 1w
    owner: diana

current_truth_overrides:  # 마이그레이션 중 임시 진실
  - "신규 큐는 SQS로 작성한다"
  - "기존 Redis 큐는 Phase 2까지 유지"
```

### 4.5 Retrospective (NEW v2)

과거 결정의 사후 평가. 도구 학습의 핵심.

```yaml
id: retro-0003
target_type: adr | coordination | migration
target_id: ADR-0031
evaluated_at: 2026-08-15  # 3개월 후

outcome: success | partial | failure
evidence:
  - "리팩토링 후 신규 호출자 3곳이 ChargeOptions 자연스럽게 사용"
  - "Charlie의 환불 작업 충돌 없이 완료"
  - "다만 ChargeOptions가 너무 비대해져서 후속 분할 필요했음"

lessons:
  - "옵션 객체 통합은 좋았지만, 초기 인터페이스를 더 좁게 시작해야 함"

would_repeat: yes | no | with_changes
```

### 4.6 Decision Draft

미확정 결정 후보 (자동 감지된 것).

```json
{
  "id": "draft-{uuid}",
  "session_id": "claude-session-abc",
  "detected_at": "2026-05-13T11:30:00Z",
  "category": "architecture | api-contract | naming | implementation | policy",
  "confidence": 0.85,
  "title": "에러 응답 포맷 problem+json 사용",
  "context_excerpt": "...관련 대화 인용...",
  "suggested_adr": { /* ADR 초안 */ },
  "status": "pending | confirmed | rejected | merged | expired"
}
```

---

## 5. 핵심 메커니즘

### 5.1 Intent Registry — 작업 의도 등록

```
$ claude-code

User: /sync claim "결제 실패 재시도"
Agent: 영역 추정: /payments/*, /workers/retry/*
       시그니처 변경 의도: PaymentService.charge → retryPolicy 추가
       이 분석 맞나요? [Y/n/edit]
```

**자동 트리거:**
- 다른 active intent와 영역 겹침 검사
- 영향받을 함수/타입 추정
- 신규자라면 관련 ADR 자동 제시

### 5.2 자동 결정 감지 — Hybrid Capture

세션 중 결정 후보를 백그라운드 감지 → 세션 종료 시 일괄 확정 UI.

**카테고리별 임계값:** → `§6 노이즈 관리`

### 5.3 Reversal 감지

```
User: "이거 데코레이터 말고 미들웨어로 가는 게 낫겠어"
Agent: ⚠ ADR-0023을 뒤집고 있어요.
       
       Bob이 이미 ADR-0023 참조해서 작업 중입니다.
       
       옵션:
         a) Bob에게 통지하고 함께 변경
         b) 분기 (결제만 변경, 이메일은 유지)  
         c) 포기
```

영향 분석 깊이가 핵심:
- 의존 중인 다른 ADR
- 의존 중인 코드 (라인 수)
- 영향받는 active intent
- 의존 중인 사람

### 5.4 Active Coordination — 조율 트리거

claude-sync의 **차별점**. 에이전트가 조율이 필요한 순간을 감지하고 슬랙 등으로 사람들을 모은다.

**트리거 카테고리:**

| 트리거 | 누구를 부르나 | 무엇을 합의 |
|--------|--------------|-----------|
| Intent scope 충돌 | 두 owner | 영역 분담 |
| 시그니처 충돌 | 영향받는 모두 | 시그니처 통합안 |
| 의존 중 ADR 번복 | 원 결정자 + 의존자 | 변경 / 분기 / 포기 |
| Frozen Core 변경 시도 | 팀 전원 | 변경 승인 / 마이그레이션 |
| Cross-pollination 후보 | 양쪽 owner | 통합 / 분기 / 복사 |
| 정책 ADR 위배 가능 | 작업자 + 정책 책임자 | 예외 인정 / 거부 |

**플로우:**

```
[Agent 감지] 
    → [User에게 조율 옵션 제시] 
    → [User 동의 시 슬랙 thread 생성]
    → [Agent가 정리된 컨텍스트로 thread 시작]
    → [참여자들 대화 + ✅ react로 확정]
    → [Agent가 합의 → coordination 객체 + 후속 액션]
```

**핵심 디자인 원칙:**
- 명시적 확정 신호 필수 (react, "ok 확정" 등) — 자연어 추측 X
- 영향 강도 차등 (critical mention vs FYI mention)
- 비개발자 UX 고려 (PM, 디자이너 등의 합의 참여)
- 타임아웃은 단순 시간이 아닌 우선순위/마감 고려

### 5.5 Cross-pollination 검사

Sandbox → Production 승격 시 자동 트리거.

```
[/sync promote 또는 PR 생성 시]
Agent: 다른 브랜치에 유사 구현 발견:
       - Bob의 /workers/email-retry/decorator.ts (이메일용 retry)
       
       옵션:
         a) 복사해서 결제용 수정 (분기)
         b) 일반화해서 /shared/로 승격
         c) Bob과 조율
```

### 5.6 Living Context 자동 로딩

세션 시작 시 자동 주입:
- 최근 N일간의 확정 ADR
- 현재 진행 중 다른 팀원의 intent
- 사용자의 현재 브랜치 영역과 관련된 ADR (trigger_conditions 매칭)
- 영향 가능 영역으로 mark된 변경사항 (사후 통지)

### 5.7 PROJECT.md 변경 감지 — Heavy 모드

Frozen Core 수정 시도는 일반 ADR과 다른 워크플로우로 라우팅.

```
Agent: ⚠ PROJECT.md의 Frozen Core 변경 감지
       
       영향:
       - 진행 중 intent 3건
       - 머지된 ADR 4건  
       - 코드 ~800 LOC
       
       제안: 팀 동기화 세션 필요. 슬랙에 자동 알림?
```

---

## 6. 노이즈 관리

자동 감지가 많아질수록 노이즈도 늘어난다. **시그널/노이즈 비율 관리가 제품의 핵심 IP.**

### 6.1 카테고리별 차등 임계값

| 카테고리 | 기본 정책 |
|---------|----------|
| API 계약 / 스키마 변경 | 항상 draft 생성 |
| 외부 의존성 추가 | 항상 draft 생성 |
| 아키텍처 패턴 | 항상 draft 생성 |
| 정책 결정 (보안, 데이터 처리 등) | 항상 draft + 정책 책임자 알림 |
| 도메인 용어 정의 | draft 생성 |
| 구현 디테일 (라이브러리, 패턴 선택) | 신뢰도 ≥ 0.8 |
| 변수명/함수명 | 캡처 안 함 (도메인 용어로 승격 가능) |

### 6.2 팀별 학습

reject/confirm 패턴을 학습해 자동 필터 조정.

### 6.3 Coordination 멘션 fatigue 방지

- 영향 강도 구분: critical 멘션 vs FYI 멘션
- 하루 N건 초과 시 자동 디그레이드
- 같은 사람이 반복 reject 하는 패턴 학습

### 6.4 긴급 모드 인정 + 남용 방지

- "지금 시간 없어" 신호 인정 (Sandbox 모드 진입)
- 단, 사용 빈도 추적 → 너무 잦으면 retrospective 트리거

---

## 7. 모드 판단

같은 도구가 상황에 따라 다르게 행동해야 한다.

### 7.1 모드 종류

| 모드 | 트리거 | 행동 |
|------|--------|------|
| 일반 | 기본 | 백그라운드 감지, 1초 확정 UI |
| 긴급 | User 명시 / 핫픽스 패턴 / 데모 임박 | 개입 최소화, 사후 통지로 deferred |
| Heavy | Frozen Core 변경 / 큰 reversal | 강한 가드레일, 팀 알림 |
| Onboarding | 신규자 식별 | 적극 가이드, 관련 ADR 자동 제시 |

### 7.2 모드 전환 트리거

- 브랜치 prefix (spike/* → Sandbox)
- User 발화 패턴 ("지금 급해" → 긴급 모드)
- 시점 패턴 (데모 24시간 전 → 긴급 모드)
- 영향 범위 (의존 코드 1000 LOC 넘으면 Heavy)
- 사용자 이력 (합류 < 1개월 → Onboarding)

### 7.3 모드 표시

User에게 현재 모드가 항상 보이게 함.
```
[Mode: Production · 일반] 모든 감지 활성
[Mode: Sandbox · 실험] 결정 캡처 최소화
[Mode: 긴급] 사후 통지만, 조율 미트리거
```

---

## 8. MCP 인터페이스

claude-sync는 MCP 서버로 구현. 모든 MCP 호환 에이전트에서 사용 가능.

### 8.1 노출 도구

```
# Intent
sync_claim_intent(title, scope?, will_modify?) → Intent
sync_list_active_intents(filter?) → Intent[]
sync_check_conflict(paths, signatures?) → Conflict[]
sync_update_intent(id, changes) → Intent

# Decision
sync_propose_decision(title, context, category) → Draft
sync_confirm_decision(draft_id, edits?) → ADR
sync_reject_decision(draft_id, reason?) → void
sync_detect_reversal(current_change) → Reversal[]

# Context
sync_get_recent_decisions(n, filter?) → ADR[]
sync_get_context_for_paths(paths) → Context
sync_get_living_context() → LivingContext
sync_get_related_adrs(work_description) → ADR[]

# Coordination
sync_propose_coordination(trigger, participants, context) → CoordinationDraft
sync_confirm_coordination(draft_id, resolution) → Coordination
sync_get_active_coordinations(user?) → Coordination[]

# Migration
sync_create_migration_plan(trigger_adr, phases) → Migration
sync_get_current_truth(at_date?) → Truth

# Retrospective
sync_schedule_retrospective(target_id, when) → Retrospective
sync_record_retrospective(target_id, outcome, lessons) → Retrospective
```

### 8.2 Hooks

```yaml
on_session_start:
  - sync_load_living_context
  - sync_check_pending_coordinations
  - sync_check_marked_impact_areas  # 사후 통지

on_message:
  - sync_detect_decision_candidates
  - sync_detect_reversal
  - sync_mode_judgment

on_file_create:
  - sync_check_similar_implementations
  - sync_check_signature_conflicts

on_file_change:
  - sync_check_adr_compliance  # ADR과 코드 일치성

on_session_end:
  - sync_review_drafts

on_branch_create:
  - sync_mode_set  # spike/* vs feature/* 등

on_pr_create:
  - sync_cross_pollination_check
  - sync_promotion_review
```

---

## 9. 워크플로우 예시

상세 시나리오는 `docs/scenarios.md` 참고. 여기선 한 가지 happy path만.

### 일상 개발 (Production 모드, 일반)

```bash
$ git checkout -b feature/notification-batching
$ claude-code

[Agent 자동 컨텍스트 로딩]
- 어제 머지된 ADR-0034 (Bob: 알림 채널 추상화)
- Charlie의 active intent (어드민 알림 설정)
- 영역 충돌 없음
- 관련 정책: ADR-0024 (PII)

User: /sync claim "알림 batching으로 발송 효율화"
Agent: ✓ Intent 등록. 시그니처 변경 없음. 충돌 없음.

[개발 진행 — 대화하며 코딩]
User: batching window는 5분으로 고정할까?
Agent: [draft 후보 감지: 정책 결정]

User: 그리고 user별로 max 10개로 묶자
Agent: [draft 후보 감지: 정책 결정]

[세션 종료]
Agent: 이번 세션에서 결정 2건 감지:
       [1] batching window 5분 [확정]
       [2] user별 max 10개 [확정]
       → ADR-0035 draft 생성. PR로?
User: 응
Agent: ✓ ADR-0035 PR 생성됨.
```

---

## 10. 단계별 개발 계획

### Phase 1: MVP (1~2개월, 자체 사용)

자체 검증. 최소 기능으로 가설 확인.

- [ ] MCP 서버 골격
- [ ] `.sync/` 디렉토리 구조 + JSON/Markdown 저장
- [ ] Intent claim / list / 충돌 검사 (영역 수준)
- [ ] Decision propose / confirm (수동 트리거)
- [ ] CLAUDE.md 자동 갱신
- [ ] Living Context 자동 로딩

**검증 지표:**
- 팀이 자발적으로 쓰는가
- 중복 구현 횟수가 줄어드는가
- 3개월 뒤 ADR이 실제로 참조되는가

### Phase 2: 자동 감지 (2~3개월)

Hybrid Capture.

- [ ] 결정 후보 자동 감지 (hook 기반)
- [ ] Draft 리뷰 UI
- [ ] 카테고리별 임계값
- [ ] Reversal 감지 (단순 버전)
- [ ] 모드 판단 (Sandbox / Production 자동)

### Phase 3: Active Coordination (2~3개월)

**제품의 차별점이 완성되는 단계.**

- [ ] Slack 봇
- [ ] Coordination 트리거 룰 엔진
- [ ] 시그니처 충돌 감지 (코드 분석)
- [ ] 합의 capture (✅ react 등)
- [ ] 영향 분석 (의존성 그래프)

### Phase 4: 깊이 (2~3개월)

- [ ] Migration Plan
- [ ] Retrospective + 학습
- [ ] PR/Issue 트래커 통합
- [ ] Calendar 통합
- [ ] ADR과 코드 일치성 linter

### Phase 5: 제품화 (외부 공개 검토)

- [ ] 별도 백엔드 서비스
- [ ] 팀별 학습 / 튜닝
- [ ] 대시보드
- [ ] 타 에이전트 지원 확장

---

## 11. 리스크와 미해결 문제

### 11.1 채택 저항
"또 도구야?" 반응. → 자동화 비율 최대화 + 즉각적 보상 (다른 사람 컨텍스트 자동 수신).

### 11.2 노이즈가 신호를 죽임
자동 감지 정확도가 낮으면 사용자가 리뷰 포기. → 보수적 임계값 (놓치는 게 잘못 캡처보다 낫다).

### 11.3 결정과 코드의 어긋남
ADR엔 SQS인데 코드는 Redis. → ADR-코드 일치성 linter (Phase 4).

### 11.4 프라이버시
대화가 .sync/drafts/에 남음. 민감 정보 가능. → redaction 정책 + 로컬 처리 우선.

### 11.5 Coordination 멘션 fatigue
잘못 멘션하면 팀이 봇을 끔. → 영향 강도 차등화 + 학습 기반 필터.

### 11.6 합의 해석의 신뢰성
LLM이 슬랙 thread를 잘못 요약. → 명시적 확정 신호 필수, 자동 요약은 *반드시* 사람 검토.

### 11.7 책임 소재
"에이전트가 그렇게 적었어요" 문제. → 모든 결정은 사람이 명시적 확정. 에이전트는 *제안* 만.

### 11.8 자율성 침해
강요하면 안 쓰고, 안 끼어들면 묻힘. → 모드 판단의 정교화. 제품 철학의 영역.

### 11.9 정책 vs 코드 변경의 경계
시나리오 D — Charlie가 "반올림 → 내림" 변경. 코드인가 정책인가? → 거의 풀 수 없음. 대신 *기록은 한다* — 나중에 retrospective에서 발견 가능하게.

---

## 12. 다음 액션

1. **이 문서 + prerequisite-conventions + scenarios 리뷰**
2. **수동 1사이클** — 다음 프로젝트에서 위 워크플로우를 수동으로 돌려보기
3. **MVP 스코프 확정** — 수동 실험 결과 보고 Phase 1 조정
4. **기술 스택 결정** — ADR-0002 작성
5. **MCP 서버 첫 커밋**

---

## 부록 A: 용어 정리

- **Intent** — 진행 중인 작업의 선언. 살아있는 객체.
- **Decision (ADR)** — 확정된 결정.
- **Coordination** — 다자 조율의 기록.
- **Migration Plan** — 큰 변경의 실행 계획.
- **Retrospective** — 사후 회고.
- **Draft** — 미확정 결정 후보.
- **Frozen Core** — PROJECT.md의 안 바뀌는 핵심.
- **Living Context** — 자라나는 컨텍스트 (CLAUDE.md + .sync/).
- **Current Truth** — 마이그레이션 중 특정 시점의 유효 규약.
- **Active Coordination** — 에이전트가 조율을 *시작*하는 기능.
- **Cross-pollination** — 다른 사람 작업과 통합 검토.

## 부록 B: 참고

- MCP 스펙: https://modelcontextprotocol.io
- ADR: https://adr.github.io
- Trunk-based development: https://trunkbaseddevelopment.com
