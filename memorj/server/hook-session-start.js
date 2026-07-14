// SessionStart hook (결정 5) — epoch 증가, 미정산 감지, manifest 조립·주입.
// stdout에 쓴 텍스트가 세션 컨텍스트에 주입된다 (가정 B, §0 검증).
'use strict';
const fs = require('fs');
const lib = require('./lib');

let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const ctx = lib.resolveProject(input.cwd);
  // 규약 미사용(프로젝트·global 모두 비활성) — 완전 침묵. opt-in은 mkdir .memory 또는 첫 memory_write
  if (!lib.projectActive(ctx) && !lib.globalActive()) return;

  const src = input.source || 'startup';
  let warn = '';

  if (src === 'startup' || src === 'clear') {
    // 새 작업 단위의 시작 — epoch은 여기서만 증가
    const prev = lib.readState(ctx.slug);
    if (prev && prev.settled === false && prev.session_id && prev.session_id !== input.session_id) {
      warn = `⚠ 직전 세션(${prev.session_id})이 미정산으로 끝났다. transcript: ${prev.transcript_path}\n` +
        '필요하면 사용자와 상의해 세션 로그에서 지식을 재증류하라 (복구 경로 — 스펙 §7.4).\n\n';
    }
    if (lib.projectActive(ctx)) {
      lib.writeEpoch(ctx.memoryDir, lib.readEpoch(ctx.memoryDir) + 1);
    }
    lib.writeState(ctx.slug, {
      session_id: input.session_id || null,
      transcript_path: input.transcript_path || null,
      settled: false,
      stop_blocks: 0,
    });
  } else {
    // resume | compact — 같은 작업 단위의 연속: epoch 불변, 세션 포인터만 갱신
    const st = lib.readState(ctx.slug) || { settled: false, stop_blocks: 0 };
    st.session_id = input.session_id || st.session_id || null;
    st.transcript_path = input.transcript_path || st.transcript_path || null;
    lib.writeState(ctx.slug, st);
  }

  const manifest = lib.buildManifest(ctx);
  const out = warn + manifest;
  if (out.trim()) process.stdout.write(out + '\n');
});
