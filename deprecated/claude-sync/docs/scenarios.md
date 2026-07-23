# Validation Scenarios

> **목적:** claude-sync의 설계를 가상의 실제 상황에 대보고 빈 곳을 찾는 문서.
>
> 이 시나리오들은 `docs/design.md` 의 v1 → v2 진화를 이끌어냈다. 향후 새 기능 추가 시에도 시나리오로 검증할 것을 권장.

---

## 사전 설정: 가상 팀

**프로젝트:** Acme Pay — B2B SaaS 결제 플랫폼

**팀 (5명):**
- **Alice** — 시니어 백엔드, 결제 도메인 리드
- **Bob** — 미들급 백엔드, 알림/통합 담당
- **Charlie** — 미들급 백엔드, 재무/정산 담당
- **Diana** — 시니어, 인프라/플랫폼
- **Eve** — 주니어, 2주 전 합류, 어드민 페이지

**Sprint 3, Week 5**

**기존 ADR:**
- ADR-0001: 에러 응답은 problem+json
- ADR-0014: 비동기 작업 큐는 Redis Streams
- ADR-0023: retry는 데코레이터 패턴
- ADR-0024: PII는 transit/at-rest 암호화

---

## 시나리오 A: Active Coordination — 시그니처 충돌의 자동 조율

**배경:** Alice는 결제 실패 retry, Charlie는 환불 처리. 둘 다 `PaymentService.charge()` 시그니처를 건드려야 함.

### 타임라인

```
[월 10:00] Alice
  $ git checkout -b feature/payment-retry
  $ claude-code
  
  [자동 컨텍스트 로딩]
  Claude: 최근 ADR 4건 로딩. active intent 2건 (Bob 알림, Diana K8s).
          충돌 영역 없음.
  
  Alice: /sync claim "결제 실패 재시도 + 부분 환불 가능"
  Claude: ✓ Intent 등록.
          영역: /payments/*, /workers/payment-retry/*
          시그니처 변경 의도: PaymentService.charge → retryPolicy 추가
          [Y/n/edit]
  Alice: Y

[월 11:30] Charlie  
  $ git checkout -b feature/refund
  $ claude-code
  
  [자동 컨텍스트 로딩]
  Claude: ⚠ Alice가 /payments/* 영역에서 작업 중. 보시겠어요?
  Charlie: 보여줘
  
  Claude: Alice의 intent:
          - 결제 실패 재시도 + 부분 환불 가능
          - PaymentService.charge 시그니처 변경 예정
          
          당신의 작업은?
  Charlie: 환불은 별도 RefundService. 근데 charge 호출해야 해서
           refundContext 같은 거 필요할 듯.
  
  Claude: ⚠ 잠재적 시그니처 충돌:
          - Alice: charge(amount, retryPolicy)
          - 당신: charge(amount, refundContext) ?
          
          파라미터 두 개 다 추가하면 시그니처가 dirty 해져요.
          조율 필요해 보입니다.
          
          [a] 슬랙 #dev에 Alice와 조율 스레드 시작
          [b] 일단 진행 (나중에 머지 시점 조율)
          [c] 직접 얘기 후 결과만 sync에 기록
  Charlie: a
```

### 슬랙 스레드

