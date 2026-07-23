// Agent Memory Convention v0.3 — MCP stdio 서버 (툴 5개, 외부 의존 0)
'use strict';
const readline = require('readline');
const lib = require('./lib');

// 서버 프로세스의 cwd = Claude Code가 기동된 프로젝트 디렉토리
const ctx = lib.resolveProject(process.cwd());
const LANG = lib.outputLanguage(ctx); // .memorj/config.json의 language — 저장 엔트리·영수증 언어 (기본 English)

const TOOLS = [
  {
    name: 'memory_write',
    description:
      'Record one knowledge entry in the canonical store. The criterion is re-acquisition cost — ' +
      'knowledge a future session would have to pay for again (a decision that rejected alternatives ' +
      'with reasons, a conclusion or constraint reached by investigation, a method earned through ' +
      'trial and error). Record it at the moment it is gained — not as a turn summary, and never ' +
      'batched at the end of a turn: distance between discovery and record is loss. ' +
      'Do not ask whether it is worth recording — worth is measured by reuse afterwards. ' +
      'Skip only what would cost nothing to redo. ' +
      `Write title and body in ${LANG}. ` +
      'Entries are always born captured (the convention decides — there is no state parameter). ' +
      'When an existing decision is overturned, declare replacement via supersedes ' +
      '(the old entry becomes deprecated; if it was pinned, the new entry inherits the pin).',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Self-contained title — a reader must be able to judge what the knowledge is about and whether to pull it, without the body. Example: "raw JDBC instead of the StarRocks connector (validation-proxy conflict)"',
        },
        type: { type: 'string', enum: lib.TYPES, description: 'decision = choice + reasons, learning = trial and error, fact = discovered constraint or environmental fact' },
        body: {
          type: 'string',
          description: 'Distilled body — a reader with zero context from the original session must understand it on its own. For decisions, include reasons and the rejected alternatives.',
        },
        links: {
          type: 'array', items: { type: 'string' },
          description: 'ids of entries this record builds on (the ones you read and stood on). Forward-only lineage — the referenced entries are never touched.',
        },
        supersedes: { type: 'string', description: 'id of the existing entry this one replaces (optional)' },
      },
      required: ['title', 'type', 'body'],
    },
  },
  {
    name: 'memory_read',
    description:
      'Read the full body of an entry, by id seen in the manifest or in search results. ' +
      'Reading is the usage signal — it is logged automatically and keeps the entry HOT. Nothing to declare.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'entry id (full, or a unique suffix)' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_search',
    description:
      'Search the whole store. Use it to find past knowledge not shown in the manifest. ' +
      'Ranking: pinned > hot (reused) > recent > cold. Deprecated entries are excluded unless include_deprecated.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'search terms (matched against title + body, case-insensitive)' },
        include_deprecated: { type: 'boolean', description: 'also include deprecated entries — for viewing the history of a decision' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_pin',
    description:
      'Pin an entry so it is injected into every future session. The criterion is future need, not past usage: ' +
      'pin only invariants every session must know regardless of how often they are used ' +
      '(identities, fixed constraints, standing conventions). Do not pin merely frequently-used knowledge — ' +
      'usage is measured automatically and keeps it HOT, and it should be allowed to cool when the world changes. ' +
      'The natural moment to pin is while reusing a captured entry and recognizing it as such an invariant. ' +
      'Set human=true when executing an explicit user instruction.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'entry id' },
        human: { type: 'boolean', description: 'true when this pin executes an explicit user instruction' },
      },
      required: ['id'],
    },
  },
  {
    name: 'memory_unpin',
    description:
      'Unpin a pinned entry back to captured, on behalf of an explicit human instruction ' +
      '(the human judged the pin excessive or no longer warranted). Call this only when the user directly asked for it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'entry id' } },
      required: ['id'],
    },
  },
];

function callTool(name, args) {
  args = args || {};
  switch (name) {
    case 'memory_write': {
      const { fm, note } = lib.writeEntry(args, ctx);
      return `Recorded: [${fm.type}] ${fm.title}\nid: ${fm.id} / state: ${fm.state} / epoch: ${fm.epoch}` +
        (note ? `\n${note}` : '');
    }
    case 'memory_read': {
      const e = lib.findEntryById(args.id, ctx);
      if (!e) throw new Error(`entry not found: ${args.id}`);
      if (e.fm.state === 'deprecated') {
        // 정지 표지판이지 이정표가 아니다 (스펙 v0.3 §3.1) — 후계자는 주제 검색이 자연히 찾는다
        return `⚠ This entry is deprecated — do not rely on it. Search for current knowledge on the topic.\n\n` +
          lib.serializeEntry(e.fm, e.body);
      }
      lib.appendEvent(ctx.slug, {
        id: e.fm.id, kind: 'read',
        epoch: lib.readEpoch(ctx.memoryDir), tick: lib.readTick(ctx.slug), ts: lib.isoLocal(),
      });
      const refs = lib.referencedBy(e.fm.id, ctx);
      return lib.serializeEntry(e.fm, e.body) +
        (refs.length ? `\nreferenced by: ${refs.map(r => r.fm.id).join(', ')}` : '');
    }
    case 'memory_search': {
      const hits = lib.search(args.query, ctx, !!args.include_deprecated);
      if (!hits.length) return 'No results.';
      const label = ['pinned', 'hot', 'recent', 'cold', 'deprecated'];
      return hits.map(h =>
        `[${h.e.fm.type}/${label[h.rank]}] ${h.e.fm.title}  (id: ${h.e.fm.id})\n  > ${h.snippet}`
      ).join('\n');
    }
    case 'memory_pin': {
      const r = lib.pin(args.id, args.human ? 'human' : 'agent', ctx);
      return `${r.id}: ${r.result}`;
    }
    case 'memory_unpin': {
      const r = lib.unpin(args.id, ctx);
      return `${r.id}: ${r.result}`;
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

// ---------- JSON-RPC over stdio (newline-delimited) ----------

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notification — 무시
  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: (params && params.protocolVersion) || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'memorj', version: '0.4.0' },
        },
      });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      try {
        const text = callTool(params.name, params.arguments);
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      } catch (e) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true } });
      }
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  handle(msg);
});
