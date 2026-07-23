// Agent Memory Convention v0.2 — 정본 IO, 프로젝트 판별, 상태 기계, manifest.
// 스펙: docs/spec-v0.1-draft-r2.md (§0~6·8) + docs/spec-v0.2-capture.md (§7 쓰기 경로 대체)
// 구현 결정: docs/IMPLEMENTATION.md
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// v0.3.0: 저장 루트는 .memory가 아니라 .memorj — 범용 이름은 opt-in 마커라서 타 도구의 .memory에
// 오작동 활성화하는 충돌 경로였다 (.git처럼 도구명 디렉토리가 정체성도 명확)
const GLOBAL_DIR = path.join(os.homedir(), '.memorj');
const STATE_DIR = path.join(GLOBAL_DIR, '.state', 'projects');

// 구현 상수 (IMPLEMENTATION.md §6 — dogfooding이 판결할 초기값)
const RECENT_K = 10;          // manifest RECENT 창 (epoch)
const DORMANT_K = 10;         // 검색 휴면 경계 (epoch)
const STOP_BLOCK_MAX = 2;     // Stop hook block 상한 (fail-open)

const TYPES = ['decision', 'learning', 'fact'];
// v0.2.1: global 스코프 유예 — 관리층 없는 recall 포착의 오염 반경이 전 프로젝트라서. 재설계는 관리 라운드에서.

// ---------- 프로젝트 판별 (결정 1: 최근접 .memory 마커 → git root → 폴백) ----------

function findUp(start, name, requireDir) {
  let dir = path.resolve(start);
  for (;;) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (!requireDir || st.isDirectory()) return dir;
    } catch (_) {}
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function projectSlug(root) {
  const hash = crypto.createHash('sha256').update(root).digest('hex').slice(0, 4);
  return `${path.basename(root)}-${hash}`;
}

function resolveProject(cwd) {
  const start = cwd || process.cwd();
  // ~/.memorj 자체(사용자 설정·상태의 집)는 프로젝트 마커가 아니다
  const marker = findUp(start, '.memorj', true);
  if (marker && marker !== os.homedir()) {
    return { root: marker, memoryDir: path.join(marker, '.memorj'), slug: projectSlug(marker), name: path.basename(marker) };
  }
  const gitRoot = findUp(start, '.git', false); // worktree의 .git은 파일
  if (gitRoot) {
    return { root: gitRoot, memoryDir: path.join(gitRoot, '.memorj'), slug: projectSlug(gitRoot), name: path.basename(gitRoot) };
  }
  const root = path.resolve(start);
  const slug = projectSlug(root);
  // git 없는 디렉토리에는 .memorj를 만들지 않는다 — 정본은 ~/.memorj/projects 폴백 (스펙 §3)
  return { root, memoryDir: path.join(GLOBAL_DIR, 'projects', slug), slug, name: path.basename(root) };
}

function entriesDir(memoryDir) { return path.join(memoryDir, 'entries'); }

function projectActive(ctx) { return fs.existsSync(ctx.memoryDir); }

// 설정 폴백 체인: 프로젝트 .memory/config.json > 사용자 ~/.memory/config.json > 기본값.
// 언어는 사용자 성향이라 프로젝트마다 수동 생성을 요구하면 보장 1(사람 규율 0) 위반 — 프로젝트 파일은
// "공유 저장소의 언어 고정" 같은 오버라이드 용도만. 현재 키: language (저장 엔트리·영수증 언어, 기본 English)
function readConfig(memoryDir) {
  const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (_) { return {}; } };
  return { ...read(path.join(GLOBAL_DIR, 'config.json')), ...read(path.join(memoryDir, 'config.json')) };
}

function outputLanguage(ctx) { return readConfig(ctx.memoryDir).language || 'English'; }

// ---------- epoch (스펙 §4.4 — 근사적 단조 증가면 충분, lock 없음) ----------

function readEpoch(memoryDir) {
  try { return parseInt(fs.readFileSync(path.join(memoryDir, 'epoch'), 'utf8').trim(), 10) || 0; }
  catch (_) { return 0; }
}