```
#dev

🤖 claude-sync  10:32
@alice @charlie 시그니처 조율 필요해요

📋 상황
   두 분 다 PaymentService.charge()를 다른 방향으로 변경 예정

🔹 Alice (feature/payment-retry)
   - 의도: charge 실패 시 자동 재시도 + 부분 환불
   - 시그니처: charge(amount, retryPolicy)
   - 컨텍스트: ADR-0023 (데코레이터 패턴 retry)
   - 진행도: intent만, 코드 미작성

🔹 Charlie (feature/refund)  
   - 의도: 환불 도메인 별도 서비스
   - 시그니처: charge(amount, refundContext) ?
   - 진행도: intent만, 코드 미작성

📊 영향
   - charge() 현재 호출자: 7곳
   - 두 변경 동시 적용 시 충돌
   
💡 옵션
   a) chargeWithOptions(opts) 신규 추가, charge() 유지
   b) charge(opts: ChargeOptions) 리팩토링 (호출부 7곳 마이그레이션)
   c) Charlie는 charge() 미변경, RefundService에서 그대로 호출

   결정되면 ✅ react. 추가 옵션 자유롭게.
   
   ⏰ 24시간 내 응답 없으면 차단 가능

   ─────
   alice  10:45
   c가 단순한데, refund 시나리오가 charge 내부에 영향 안 줘?
   
   charlie  10:48
   부분환불 시 원래 transaction 참조해야 해서 charge() 호출 시점에 
   refund context를 알면 좋긴 해. 옵션이면 c도 가능
   
   alice  10:52
   그럼 b로. 어차피 내 retryPolicy도 옵션 객체로 가는 게 깔끔.
   ChargeOptions { retryPolicy?, refundContext? }
   
   charlie  10:54
   동의. 호출부 7곳은?
   
   alice  10:56
   내가 리팩토링 PR 먼저. Charlie는 그 위에서.
   
   charlie  10:57 ✅
   alice  10:57 ✅

🤖 claude-sync  10:58
✓ 합의 캡처 → coordination-0007

📝 정리
   결정: charge(opts: ChargeOptions) 리팩토링
   순서: Alice 리팩토링 PR → Charlie 환불 작업 (rebase)
   영향: 호출부 7곳 마이그레이션
   
   → ADR-0031 draft 생성
   → Alice intent 업데이트
   → Charlie intent 업데이트: blocker = ADR-0031
```

### 잘 작동한 것
- 시그니처 충돌을 코드 한 줄 짜기 전 발견
- 양쪽 컨텍스트 동시 제시로 정보 비대칭 해소
- ✅ react로 명시적 확정
- 후속 액션 자동화

### 삐걱댄 것

**1) 타임아웃 정책의 모호함**
- "24시간 내 응답 없으면 차단" — Alice가 회의 줄줄이면? 누구를 보호하나?
- → 단순 시간이 아닌 우선순위/마감 고려 필요

**2) 슬랙 thread → ADR 변환의 품질**
- Alice의 "옵션 객체로 가는 게 깔끔" 같은 *이유* 가 자동 ADR draft에 잘 들어가야 함
- → LLM 요약 후 양쪽 검토 단계 필수

**3) 외부 관찰자**
- Bob도 알림에서 charge() 호출할 수 있음. 영향받지만 thread에 없음
- → 영향 분석에 다른 active intent의 의존성도 포함

**4) 신규 멤버 따라가기**
- Eve가 thread 봐도 깊은 맥락 모름
- → coordination에 "신규자용 배경" 섹션?

---

## 시나리오 B: 번복의 도미노 — 3주 누적 결정의 Heavy Reversal

**배경:** Sprint 2에서 ADR-0014 "큐는 Redis Streams" 결정. 3주간 4명이 그 위에 빌드. 이제 Diana가 인프라 관점 문제 발견.

### 타임라인

```
[수 14:00] Diana
  Diana: Redis Streams가 K8s 환경에서 HA 까다로워. SQS로 가야할 듯
  
  Claude: ⚠ Heavy reversal 감지
          
          ADR-0014 (Redis Streams)을 뒤집으려 하시네요.
          
          🔴 의존 ADR: 3개 (ADR-0023, 0028, 0029)
          🔴 의존 코드: ~1,200 LOC
          🔴 영향 intent: 2개 (Charlie 정산, Bob SMS)
          
          가벼운 reversal 아닙니다.
          
          [a] 슬랙에 RFC 스레드 (24h 토론)
          [b] spike 브랜치 PoC 먼저
          [c] 가벼운 대안 (Redis HA 개선)
          [d] ADR로 변경 제안만
  
  Diana: b
```

### Spike 분기

```
[수 14:30]
  $ git checkout -b spike/sqs-migration
  
  Claude: Sandbox 모드 진입.
          - 결정 캡처 ❌
          - 충돌 검사 ❌
          - 컨텍스트 오염 ❌
          
          단, ADR-0014 reversal 후보로 mark 해둠. 결과 시 RFC 승격 가능.

[목 16:00] Diana PoC 완료
  Diana: 됐어. SQS가 K8s에 깔끔. ordering 약하고 latency 50→200ms.
  
  Claude: RFC로 승격?
  Diana: 진행. 단 결정은 미팅에서.
```

