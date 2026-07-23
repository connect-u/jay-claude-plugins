// SessionStart hook (결정 5, v0.2 §7.D) — epoch 증가, 미마감 감지, manifest 조립·주입.
// stdout에 쓴 텍스트가 세션 컨텍스트에 주입된다 (가정 B, §0 검증).
'use strict';
const lib = require('./lib');

let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const ctx = lib.resolveProject(input.cwd);
  // 규약 미사용 프로젝트 — 완전 침묵. opt-in은 mkdir .memory 또는 첫 memory_write (v0.2.1: global 유예로 경계 단순화)
  if (!lib.projectActive(ctx)) return;

  const src = input.source || 'startup';
  let warn = '';

  if (src === 'startup' || src === 'clear') {
    // 새 작업 단위의 시작 — epoch은 여기서만 증가
    // 미마감 감지 (v0.2): "write 후 settle 없이 끝난" 타 세션만. 기록은 정본에 있으므로 유실이 아니라 승격 심판 누락이다.
    for (const g of lib.listGates(ctx.slug)) {
      if (!g.session_id || g.session_id === input.session_id) continue;
      if (!(g.unclosed > 0) || g.warned_at) continue;
      warn += `⚠ A previous session (${g.session_id}) ended with ${g.unclosed} unclosed record(s). ` +
        'The records themselves are safe in the canonical store — only the promotion judgment for ' +
        'borrowed knowledge was skipped. If this session ends up using those records in real work, ' +
        `reconsider their promotion. (transcript: ${g.transcript_path})\n`;
      g.warned_at = lib.isoLocal();
      lib.writeGate(ctx.slug, g.session_id, g);
    }
    if (warn) warn += '\n';

    lib.writeEpoch(ctx.memoryDir, lib.readEpoch(ctx.memoryDir) + 1);
    // slug 평면 파일 = "현재 세션" 포인터 (MCP 서버의 provenance용)
    lib.writeState(ctx.slug, {
      session_id: input.session_id || null,
      transcript_path: input.transcript_path || null,
    });
    if (input.session_id) {
      lib.writeGate(ctx.slug, input.session_id, {
        session_id: input.session_id,
        transcript_path: input.transcript_path || null,
        stop_blocks: 0,
        settles_seen: 0,
        unclosed: 0,
      });
    }
  } else {
    // resume | compact — 같은 작업 단위의 연속: epoch 불변, 포인터만 갱신
    lib.writeState(ctx.slug, {
      session_id: input.session_id || null,
      transcript_path: input.transcript_path || null,
    });
    if (input.session_id && !lib.readGate(ctx.slug, input.session_id)) {
      lib.writeGate(ctx.slug, input.session_id, {
        session_id: input.session_id,
        transcript_path: input.transcript_path || null,
        stop_blocks: 0,
        settles_seen: 0,
        unclosed: 0,
      });
    }
  }

  const manifest = lib.buildManifest(ctx);
  const out = warn + manifest;
  if (out.trim()) process.stdout.write(out + '\n');
});