function writeEpoch(memoryDir, n) {
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(path.join(memoryDir, 'epoch'), String(n) + '\n');
}

// ---------- 세션 핸드오프 상태 (결정 3·4 — 정본 밖 파생물, 삭제 무해) ----------
// 두 층: slug 평면 파일 = "현재 세션" 포인터 (MCP 서버의 provenance용 — 서버는 session_id를 모른다),
//        slug 디렉토리의 세션별 파일 = 마감 게이트 상태 (동시 세션 충돌 방지 — v0.2 §3)

function stateFile(slug) { return path.join(STATE_DIR, slug + '.json'); }

function readState(slug) {
  try { return JSON.parse(fs.readFileSync(stateFile(slug), 'utf8')); }
  catch (_) { return null; }
}

function writeState(slug, obj) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(stateFile(slug), JSON.stringify(obj, null, 2) + '\n');
}

function gateDir(slug) { return path.join(STATE_DIR, slug); }
function gateFile(slug, sessionId) { return path.join(gateDir(slug), sessionId + '.json'); }

function readGate(slug, sessionId) {
  try { return JSON.parse(fs.readFileSync(gateFile(slug, sessionId), 'utf8')); }
  catch (_) { return null; }
}

function writeGate(slug, sessionId, obj) {
  fs.mkdirSync(gateDir(slug), { recursive: true });
  fs.writeFileSync(gateFile(slug, sessionId), JSON.stringify(obj, null, 2) + '\n');
}

function listGates(slug) {
  let files;
  try { files = fs.readdirSync(gateDir(slug)).filter(f => f.endsWith('.json')); } catch (_) { return []; }
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(gateDir(slug), f), 'utf8')); }
    catch (_) { return null; }
  }).filter(Boolean);
}

// ---------- 엔트리 IO (frontmatter는 규약이 쓰는 평탄한 부분집합만) ----------

function yamlValue(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  return /[:#'"\n\\]|^\s|\s$|^$/.test(s) ? JSON.stringify(s) : s;
}

const FIELD_ORDER = ['id', 'title', 'type', 'state', 'scope', 'project', 'epoch',
  'created', 'source', 'session', 'promoted_by', 'supersedes', 'superseded_by'];

function serializeEntry(fm, body) {
  const lines = FIELD_ORDER.filter(k => k in fm).map(k => `${k}: ${yamlValue(fm[k])}`);
  return `---\n${lines.join('\n')}\n---\n\n${String(body).trim()}\n`;
}

function parseEntry(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === 'null' || v === '') v = null;
    else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
    else if (v.startsWith('"')) { try { v = JSON.parse(v); } catch (_) {} }
    fm[k] = v;
  }
  return { fm, body: raw.slice(m[0].length).trim(), file };
}

function saveEntry(entry) {
  fs.writeFileSync(entry.file, serializeEntry(entry.fm, entry.body));
}

function listEntries(dir) {
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch (_) { return []; }
  return files.map(f => parseEntry(path.join(dir, f))).filter(Boolean);
}

function allEntries(ctx) {
  return listEntries(entriesDir(ctx.memoryDir)); // v0.2.1: 프로젝트 정본만 (global 유예)
}

// id 또는 유일한 접미(예: 4hex)로 조회
function findEntryById(id, ctx) {
  const all = allEntries(ctx);
  const exact = all.find(e => e.fm.id === id);
  if (exact) return exact;
  const bySuffix = all.filter(e => typeof e.fm.id === 'string' && e.fm.id.endsWith(id));
  return bySuffix.length === 1 ? bySuffix[0] : null;
}

function newId(dir) {
  const date = isoLocal().slice(0, 10);
  for (;;) {
    const id = `${date}-${crypto.randomBytes(2).toString('hex')}`;
    if (!fs.existsSync(path.join(dir, id + '.md'))) return id;
  }
}

function isoLocal(d = new Date()) {
  const p = n => String(Math.abs(n)).padStart(2, '0');
  const tz = -d.getTimezoneOffset();
  const off = `${tz >= 0 ? '+' : '-'}${p(Math.trunc(tz / 60))}:${p(tz % 60)}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off}`;
}

