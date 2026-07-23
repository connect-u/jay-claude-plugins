// Agent Memory Convention v0.3 — 정본 IO, 프로젝트 판별, 상태 기계, 읽기 순위, manifest.
// 스펙: docs/spec-v0.1-draft-r2.md (§0~4·8) + docs/spec-v0.2-capture.md (쓰기 경로)
//      + docs/spec-v0.3-lifecycle.md (상태·순위·시계 — §5/§6 대체)
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

// 구현 상수 — 잠정치. 판정식 튜닝은 이벤트 데이터 축적 후 (스펙 v0.3 §4.1)
const RECENT_K = 10;        // recent 유예 창 + hot 관측 창 (epoch)
const HOT_MIN_EPOCHS = 2;   // hot 문턱: 창 내 서로 다른 epoch에서의 read 수

const TYPES = ['decision', 'learning', 'fact'];
// v0.2.1: global 스코프 유예 — 관리층 없는 recall 포착의 오염 반경이 전 프로젝트라서. 재설계는 관리 라운드에서.

// ---------- 프로젝트 판별 (결정 1: 최근접 .memorj 마커 → git root → 폴백) ----------

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

// 설정 폴백 체인: 프로젝트 .memorj/config.json > 사용자 ~/.memorj/config.json > 기본값.
// 언어는 사용자 성향이라 프로젝트마다 수동 생성을 요구하면 보장 1(사람 규율 0) 위반 — 프로젝트 파일은
// "공유 저장소의 언어 고정" 같은 오버라이드 용도만. 현재 키: language (저장 엔트리·영수증 언어, 기본 English)
function readConfig(memoryDir) {
  const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (_) { return {}; } };
  return { ...read(path.join(GLOBAL_DIR, 'config.json')), ...read(path.join(memoryDir, 'config.json')) };
}

function outputLanguage(ctx) { return readConfig(ctx.memoryDir).language || 'English'; }

// ---------- 시계 (스펙 v0.3 §4.4 — epoch: 작업 단위 / tick: LLM 연산량 / ts: 달력) ----------

function readEpoch(memoryDir) {
  try { return parseInt(fs.readFileSync(path.join(memoryDir, 'epoch'), 'utf8').trim(), 10) || 0; }
  catch (_) { return 0; }
}

function writeEpoch(memoryDir, n) {
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(path.join(memoryDir, 'epoch'), String(n) + '\n');
}

function projectStateDir(slug) { return path.join(STATE_DIR, slug); }
function tickFile(slug) { return path.join(projectStateDir(slug), 'tick'); }

function readTick(slug) {
  try { return parseInt(fs.readFileSync(tickFile(slug), 'utf8').trim(), 10) || 0; }
  catch (_) { return 0; }
}

function bumpTick(slug) {
  const n = readTick(slug) + 1;
  fs.mkdirSync(projectStateDir(slug), { recursive: true });
  fs.writeFileSync(tickFile(slug), String(n) + '\n');
  return n;
}

// ---------- 사용 관측 (스펙 v0.3 §4.3 — 정본 밖 파생물, MCP 서버가 자동 기록, 삭제 무해) ----------

function eventsFile(slug) { return path.join(projectStateDir(slug), 'events.jsonl'); }

function appendEvent(slug, ev) {
  fs.mkdirSync(projectStateDir(slug), { recursive: true });
  fs.appendFileSync(eventsFile(slug), JSON.stringify(ev) + '\n');
}

function readEvents(slug) {
  let raw;
  try { raw = fs.readFileSync(eventsFile(slug), 'utf8'); } catch (_) { return []; }
  return raw.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch (_) { return null; }
  }).filter(Boolean);
}

// hot 판정 (잠정식): 최근 RECENT_K epoch 내 서로 다른 epoch에서 HOT_MIN_EPOCHS회 이상 read.
// distinct epoch을 세는 이유 — 한 세션에서 10번 읽은 것 ≠ 10세션에서 한 번씩 읽은 것.
function hotIds(ctx) {
  const cur = readEpoch(ctx.memoryDir);
  const byId = new Map();
  for (const ev of readEvents(ctx.slug)) {
    if (ev.kind !== 'read' || !ev.id) continue;
    if (typeof ev.epoch !== 'number' || cur - ev.epoch >= RECENT_K) continue;
    if (!byId.has(ev.id)) byId.set(ev.id, new Set());
    byId.get(ev.id).add(ev.epoch);
  }
  const hot = new Set();
  for (const [id, epochs] of byId) if (epochs.size >= HOT_MIN_EPOCHS) hot.add(id);
  return hot;
}

// ---------- 세션 포인터 (정본 밖 파생물 — MCP 서버의 provenance용, 서버는 session_id를 모른다) ----------

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

// v0.3: superseded_by 없음 — 정본에는 선언만, 모든 역방향은 계산 (스펙 v0.3 §3.3)
const FIELD_ORDER = ['id', 'title', 'type', 'state', 'scope', 'project', 'epoch',
  'created', 'source', 'session', 'links', 'pinned_by', 'supersedes'];

