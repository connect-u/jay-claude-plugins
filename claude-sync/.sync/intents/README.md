# Intents

진행 중인 작업의 의도를 기록하는 디렉토리.

## 형식

파일명: `{YYYY-MM-DD}-{slug}.json` 또는 `.yaml`

기본 스키마는 `docs/design.md` §4.1 참고.

## 라이프사이클

- `active` — 작업 진행 중
- `blocked` — 다른 작업/결정 대기
- `completed` — 머지 완료
- `abandoned` — 포기

완료/포기된 intent도 한동안 보존 (Retrospective용). 분기 후 archive 할지 고려.

## 수동 단계 (도구 완성 전)

작업 시작 시 직접 파일 생성. 도구 완성 후 `/sync claim` 으로 자동화.
