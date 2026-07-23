// Agent Memory Convention v0.2 — MCP stdio 서버 (툴 6개, 외부 의존 0)
'use strict';
const readline = require('readline');
const lib = require('./lib');

// 서버 프로세스의 cwd = Claude Code가 기동된 프로젝트 디렉토리
const ctx = lib.resolveProject(process.cwd());
const LANG = lib.outputLanguage(ctx); // .memory/config.json의 language — 저장 엔트리·영수증 언어 (기본 English)

const TOOLS = [
  {
    name: 'memory_write',
    description:
      'Record one knowledge entry in the canonical store. The criterion is re-acquisition cost — ' +
      'knowledge a future session would have to pay for again (a decision that rejected alternatives ' +
      'with reasons, a conclusion or constraint reached by investigation, a method earned through ' +
      'trial and error). Record it at the moment it is gained — not as a turn summary, and never ' +
      'batched at the end of a turn: distance between discovery and record is loss. ' +
      'Do not ask whether it is worth recording — that judgment belongs to promotion, later. ' +
      'Skip only what would cost nothing to redo. ' +
      `Write title and body in ${LANG}. ` +
      'Entries are always born captured (the convention decides — there is no state parameter). ' +
      'When an existing decision is overturned, declare replacement via supersedes ' +
      '(if the target is promoted, slot inheritance applies automatically).',
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
        supersedes: { type: 'string', description: 'id of the existing entry this one replaces (optional)' },
      },
      required: ['title', 'type', 'body'],
    },
  },
  {
    name: 'memory_settle',
    description:
      'Closing declaration — call it when finishing a turn in which you recorded, to close the unit of work. ' +
      'Recording itself happens independently of this call, at the moment of discovery, via memory_write. ' +
      'Put in promote the ids of borrowed captured knowledge that proved itself in this work — ' +
      'merely searching or reading is not evidence; promote only when work actually stood on that knowledge. ' +
      'You may also call this in-flow the moment you experience the verification — closing time is the last ' +
      'chance, not the only one. If there is nothing to promote, call with no arguments (empty close).',
    inputSchema: {
      type: 'object',
      properties: {
        promote: { type: 'array', items: { type: 'string' }, description: 'ids of captured entries to promote (only those verified through use)' },
      },
    },
  },
  {
    name: 'memory_search',
    description:
      'Search the whole store (including captured). Use it to find past knowledge not shown in the manifest. ' +
      'Ranking: promoted > recent captured > dormant captured. Set include_superseded to browse history (replaced former truths).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'search terms (matched against title + body, case-insensitive)' },
        include_superseded: { type: 'boolean', description: 'also include superseded entries (replaced former truths) — for viewing the history of a decision' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_read',
    description: 'Read the full body of an entry, by id seen in the manifest or in search results.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'entry id (full, or a unique suffix)' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_promote',
    description:
      'Promote a captured entry to promoted on behalf of an explicit human instruction. ' +
      'Call this only when the user directly asked for it — promotion by the agent\'s own judgment goes through memory_settle\'s promote only.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'entry id' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_demote',
    description:
      'Demote a promoted entry back to captured on behalf of an explicit human instruction ' +
      '(the human judged the promotion excessive). Call this only when the user directly asked for it.',
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
    case 'memory_settle': {
      const results = lib.settle(args.promote, ctx);
      const lines = results.map(r => `- ${r.id}: ${r.result}`);
      return 'Closed.' + (lines.length ? `\nPromotion judgments:\n${lines.join('\n')}` : ' (empty close — nothing to promote)');
    }
    case 'memory_search': {
      const hits = lib.search(args.query, ctx, !!args.include_superseded);
      if (!hits.length) return 'No results.';
      return hits.map(h =>
        `[${h.e.fm.type}/${h.e.fm.state}${h.rank === 2 ? '·dormant' : ''}] ${h.e.fm.title}  (id: ${h.e.fm.id})\n  > ${h.snippet}`
      ).join('\n');
    }
    case 'memory_read': {
      const e = lib.findEntryById(args.id, ctx);
      if (!e) throw new Error(`entry not found: ${args.id}`);
      return lib.serializeEntry(e.fm, e.body);
    }
    case 'memory_promote': {
      const r = lib.promoteAs(args.id, 'human', ctx);
      return `${r.id}: ${r.result}`;
    }
    case 'memory_demote': {
      const r = lib.demote(args.id, ctx);
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
          serverInfo: { name: 'memory', version: '0.2.1' },
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
