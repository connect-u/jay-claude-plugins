// Agent Memory Convention v0.1 — 정본 IO, 프로젝트 판별, 상태 기계, manifest.
// 스펙: noname/agent-memory-convention-v0.1-draft-r2.md
// 구현 결정: noname/IMPLEMENTATION.md
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const GLOBAL_DIR = path.join(os.homedir(), '.memory');
const STATE_DIR = path.join(GLOBAL_DIR, '.state', 'projects');

// 구현 상수 (IMPLEMENTATION.md §6 — dogfooding이 판결할 초기값)
const RECENT_K = 10;          // manifest RECENT 창 (epoch)
const DORMANT_K = 10;         // 검색 휴면 경계 (epoch)
const GLOBAL_RECENT_N = 10;   // global captured의 RECENT (epoch 없음 → 건수)
const STOP_BLOCK_MAX = 2;     // Stop hook block 상한 (fail-open)
const SETTLE_TOOL_USES = 5;   // 정산 요구 문턱: 마지막 정산 이후 tool_use 수

const TYPES = ['decision', 'learning', 'fact'];
const SCOPES = ['global', 'project'];

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
  // ~/.memory 자체(global 정본)는 프로젝트 마커가 아니다
  const marker = findUp(start, '.memory', true);
  if (marker && marker !== os.homedir()) {
    return { root: marker, memoryDir: path.join(marker, '.memory'), slug: projectSlug(marker), name: path.basename(marker) };
  }
  const gitRoot = findUp(start, '.git', false); // worktree의 .git은 파일
  if (gitRoot) {
    return { root: gitRoot, memoryDir: path.join(gitRoot, '.memory'), slug: projectSlug(gitRoot), name: path.basename(gitRoot) };
  }
  const root = path.resolve(start);
  const slug = projectSlug(root);
  // git 없는 디렉토리에는 .memory를 만들지 않는다 — 정본은 global 쪽 폴백 (스펙 §3)
  return { root, memoryDir: path.join(GLOBAL_DIR, 'projects', slug), slug, name: path.basename(root) };
}

function entriesDir(memoryDir) { return path.join(memoryDir, 'entries'); }
function globalEntriesDir() { return entriesDir(GLOBAL_DIR); }

function projectActive(ctx) { return fs.existsSync(ctx.memoryDir); }
function globalActive() { return fs.existsSync(globalEntriesDir()); }

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

function stateFile(slug) { return path.join(STATE_DIR, slug + '.json'); }

function readState(slug) {
  try { return JSON.parse(fs.readFileSync(stateFile(slug), 'utf8')); }
  catch (_) { return null; }
}

function writeState(slug, obj) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(stateFile(slug), JSON.stringify(obj, null, 2) + '\n');
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
  return [...listEntries(entriesDir(ctx.memoryDir)), ...listEntries(globalEntriesDir())];
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

function writeEntry({ title, type, body, scope, supersedes }, ctx) {
  if (!title || !String(title).trim()) throw new Error('title은 필수 — 제목은 발견의 단위 (스펙 §4.1)');
  if (!TYPES.includes(type)) throw new Error(`type은 ${TYPES.join(' | ')} 중 하나`);
  if (!SCOPES.includes(scope)) throw new Error(`scope는 ${SCOPES.join(' | ')} 중 하나`);
  if (!body || !String(body).trim()) throw new Error('body는 필수 — 원 세션 없이 읽혀야 한다 (자기완결성)');

  const isProject = scope === 'project';
  const memoryDir = isProject ? ctx.memoryDir : GLOBAL_DIR;
  const dir = entriesDir(memoryDir);
  fs.mkdirSync(dir, { recursive: true }); // lazy 생성 (결정 1 — init 의식 불요)

  let epoch = null;
  if (isProject) {
    epoch = readEpoch(memoryDir);
    if (epoch === 0) { epoch = 1; writeEpoch(memoryDir, epoch); } // 첫 쓰기 = epoch 1 개시
  }

  const state = readState(ctx.slug);
  const fm = {
    id: newId(dir),
    title: String(title).trim(),
    type,
    state: 'captured', // 탄생 룰: 전부 captured (§5.1) — 아래 슬롯 상속만 예외
    scope,
    created: isoLocal(),
    source: 'claude-code',
    session: state && state.session_id ? state.session_id : null,
    promoted_by: null,
    supersedes: null,
  };
  if (isProject) { fm.project = ctx.name; fm.epoch = epoch; }

  let note = '';
  if (supersedes) {
    const old = findEntryById(supersedes, ctx);
    if (!old) throw new Error(`supersedes 대상 없음: ${supersedes}`);
    if (old.fm.state === 'superseded') {
      throw new Error(`${old.fm.id}는 이미 superseded (superseded_by: ${old.fm.superseded_by}). 체인의 끝을 supersede할 것`);
    }
    if (old.fm.state === 'promoted') {
      // 슬롯 상속 — 원자적 스왑 (§5.3): 검증된 슬롯의 내용 갱신
      fm.state = 'promoted';
      fm.promoted_by = 'supersession';
      fm.supersedes = old.fm.id;
      old.fm.state = 'superseded';
      old.fm.superseded_by = fm.id; // 열람 편의용 파생 역링크
      saveEntry(old);
      note = `슬롯 상속: ${old.fm.id} → superseded, 새 엔트리 promoted 탄생`;
    } else {
      // captured끼리의 교체: 체인 없음, 옛 엔트리는 자연 휴면에 (§5.3)
      note = `대상(${old.fm.id})이 captured — 체인 없이 새 captured로 기록, 옛 엔트리는 자연 휴면에 맡김`;
    }
  }

  const entry = { fm, body, file: path.join(dir, fm.id + '.md') };
  saveEntry(entry);
  return { fm, note };
}

