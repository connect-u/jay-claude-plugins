// SessionStart hook — epoch 증가, manifest 조립·주입 (스펙 v0.3).
// stdout에 쓴 텍스트가 세션 컨텍스트에 주입된다 (가정 B, §0 검증).
// v0.3: 미마감 경고 은퇴 — settle이 없으니 미마감이라는 개념도 없다. 회고는 manifest의 HOT 섹션이 담당.
'use strict';
const lib = require('./lib');

let raw = '';
process.stdin.on('data', c => { raw += c; });
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const ctx = lib.resolveProject(input.cwd);
  // 규약 미사용 프로젝트 — 완전 침묵. opt-in은 mkdir .memorj 또는 첫 memory_write
  if (!lib.projectActive(ctx)) return;

  const src = input.source || 'startup';

  if (src === 'startup' || src === 'clear') {
    // 새 작업 단위의 시작 — epoch은 여기서만 증가
    lib.writeEpoch(ctx.memoryDir, lib.readEpoch(ctx.memoryDir) + 1);
  }
  // slug 평면 파일 = "현재 세션" 포인터 (MCP 서버의 provenance용)
  lib.writeState(ctx.slug, {
    session_id: input.session_id || null,
    transcript_path: input.transcript_path || null,
  });

  const manifest = lib.buildManifest(ctx);
  if (manifest.trim()) process.stdout.write(manifest + '\n');
});