// ---------- 쓰기 (스펙 §5.1 탄생 룰 + §5.3 supersession/슬롯 상속) ----------

function writeEntry({ title, type, body, supersedes }, ctx) {
  if (!title || !String(title).trim()) throw new Error('title is required — the title is the unit of discovery (spec §4.1)');
  if (!TYPES.includes(type)) throw new Error(`type must be one of: ${TYPES.join(' | ')}`);
  if (!body || !String(body).trim()) throw new Error('body is required — it must be readable without the original session (self-containment)');

  const memoryDir = ctx.memoryDir;
  const dir = entriesDir(memoryDir);
  fs.mkdirSync(dir, { recursive: true }); // lazy 생성 (결정 1 — init 의식 불요)

  let epoch = readEpoch(memoryDir);
  if (epoch === 0) { epoch = 1; writeEpoch(memoryDir, epoch); } // 첫 쓰기 = epoch 1 개시

  const state = readState(ctx.slug);
  const fm = {
    id: newId(dir),
    title: String(title).trim(),
    type,
    state: 'captured', // 탄생 룰: 전부 captured (§5.1) — 아래 슬롯 상속만 예외
    scope: 'project', // v0.2.1: global 유예 — 탄생은 project뿐
    project: ctx.name,
    epoch,
    created: isoLocal(),
    source: 'claude-code',
    session: state && state.session_id ? state.session_id : null,
    promoted_by: null,
    supersedes: null,
  };

  let note = '';
  if (supersedes) {
    const old = findEntryById(supersedes, ctx);
    if (!old) throw new Error(`supersedes target not found: ${supersedes}`);
    if (old.fm.state === 'superseded') {
      throw new Error(`${old.fm.id} is already superseded (superseded_by: ${old.fm.superseded_by}). Supersede the end of the chain instead`);
    }
    if (old.fm.state === 'promoted') {
      // 슬롯 상속 — 원자적 스왑 (§5.3): 검증된 슬롯의 내용 갱신
      fm.state = 'promoted';
      fm.promoted_by = 'supersession';
      fm.supersedes = old.fm.id;
      old.fm.state = 'superseded';
      old.fm.superseded_by = fm.id; // 열람 편의용 파생 역링크
      saveEntry(old);
      note = `slot inheritance: ${old.fm.id} → superseded, new entry born promoted`;
    } else {
      // captured끼리의 교체: 체인 없음, 옛 엔트리는 자연 휴면에 (§5.3)
      note = `target (${old.fm.id}) is captured — recorded as a new captured entry without a chain; the old one is left to natural dormancy`;
    }
  }

  const entry = { fm, body, file: path.join(dir, fm.id + '.md') };
  saveEntry(entry);
  return { fm, note };
}

// ---------- 승격/강등 (스펙 §5.2, §5.5) ----------

function transition(id, ctx, fn) {
  const e = findEntryById(id, ctx);
  if (!e) return { id, result: 'not found' };
  const result = fn(e);
  if (result.save) saveEntry(e);
  return { id: e.fm.id, title: e.fm.title, result: result.msg };
}

function promoteAs(id, by, ctx) {
  return transition(id, ctx, e => {
    if (e.fm.state === 'promoted') return { save: false, msg: 'already promoted' };
    if (e.fm.state === 'superseded') return { save: false, msg: 'superseded entries cannot be promoted — see its successor' };
    e.fm.state = 'promoted';
    e.fm.promoted_by = by;
    return { save: true, msg: `promoted (by: ${by})` };
  });
}

function demote(id, ctx) {
  return transition(id, ctx, e => {
    if (e.fm.state !== 'promoted') return { save: false, msg: `not promoted (current: ${e.fm.state})` };
    e.fm.state = 'captured'; // captured로 복귀 (§5.5) — 파괴 없음
    e.fm.promoted_by = null;
    return { save: true, msg: 'demoted to captured' };
  });
}

function settle(promoteIds, ctx) {
  return (promoteIds || []).map(id => promoteAs(id, 'agent', ctx));
}

// ---------- 검색 (결정 3 — grep 기반, 휴면은 랭킹으로) ----------