function serializeEntry(fm, body) {
  const lines = FIELD_ORDER.filter(k => k in fm).map(k => `${k}: ${yamlValue(fm[k])}`);
  return `---\n${lines.join('\n')}\n---\n\n${String(body).trim()}\n`;
}

// 구명칭 정규화 (v0.3 §6) — 기존 정본 파일 마이그레이션 불요
const STATE_ALIAS = { promoted: 'pinned', superseded: 'deprecated' };

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
  if (fm.state && STATE_ALIAS[fm.state]) fm.state = STATE_ALIAS[fm.state];
  if (fm.promoted_by !== undefined && fm.pinned_by === undefined) { fm.pinned_by = fm.promoted_by; delete fm.promoted_by; }
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

function parseLinks(fm) {
  if (!fm.links || typeof fm.links !== 'string') return [];
  return fm.links.split(',').map(s => s.trim()).filter(Boolean);
}

// 역방향은 계산 (§3.3): "누가 이 엔트리를 딛고 섰나"
function referencedBy(id, ctx) {
  return allEntries(ctx).filter(e => parseLinks(e.fm).includes(id));
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

// ---------- 쓰기 (v0.2 탄생 룰 + v0.3 §3.2 전이) ----------

function writeEntry({ title, type, body, links, supersedes }, ctx) {
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
    state: 'captured', // 탄생 룰: 전부 captured — 아래 슬롯 상속만 예외
    scope: 'project', // v0.2.1: global 유예 — 탄생은 project뿐
    project: ctx.name,
    epoch,
    created: isoLocal(),
    source: 'claude-code',
    session: state && state.session_id ? state.session_id : null,
    pinned_by: null,
    supersedes: null,
  };
  const linkIds = Array.isArray(links) ? links.map(s => String(s).trim()).filter(Boolean) : [];
  if (linkIds.length) fm.links = linkIds.join(', ');

  let note = '';
  if (supersedes) {
    const old = findEntryById(supersedes, ctx);
    if (!old) throw new Error(`supersedes target not found: ${supersedes}`);
    if (old.fm.state === 'deprecated') {
      throw new Error(`${old.fm.id} is already deprecated. Supersede the end of the chain instead (search for its successor)`);
    }
    if (old.fm.state === 'pinned') {
      // 슬롯 상속 — 원자적 스왑: 항상-주입 슬롯의 내용 갱신
      fm.state = 'pinned';
      fm.pinned_by = 'supersession';
      fm.supersedes = old.fm.id;
      old.fm.state = 'deprecated';
      saveEntry(old);
      note = `slot inheritance: ${old.fm.id} → deprecated, new entry born pinned`;
    } else {
      fm.supersedes = old.fm.id;
      old.fm.state = 'deprecated';
      saveEntry(old);
      note = `${old.fm.id} → deprecated`;
    }
  }

  const entry = { fm, body, file: path.join(dir, fm.id + '.md') };
  saveEntry(entry);
  appendEvent(ctx.slug, { id: fm.id, kind: 'born', epoch, tick: readTick(ctx.slug), ts: isoLocal() });
  return { fm, note };
}

// ---------- pin / unpin (v0.3 §3.2 — promote/demote/settle 대체) ----------

function transition(id, ctx, fn) {
  const e = findEntryById(id, ctx);
  if (!e) return { id, result: 'not found' };
  const result = fn(e);
  if (result.save) saveEntry(e);
  return { id: e.fm.id, title: e.fm.title, result: result.msg };
}

function pin(id, by, ctx) {
  return transition(id, ctx, e => {
    if (e.fm.state === 'pinned') return { save: false, msg: 'already pinned' };
    if (e.fm.state === 'deprecated') return { save: false, msg: 'deprecated entries cannot be pinned — search for current knowledge instead' };
    e.fm.state = 'pinned';
    e.fm.pinned_by = by;
    return { save: true, msg: `pinned (by: ${by})` };
  });
}

function unpin(id, ctx) {
  return transition(id, ctx, e => {
    if (e.fm.state !== 'pinned') return { save: false, msg: `not pinned (current: ${e.fm.state})` };
    e.fm.state = 'captured'; // captured로 복귀 — 파괴 없음
    e.fm.pinned_by = null;
    return { save: true, msg: 'unpinned (back to captured)' };
  });
}

// ---------- 검색 (grep 기반 — 랭킹: pinned > hot > recent > cold, 스펙 v0.3 §4) ----------