### RFC + 미팅

```
#dev

🤖 claude-sync  16:15
📋 RFC-0003: Redis Streams → SQS 검토

@alice @bob @charlie @diana @eve

🔬 배경
   K8s HA 이슈. PoC 완료: spike/sqs-migration

📊 비교
   | 항목 | Redis Streams | SQS |
   | --- | --- | --- |
   | HA | 자체 | 관리형 |
   | latency | 50ms | 200ms |
   | ordering | 강함 | FIFO 시 강함 |
   | 운영 | 높음 | 낮음 |

🔴 영향: ADR-0014, 0023, 0028, 0029 / 코드 1,200 LOC / Charlie 진행 PR

🗓 금 10:00 미팅에서 결정
   비동기 토론으론 영향 너무 큼

⚠ 결정 전까지: 신규는 Redis 유지. Charlie 정산 PR 머지 보류.

[금 11:00 미팅 후]

Diana: 슬랙에 미팅 결과 정리함. 결론: 단계적 SQS 전환.
       마이그레이션 계획으로 만들 수 있어?

Claude: [Slack MCP로 thread 가져옴]
        제 이해:
        
        📝 결론
        - SQS 전환 (FIFO)
        - 3 Phase 단계적
        - Phase 1: 신규 SQS, 기존 유지 (2주)
        - Phase 2: 이메일 → 정산 → 결제 순 마이그레이션
        - Phase 3: Redis 제거 (1개월 뒤)
        
        🔄 ADR 변경
        - ADR-0014 → Superseded by ADR-0032
        - ADR-0023, 0028, 0029 → Scope-Limited
        
        🎫 작업: [Bob 이메일, Charlie 재작업, Alice 결제, Diana 인프라]
        
        맞으면 ✅
Diana: ✅

Claude: ✓ migration-0001 생성
        ✓ ADR-0032 생성
        ✓ 관련 ADR 상태 업데이트
        ✓ 각자 intent에 마이그레이션 작업 추가
        ✓ Charlie PR에 "재작업 필요" 자동 코멘트
```

### 잘 작동한 것
- Heavy reversal 영향 자동 계산
- Sandbox 분리로 PoC 안전
- 비동기/동기 결정 라우팅 (사용자가 "미팅" 선언)
- 미팅 노트 → 구조화 capture

### 삐걱댄 것

**1) Scope-Limited 의미 모호**
- "Phase 2까지 유효" → 그 동안 코드 짤 때 따라야 하나?
- → 각 ADR이 *어떤 부분이* supersede되는지 명시 필요

**2) 미팅 노트 → 구조화의 신뢰성**
- "2주 정도?" 같은 흐릿한 노트를 LLM이 확정해버리면 위험
- → 변환 결과 *반드시* 사람 검수

**3) Current Truth 개념**
- 마이그레이션 중 1개월간 다른 결정도 발생. SQS 가정인가 Redis 가정인가?
- → 시점별 current truth 필요

**4) FYI vs Critical 멘션**
- Eve는 큐 영향 거의 없는데 멘션. 노이즈
- → 영향 강도 차등

---

## 시나리오 C: Onboarding — 신규자의 첫 위험한 작업

**배경:** Eve 합류 2주. 어드민 페이지 만들었음. 이제 "유저 검색" 작업. PII 닿음 (ADR-0024). Eve는 ADR-0024 존재 모름.

### 타임라인

