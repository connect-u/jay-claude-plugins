# Drafts

미확정 결정 후보 (자동 감지된 것 또는 수동 메모).

## 라이프사이클

`pending` → `confirmed` (decisions/ 로 이동) | `rejected` | `expired`

## 주의

대화 발췌가 저장됨. 민감 정보 주의.

- 토큰/비밀번호 자동 redaction (도구 완성 후)
- 보관 기간 정책 (예: 30일 후 삭제)
- `.gitignore` 검토 — drafts 자체를 commit 할지 여부

## 수동 단계

도구 완성 전엔 직접 메모 형식으로 생성. 확정 시 `.sync/decisions/{NNNN}-{slug}.md` 로 승격.
