// Stop hook (결정 4) — 정산 게이트.
// Stop은 매 턴 종료마다 발동하므로, "마지막 정산 이후 tool_use ≥ T개"인 턴에만 정산을 요구한다.
// 판정 재료는 transcript (하네스가 보장하는 세션 사건의 정본) — 서버-hook 공유 상태에 의존하지 않는다.
'use strict';
const fs = require('fs');
const lib = require('./lib');

// block reason 텍스트 속 "memory_settle" 문자열과 오인하지 않도록 반드시 name 필드 패턴으로 매치
const SETTLE_RE = /"name"\s*:\s*"mcp__[^"]*memory_settle"/g;
const TOOL_USE_RE = /"type"\s*:\s*"tool_use"/g;

let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const ctx = lib.resolveProject(input.cwd);
  // 규약 미사용 프로젝트의 세션은 방해하지 않는다
  if (!lib.projectActive(ctx) && !lib.globalActive()) return;

  let transcript = '';
  try { transcript = fs.readFileSync(input.transcript_path, 'utf8'); }
  catch (_) { return; } // transcript를 못 읽으면 fail-open — 다음 세션의 미정산 감지가 복구

  // 마지막 정산 지점 이후의 실질 작업량을 센다
  let lastSettleEnd = -1;
  for (const m of transcript.matchAll(SETTLE_RE)) lastSettleEnd = m.index + m[0].length;
  const tail = lastSettleEnd < 0 ? transcript : transcript.slice(lastSettleEnd);
  const toolUses = (tail.match(TOOL_USE_RE) || []).length;

  const st = lib.readState(ctx.slug) || {
    session_id: input.session_id || null,
    transcript_path: input.transcript_path || null,
    settled: false,
    stop_blocks: 0,
  };

  if (lastSettleEnd >= 0) {
    // 이 세션에서 1회 이상 정산됨 — settled 마크 + block 카운터 리셋 (다음 정산 주기를 위해)
    if (!st.settled || st.stop_blocks) {
      st.settled = true;
      st.stop_blocks = 0;
      lib.writeState(ctx.slug, st);
    }
  }

  if (toolUses < lib.SETTLE_TOOL_USES) return; // 실질 작업 없음 — 무정산 통과

  if ((st.stop_blocks || 0) >= lib.STOP_BLOCK_MAX) return; // fail-open — 세션을 인질로 잡지 않는다

  st.stop_blocks = (st.stop_blocks || 0) + 1;
  lib.writeState(ctx.slug, st);
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      '이번 작업의 정산이 아직 없다. 종료 전에 정산하라: ' +
      '(1) 이번 작업이 낳은 지식 — 결정(선택+근거), 시행착오, 발견한 제약·사실 — 을 memory_write로 각각 기록한다. 자기완결적 제목 필수. 기록 가치가 없는 것은 억지로 만들지 않는다. ' +
      '(2) 이번 작업에서 빌려 쓴 captured 지식 중 실제 작업을 통과한 것이 있으면 그 id들을 memory_settle의 promote에 담는다. ' +
      '(3) 마지막에 memory_settle을 호출한다 — 기록할 것도 승격할 것도 없으면 인자 없이 (빈 정산 선언).',
  }) + '\n');
});
