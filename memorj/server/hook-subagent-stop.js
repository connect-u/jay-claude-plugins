// SubagentStop hook — tick 메트로놈 (스펙 v0.3 §4.4). 서브에이전트 완료도 LLM 연산량이다.
// 침묵 — 출력 없음, 카운터만 +1.
'use strict';
const lib = require('./lib');

let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const ctx = lib.resolveProject(input.cwd);
  if (!lib.projectActive(ctx)) return; // 규약 미사용 — 침묵
  lib.bumpTick(ctx.slug);
});
