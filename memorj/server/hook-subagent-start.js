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
  if (!lib.projectActive(ctx) && !lib.globalActive()) return; // 규약 미사용 — 침묵

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext:
        '[memorj 기록 규약] 이 작업에서 재획득 비용이 있는 지식 — 근거를 갖고 대안을 기각한 결정, ' +
        '조사가 도달한 결론·제약, 시행착오를 통과해 얻은 방법 — 은 얻은 그 자리에서 memory_write 도구로 즉시 기록하라 ' +
        '(mcp__*memory__memory_write; 도구가 안 보이면 ToolSearch로 로드). ' +
        '기록할 가치가 있는지는 묻지 마라 — 그 판단은 나중의 승격이 한다. 다시 해도 비용이 없는 사소한 것만 거른다. ' +
        'scope는 이 프로젝트의 지식이면 project, 프로젝트 무관한 사용자 차원이면 global. ' +
        'memory_settle(마감)은 호출하지 마라 — 그것은 메인 세션의 일이다. 기록한 발견은 최종 보고에도 포함하라.',
    },
  }) + '\n');
});
