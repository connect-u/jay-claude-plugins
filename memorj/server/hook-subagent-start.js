// SubagentStart hook (v0.2 §7.C) — 서브에이전트용 기록 규약 주입.
// 부모 세션의 SessionStart additionalContext는 서브에이전트에 상속되지 않는다 (공식 문서 확인)
// — 이 훅이 없으면 서브에이전트에서 태어나는 지식은 채널 없는 사각지대다.
// 서브에이전트는 기록만 한다. 마감(settle·승격 심판)은 세션 맥락을 가진 메인의 일.
'use strict';
const lib = require('./lib');

let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const ctx = lib.resolveProject(input.cwd);
  if (!lib.projectActive(ctx)) return; // 규약 미사용 — 침묵

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext:
        '[memorj capture rule] Knowledge gained in this task that has re-acquisition cost — ' +
        'a decision that rejected alternatives with reasons, a conclusion or constraint reached by ' +
        'investigation, a method earned through trial and error — must be recorded immediately with ' +
        'the memory_write tool (mcp__*memory__memory_write; load it via ToolSearch if not visible). ' +
        'Do not ask whether it is worth recording — that judgment happens later at promotion. ' +
        'Skip only what would cost nothing to redo. ' +
        `Write entry titles and bodies in ${lib.outputLanguage(ctx)}. ` +
        'Do not call memory_settle — closing is the main session\'s job. ' +
        'Include your recorded discoveries in your final report.',
    },
  }) + '\n');
});