```
[월 09:30] Eve
  $ git checkout -b feature/admin-user-search
  $ claude-code
  
  [자동 컨텍스트 로딩 + Onboarding 모드]
  Claude: 환영합니다 Eve.
          관련 컨텍스트:
          - 어드민 영역: 최근 ADR 4건
          - 유저 데이터 접근: ADR-0024 (PII 암호화) ← 처음 접하시죠?
          
          ADR-0024 요약 먼저?
  Eve: 응
  
  Claude: ADR-0024: PII transit/at-rest 암호화
          - 이메일, 전화, 주소 암호화 저장
          - 검색 시 hashed index (정확 매치만)
          - 부분 검색은 별도 보안 review
          
          🔍 영향:
          - 이름 검색: 가능 (PII 아님)
          - 이메일/전화: 정확 매치만
          
          부분 검색 필요하면 별도 review.
  
  Eve: 어 CS팀에서 "부분 이메일로 찾고 싶다" 요구 있었던 것 같아.
  
  Claude: PM/보안 책임자 조율 필요해 보임.
          [a] 슬랙 #dev 보안 review
          [b] 정확 매치만 구현, 부분은 후속
          [c] PM에게 직접 확인
  
  Eve: a. 나 혼자 판단 무서워.
```

### 슬랙 thread

```
#dev

🤖 claude-sync  09:40
@alice (보안 리드) @pm @eve 보안 review

🔍 상황
   Eve가 어드민 유저 검색 작업.
   부분 PII 검색 요구 가능성.
   
📜 정책
   ADR-0024: 정확 매치만. 부분 검색은 별도 review.

❓ 결정
   1. 어드민 부분 PII 검색 허용?
   2. 허용 시 권한/감사/rate limit?

   ─────
   alice  09:55
   부분 검색 위험. 필요 시 (a) 권한 분리 (CS팀), 
   (b) 감사 로깅, (c) rate limit 필수
   
   pm  10:10
   CS팀은 자주 씀. 위 3개 다 ok.
   
   alice  10:15
   ADR 업데이트. "어드민 부분 PII 검색 예외" 신규 ADR.
   Eve, 3개 조건 다 들어가야.
   
   eve  10:18  ✅
   alice  10:18  ✅
   pm  10:19  ✅

🤖 claude-sync  10:20
✓ coordination-0008
✓ ADR-0033 draft: 어드민 부분 PII 검색 예외
  - 권한: cs_partial_search role만
  - 감사: 모든 쿼리 기록
  - Rate: 10/min/user

📝 Eve intent 업데이트:
   - 위 3개 조건 구현 요구
   - ADR-0033 머지 prerequisite
```

### 잘 작동한 것
- 신규자의 무지를 도구가 메움 (ADR-0024 자동 제시)
- 코드 짜기 전 위험 차단
- 자신감 없을 때 적절한 사람 모음
- 다양한 역할 (보안, PM) 참여

### 삐걱댄 것

**1) ADR 적용 여부 인지**
- "유저 검색" → ADR-0024 관련을 어떻게 매칭?
- → ADR.trigger_conditions metadata 필요. 작성 부담 발생.

**2) 신규자 맥락 깊이 차이**
- "권한 분리, 감사 로깅, rate limit" 구현 방법 모를 수 있음
- → coordination 결과 → 구현 가이드 자동 생성?

**3) 비개발자 UX**
- PM이 ✅ 없이 "응 그렇게" 라고 글로만 쓰면?
- → 봇이 명시 요구 안내

**4) 보안 리뷰 책임**
- 슬랙 ✅가 공식 승인인가?
- → 조직별 다름. 정식 승인 필요 시 별도 워크플로우.

---

## 시나리오 D: 도구의 한계 — Active Coordination이 실패하는 경우

**배경:** 금요일 17:00. 데모 월요일. Charlie 정산 버그 발견. 긴급 수정.

### 타임라인

```
[금 17:00] Charlie
  Charlie: 정산 금액 계산 틀려. 소수점. 지금 고쳐야 함.
  
  Claude: 빠른 수정 모드로 보입니다.
          ⚠ 이 수정이 영향 가능:
          - Bob 이메일 (정산 알림 템플릿)
          - Alice 결제 retry (실패 시 금액 보정)
          조율?
  
  Charlie: 아니. 데모 월요일. 지금 다 모이라면 짜증. 일단 고치고 통보.
  
  Claude: 이해. 영향 영역 표시해두고 월요일 알림 드릴게요.
          [긴급 모드]
          - intent 자동 등록 (긴급-수정 태그)
          - 결정 캡처 deferred
          - 영향 영역만 mark
  Charlie: 좋아.

[금 19:00] 핫픽스 머지

[월 09:00] Bob
  Claude: 금요일 늦게 Charlie가 정산 계산 수정.
          영향 가능 영역:
          - /workers/email/settlement-notification.ts (당신 코드)
          
          Charlie commit: [링크]
          변경: 소수점 반올림 → 내림

  Bob: 어 알림 템플릿 금액 표시랑 안 맞을 수도. 확인해볼게.
```

