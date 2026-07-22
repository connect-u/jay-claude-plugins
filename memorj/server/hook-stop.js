// Stop hook — 마감 게이트 (v0.2 §7.C).
// 게이트는 기록을 생성시키지 않는다. 이미 태어난 기록이 닫히는 것만 보장한다:
// 블록 조건 = 마지막 settle 이후 미마감 memory_write 존재. write 없는 세션에게 게이트는 없는 것과 같다.
// 판정 재료는 transcript (하네스가 보장하는 세션 사건의 정본) — 카운터만 세션별 게이트 상태에 둔다.
'use strict';
const fs = require('fs');
const lib = require('./lib');

// 텍스트 속 언급과 오인하지 않도록 반드시 tool_use의 name 필드 패턴으로 매치
// (transcript에서 실제 호출은 비이스케이프 JSON, 텍스트 인용은 \" 로 이스케이프된다)
const WRITE_RE = /"name"\s*:\s*"mcp__[^"]*memory_write"/g;
const SETTLE_RE = /"name"\s*:\s*"mcp__[^"]*memory_settle"/g;

let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const ctx = lib.resolveProject(input.cwd);
  // 규약 미사용 프로젝트의 세션은 방해하지 않는다
  if (!lib.projectActive(ctx) && !lib.globalActive()) return;
  if (!input.session_id) return; // 세션 식별 불가 — 게이트 상태를 가를 수 없으니 fail-open

  let transcript = '';
  try { transcript = fs.readFileSync(input.transcript_path, 'utf8'); }
  catch (_) { return; } // transcript를 못 읽으면 fail-open — 다음 세션의 미마감 감지가 복구

  let settleCount = 0, lastSettleEnd = -1;
  for (const m of transcript.matchAll(SETTLE_RE)) { settleCount++; lastSettleEnd = m.index + m[0].length; }
  let unclosed = 0;
  for (const m of transcript.matchAll(WRITE_RE)) if (m.index > lastSettleEnd) unclosed++;

  const st = lib.readGate(ctx.slug, input.session_id) || {
    session_id: input.session_id,
    transcript_path: input.transcript_path || null,
    stop_blocks: 0,
    settles_seen: 0,
    unclosed: 0,
  };

  // 카운터 리셋은 settle의 "전진"으로만 — "존재"로 리셋하면 fail-open이 영구 무력화된다 (v0.1 버그)
  if (settleCount > (st.settles_seen || 0)) {
    st.settles_seen = settleCount;
    st.stop_blocks = 0;
  }
  st.unclosed = unclosed; // 다음 세션의 미마감 감지 재료
  st.transcript_path = input.transcript_path || st.transcript_path;

  if (!unclosed) { lib.writeGate(ctx.slug, input.session_id, st); return; } // 닫혀 있음 — 침묵

  if ((st.stop_blocks || 0) >= lib.STOP_BLOCK_MAX) {
    lib.writeGate(ctx.slug, input.session_id, st);
    return; // fail-open — 세션을 인질로 잡지 않는다
  }

  st.stop_blocks = (st.stop_blocks || 0) + 1;
  lib.writeGate(ctx.slug, input.session_id, st);
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      `마감되지 않은 기록 ${unclosed}건이 있다. memory_settle로 마감하라 — ` +
      '이번 작업에서 빌려 쓴 captured 지식 중 실제 작업을 통과한 id가 있으면 promote에 담고, 없으면 인자 없이 호출한다. ' +
      '새로 기록할 것은 없다 — 기록은 발견 즉시 이미 했어야 하고, 지금은 닫기만 한다.',
  }) + '\n');
});