function search(query, ctx, includeDeprecated = false) {
  if (!query || !String(query).trim()) throw new Error('query is required');
  const q = String(query).toLowerCase();
  const cur = readEpoch(ctx.memoryDir);
  const hot = hotIds(ctx);
  const hits = [];
  for (const e of allEntries(ctx)) {
    if (e.fm.state === 'deprecated' && !includeDeprecated) continue;
    const hay = `${e.fm.title}\n${e.body}`;
    if (!hay.toLowerCase().includes(q)) continue;
    let rank;
    if (e.fm.state === 'pinned') rank = 0;
    else if (e.fm.state === 'captured') {
      if (hot.has(e.fm.id)) rank = 1;
      else if (typeof e.fm.epoch === 'number' && cur - e.fm.epoch < RECENT_K) rank = 2;
      else rank = 3; // cold = 읽기 경로의 후순위일 뿐
    } else rank = 4; // deprecated (include 시)
    const line = hay.split('\n').find(l => l.toLowerCase().includes(q)) || '';
    hits.push({ e, rank, snippet: line.trim().slice(0, 120) });
  }
  hits.sort((a, b) =>
    a.rank - b.rank ||
    (b.e.fm.epoch || 0) - (a.e.fm.epoch || 0) ||
    String(b.e.fm.created || '').localeCompare(String(a.e.fm.created || '')));
  return hits.slice(0, 20);
}

// ---------- Manifest (파일이 아니라 읽기 시점 파생물 — 스펙 v0.3 §4.2) ----------

function buildManifest(ctx) {
  const cur = readEpoch(ctx.memoryDir);
  const proj = allEntries(ctx);
  const hot = hotIds(ctx);
  const fmt = e => `[${e.fm.type}] ${e.fm.title}  (id: ${e.fm.id})`;

  const pinned = proj.filter(e => e.fm.state === 'pinned');
  const hotOnes = proj.filter(e => e.fm.state === 'captured' && hot.has(e.fm.id));
  const recent = proj.filter(e =>
    e.fm.state === 'captured' && !hot.has(e.fm.id) &&
    typeof e.fm.epoch === 'number' && cur - e.fm.epoch < RECENT_K);

  const sections = [];
  if (pinned.length) sections.push(`[PINNED — invariants, always injected]\n${pinned.map(fmt).join('\n')}`);
  if (hotOnes.length) sections.push(`[HOT — reused captured knowledge (measured); pin only true invariants]\n${hotOnes.map(fmt).join('\n')}`);
  if (recent.length) sections.push(`[RECENT — newborn, no usage yet (last ${RECENT_K} epochs)]\n${recent.map(fmt).join('\n')}`);
  if (!sections.length) return '';

  return [
    `[MEMORY MANIFEST — ${ctx.name}, epoch ${cur}]`,
    ...sections,
    'Read full entries with memory_read(id); explore older knowledge with memory_search(query). ' +
    'Usage is measured automatically — reading an entry keeps it HOT; nothing needs declaring.',
    'Capture rule — the criterion is re-acquisition cost: knowledge that would cost again to regain ' +
    '(a decision that rejected alternatives with reasons, a conclusion or constraint reached by investigation, ' +
    'a method earned through trial and error) must be recorded with memory_write at the moment it is gained. ' +
    'Do not ask whether it is worth recording — worth is measured by reuse afterwards. ' +
    'Skip only what would cost nothing to redo. Do not batch records at the end of a turn — ' +
    'distance between discovery and record is loss. ' +
    'When your record builds on entries you read, pass their ids in links. ' +
    'After each memory_write, surface it to the user as a compact receipt block:\n' +
    '📝 ───────────────\n[type] title  (id: …)\none-line gist\n───────────────',
    'Pin rule — pin only invariants every future session must know regardless of usage ' +
    '(identities, fixed constraints, standing conventions). When reusing a captured entry and recognizing ' +
    'it as such an invariant, call memory_pin. Do not pin merely frequently-used knowledge — ' +
    'measurement already keeps it HOT, and it should be allowed to cool when the world changes. ' +
    'If a new decision contradicts an existing entry, declare replacement via memory_write\'s supersedes.',
    'Commit rhythm — knowledge is born at events, and work products should share that rhythm: ' +
    'prefer small commits around those moments, and include the .memorj changes with the work they accompany. ' +
    'A granular commit history is the artifact-side twin of this store — an entry\'s reader should be able to ' +
    'find the change it came from. History, rollback, and sync of the store itself are delegated to git.',
    'When delegating substantial work to a subagent, include in its prompt: ' +
    '"record discoveries with re-acquisition cost via memory_write and include them in your report."',
    `Language for stored entries and receipts: ${outputLanguage(ctx)}.`,
  ].join('\n\n');
}

module.exports = {
  GLOBAL_DIR, STATE_DIR,
  RECENT_K, HOT_MIN_EPOCHS,
  TYPES,
  resolveProject, entriesDir, projectActive, readConfig, outputLanguage,
  readEpoch, writeEpoch, readTick, bumpTick,
  appendEvent, readEvents, hotIds,
  readState, writeState,
  parseEntry, serializeEntry, listEntries, findEntryById, parseLinks, referencedBy,
  writeEntry, pin, unpin, search, buildManifest, isoLocal,
};
