// SubagentStart hook (v0.2 §7.C) — 서브에이전트용 기록 규약 주입.
// 부모 세션의 SessionStart additionalContext는 서브에이전트에 상속되지 않는다 (공식 문서 확인)
// — 이 훅이 없으면 서브에이전트에서 태어나는 지식은 채널 없는 사각지대다.
// 서브에이전트는 기록만 한다. pin·deprecate 판단은 세션 맥락을 가진 메인의 일 (스펙 v0.3 §3.2).
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
        'the memory_write tool (from the memorj MCP server; load it via ToolSearch if not visible). ' +
        'Do not ask whether it is worth recording — worth is measured by reuse afterwards. ' +
        'Skip only what would cost nothing to redo. ' +
        'When your record builds on entries you read, pass their ids in links. ' +
        `Write entry titles and bodies in ${lib.outputLanguage(ctx)}. ` +
        'Do not pin or deprecate entries — those judgments belong to the main session. ' +
        'Include your recorded discoveries in your final report.',
    },
  }) + '\n');
});