### 잘 작동한 것
- 긴급 모드 인정 — 협업 강요 X
- 사후 통지로 결국 알림 도달
- 사용자 컨텍스트 존중

### 삐걱댄 것 — 중요

**1) 긴급 모드 남용**
- 매번 "급해" → sync 무력화
- → 빈도 추적, retrospective 트리거 (근데 이것도 fatigue)

**2) 사후 통지 묻힘**
- 월요일 Bob이 다른 일에 묻혀서 안 봄?
- → 단순 알림 X, blocker로. "확인 전까지 영역 머지 X"

**3) 자동 영향 분석 한계**
- "Bob에 영향 가능" — 진짜? 잘못 추정이면 fatigue, 놓치면 버그
- → 영향 분석 정확도가 핵심 IP

**4) 정책 vs 코드 변경의 경계 ⚠**
- Charlie의 "반올림 → 내림" — *사업 결정* 가능. 회계/법무 알아야?
- 도구가 판단 거의 불가능
- **사람의 판단력을 대체할 수 없는 영역**
- → 적어도 *기록은 한다*. 나중에 retrospective에서 발견 가능.

---

## 종합 인사이트

### 1. Active Coordination은 강력하지만, "언제 트리거할지"가 IP

같은 도구가 4가지 다른 모드로:
- A (일반): 시그니처 충돌 → 적극 트리거
- D (긴급): 핫픽스 → 비활성화
- B (Heavy): 큰 reversal → 무거운 워크플로우
- C (Onboarding): 신규자 → 적극 가이드

**모드 판단 자체가 핵심 알고리즘.**

### 2. "합의의 형태"가 다양함

- 채팅 ✅ react (A)
- 미팅 결정 (B)
- 다자 합의 (C)
- 사후 통지 (D)

→ Hybrid Capture가 더 다양한 형태 지원해야

### 3. 영향 분석의 깊이 = 도구 가치

- 함수 시그니처 충돌 (A)
- 누적된 ADR 의존성 (B)
- 정책 ADR과 작업 매칭 (C)
- 코드 변경의 비즈니스 영향 (D)

깊이가 곧 제품의 깊이.

### 4. 자율성과 가드레일의 균형

- D에서 강요 → Charlie 짜증, 도구 폐기
- A에서 방치 → 충돌 폭발

**제품 철학의 영역.** ML 임계값 아님.

### 5. Retrospective가 1차 문서엔 없었음

- A 합의가 6개월 뒤 좋은 결정이었는지?
- B 마이그레이션이 잘 됐는지?
- D의 묻힌 결정이 나중에 문제 일으켰는지?

**도구가 학습하려면 retrospective 필수.** v2 design.md에 추가됨.

---

## 시나리오 작성 가이드 (향후 추가용)

새 시나리오 추가 시:
1. 가상 팀 / 프로젝트 설정 (구체적일수록 좋음)
2. 타임라인 형식으로 흐름
3. 슬랙/Claude 대화 등 실제 같은 디테일
4. "잘 작동한 것" / "삐걱댄 것" 분리 정리
5. 보강 리스트로 design.md 반영

검증해보면 좋을 미실행 시나리오:
- **시나리오 E**: 15명 팀, sub-team 구조
- **시나리오 F**: 외부 컨트랙터 합류, 부분 권한
- **시나리오 G**: 여러 sprint 걸친 epic, 장기 컨텍스트
- **시나리오 H**: AI 에이전트 실수 회복 (잘못된 자동 캡처)
- **시나리오 I**: 분산 팀 (다른 timezone) Coordination
- **시나리오 J**: 의도적 abandon — Intent 중도 포기 처리