function search(query, ctx, includeSuperseded = false) {
  if (!query || !String(query).trim()) throw new Error('query is required');
  const q = String(query).toLowerCase();
  const cur = readEpoch(ctx.memoryDir);
  const hits = [];
  for (const e of allEntries(ctx)) {
    if (e.fm.state === 'superseded' && !includeSuperseded) continue;
    const hay = `${e.fm.title}\n${e.body}`;
    if (!hay.toLowerCase().includes(q)) continue;
    let rank;
    if (e.fm.state === 'promoted') rank = 0;
    else if (e.fm.state === 'captured') {
      const dormant = e.fm.scope === 'project' && typeof e.fm.epoch === 'number' && cur - e.fm.epoch > DORMANT_K;
      rank = dormant ? 2 : 1; // 휴면 = 읽기 경로의 후순위일 뿐 (스펙 §5.4)
    } else rank = 3;
    const line = hay.split('\n').find(l => l.toLowerCase().includes(q)) || '';
    hits.push({ e, rank, snippet: line.trim().slice(0, 120) });
  }
  hits.sort((a, b) =>
    a.rank - b.rank ||
    (b.e.fm.epoch || 0) - (a.e.fm.epoch || 0) ||
    String(b.e.fm.created || '').localeCompare(String(a.e.fm.created || '')));
  return hits.slice(0, 20);
}

// ---------- Manifest (스펙 §6.1 — 파일이 아니라 읽기 시점 파생물) ----------

function buildManifest(ctx) {
  const cur = readEpoch(ctx.memoryDir);
  const proj = listEntries(entriesDir(ctx.memoryDir));
  const fmt = e => `[${e.fm.type}] ${e.fm.title}  (id: ${e.fm.id})`;

  const promoted = proj.filter(e => e.fm.state === 'promoted');
  const recent = proj.filter(e =>
    e.fm.state === 'captured' && typeof e.fm.epoch === 'number' && cur - e.fm.epoch < RECENT_K);

  const sections = [];
  if (promoted.length) sections.push(`[PROMOTED — established truths of this project]\n${promoted.map(fmt).join('\n')}`);
  if (recent.length) sections.push(`[RECENT — unverified candidates (last ${RECENT_K} epochs)]\n${recent.map(fmt).join('\n')}`);
  if (!sections.length) return '';

  return [
    `[MEMORY MANIFEST — ${ctx.name}, epoch ${cur}]`,
    ...sections,
    'Read full entries with memory_read(id); explore older knowledge with memory_search(query).',
    'Capture rule — the criterion is re-acquisition cost: knowledge that would cost again to regain ' +
    '(a decision that rejected alternatives with reasons, a conclusion or constraint reached by investigation, ' +
    'a method earned through trial and error) must be recorded with memory_write at the moment it is gained. ' +
    'Do not ask whether it is worth recording — that judgment belongs to promotion, later. ' +
    'Skip only what would cost nothing to redo. Do not batch records at the end of a turn — ' +
    'distance between discovery and record is loss. ' +
    'After each memory_write, surface it to the user as a compact receipt block:\n' +
    '📝 ───────────────\n[type] title  (id: …)\none-line gist\n───────────────\n' +
    'If a new decision contradicts a promoted entry, declare replacement via supersedes. ' +
    'When borrowed captured knowledge has proven itself in real work, promote it via memory_settle\'s promote. ' +
    'Close any turn in which you recorded by calling memory_settle (no arguments if nothing to promote). ' +
    'When delegating substantial work to a subagent, include in its prompt: ' +
    '"report any discoveries with re-acquisition cost (decisions, constraints, trial-and-error results)."',
    `Language for stored entries and receipts: ${outputLanguage(ctx)}.`,
  ].join('\n\n');
}

module.exports = {
  GLOBAL_DIR, STATE_DIR,
  RECENT_K, DORMANT_K, STOP_BLOCK_MAX,
  TYPES,
  resolveProject, entriesDir, projectActive, readConfig, outputLanguage,
  readEpoch, writeEpoch, readState, writeState,
  readGate, writeGate, listGates,
  parseEntry, serializeEntry, listEntries, findEntryById,
  writeEntry, settle, promoteAs, demote, search, buildManifest, isoLocal,
};