// ---------- 승격/강등 (스펙 §5.2, §5.5) ----------

function transition(id, ctx, fn) {
  const e = findEntryById(id, ctx);
  if (!e) return { id, result: '대상 없음' };
  const result = fn(e);
  if (result.save) saveEntry(e);
  return { id: e.fm.id, title: e.fm.title, result: result.msg };
}

function promoteAs(id, by, ctx) {
  return transition(id, ctx, e => {
    if (e.fm.state === 'promoted') return { save: false, msg: '이미 promoted' };
    if (e.fm.state === 'superseded') return { save: false, msg: 'superseded는 승격 불가 — 후계자를 볼 것' };
    e.fm.state = 'promoted';
    e.fm.promoted_by = by;
    return { save: true, msg: `promoted (by: ${by})` };
  });
}

function demote(id, ctx) {
  return transition(id, ctx, e => {
    if (e.fm.state !== 'promoted') return { save: false, msg: `promoted가 아님 (현재: ${e.fm.state})` };
    e.fm.state = 'captured'; // captured로 복귀 (§5.5) — 파괴 없음
    e.fm.promoted_by = null;
    return { save: true, msg: 'captured로 강등' };
  });
}

function settle(promoteIds, ctx) {
  return (promoteIds || []).map(id => promoteAs(id, 'agent', ctx));
}

// ---------- 검색 (결정 3 — grep 기반, 휴면은 랭킹으로) ----------

function search(query, ctx, includeSuperseded = false) {
  if (!query || !String(query).trim()) throw new Error('query는 필수');
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
  const glob = listEntries(globalEntriesDir());
  const fmt = e => `[${e.fm.type}] ${e.fm.title}  (id: ${e.fm.id})`;

  const gPromoted = glob.filter(e => e.fm.state === 'promoted');
  const pPromoted = proj.filter(e => e.fm.state === 'promoted');
  const pRecent = proj.filter(e =>
    e.fm.state === 'captured' && typeof e.fm.epoch === 'number' && cur - e.fm.epoch < RECENT_K);
  const gRecent = glob.filter(e => e.fm.state === 'captured')
    .sort((a, b) => String(b.fm.created || '').localeCompare(String(a.fm.created || '')))
    .slice(0, GLOBAL_RECENT_N);

  const sections = [];
  if (gPromoted.length) sections.push(`[PROMOTED — global: 프로젝트 무관 진실]\n${gPromoted.map(fmt).join('\n')}`);
  if (pPromoted.length) sections.push(`[PROMOTED — 이 프로젝트의 진실]\n${pPromoted.map(fmt).join('\n')}`);
  const recent = [...pRecent.map(fmt), ...gRecent.map(e => fmt(e) + ' [global]')];
  if (recent.length) sections.push(`[RECENT — 미검증 후보 (최근 ${RECENT_K} epoch)]\n${recent.join('\n')}`);
  if (!sections.length) return '';

  return [
    `[MEMORY MANIFEST — ${ctx.name}, epoch ${cur}]`,
    ...sections,
    '위 지식의 본문은 memory_read(id), 그 밖의 탐색은 memory_search(query). ' +
    '작업 중 promoted와 모순되는 결정을 내리면 memory_write의 supersedes로 대체를 선언하라. ' +
    '작업이 쌓이면 정산하라: 낳은 지식을 memory_write로 기록하고, 빌려 쓴 captured 중 검증된 id를 memory_settle의 promote에 담아 호출.',
  ].join('\n\n');
}

module.exports = {
  GLOBAL_DIR, STATE_DIR,
  RECENT_K, DORMANT_K, GLOBAL_RECENT_N, STOP_BLOCK_MAX, SETTLE_TOOL_USES,
  TYPES, SCOPES,
  resolveProject, entriesDir, globalEntriesDir, projectActive, globalActive,
  readEpoch, writeEpoch, readState, writeState,
  parseEntry, serializeEntry, listEntries, findEntryById,
  writeEntry, settle, promoteAs, demote, search, buildManifest, isoLocal,
};
