// Agent Memory Convention v0.1 — MCP stdio 서버 (툴 6개, 외부 의존 0)
'use strict';
const readline = require('readline');
const lib = require('./lib');

// 서버 프로세스의 cwd = Claude Code가 기동된 프로젝트 디렉토리
const ctx = lib.resolveProject(process.cwd());

const TOOLS = [
  {
    name: 'memory_write',
    description:
      '지식 엔트리 1개를 정본에 기록한다. 대상은 결정(decision)·시행착오(learning)·발견한 제약/사실(fact) — 턴 요약이 아니다. ' +
      '탄생 상태는 항상 captured (규약이 결정 — state 파라미터 없음). 세션 중 언제든 호출 가능. ' +
      '기존 결정이 뒤집힐 때는 supersedes로 대체를 선언하라 (promoted 대상이면 슬롯 상속이 자동 적용된다).',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '자기완결적 제목 — 본문 없이 "무엇에 관한 지식인지 + 당겨볼지"를 판단할 수 있어야 한다. 예: "StarRocks 커넥터 대신 raw JDBC (validation-프록시 충돌)"',
        },
        type: { type: 'string', enum: lib.TYPES, description: 'decision=선택+근거, learning=시행착오, fact=발견한 제약·환경 사실' },
        body: {
          type: 'string',
          description: '증류된 본문 — 원 세션 컨텍스트가 전혀 없는 독자가 그것만 읽고 이해할 수 있어야 한다. 결정이면 근거와 기각된 대안 포함.',
        },
        scope: { type: 'string', enum: lib.SCOPES, description: 'project=이 프로젝트의 지식, global=프로젝트 무관한 사용자 차원의 지식' },
        supersedes: { type: 'string', description: '이 엔트리가 대체하는 기존 엔트리의 id (선택)' },
      },
      required: ['title', 'type', 'body', 'scope'],
    },
  },
  {
    name: 'memory_settle',
    description:
      '정산 선언. 이번 작업에서 빌려 쓴 captured 지식 중 실제 작업을 통과해 활용이 검증된 것들의 id를 promote에 담아 승격을 심판한다. ' +
      '검색해서 읽기만 한 것은 증거가 아니다 — 그 지식 위에서 작업이 실제로 성립했을 때만 승격하라. ' +
      '이번 작업이 낳은 지식은 이 호출 전에 memory_write로 먼저 기록할 것. 기록할 것도 승격할 것도 없으면 인자 없이 호출한다 (빈 정산 선언).',
    inputSchema: {
      type: 'object',
      properties: {
        promote: { type: 'array', items: { type: 'string' }, description: '승격할 captured 엔트리 id 목록 (활용이 검증된 것만)' },
      },
    },
  },
  {
    name: 'memory_search',
    description:
      '메모리 전체(captured 포함)를 검색한다. manifest에 없는 과거 지식을 찾을 때 사용. ' +
      '랭킹: promoted > 최근 captured > 휴면 captured. include_superseded로 히스토리(대체된 옛 진실)까지 열람 가능.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (제목+본문 대상, 대소문자 무시)' },
        include_superseded: { type: 'boolean', description: 'superseded(대체된 옛 진실)도 포함 — 결정의 역사를 볼 때' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_read',
    description: '엔트리 본문을 조회한다. manifest나 검색 결과에서 본 id의 전문을 당겨볼 때 사용.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '엔트리 id (전체 또는 유일한 접미)' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_promote',
    description: '사람의 명시적 지시를 대행해 captured 엔트리를 promoted로 승격한다. 사용자가 직접 지시했을 때만 호출하라 — 에이전트 자신의 판단에 의한 승격은 memory_settle의 promote로만.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '엔트리 id' } },
      required: ['id'],
    },
  },
  {
    name: 'memory_demote',
    description: '사람의 명시적 지시를 대행해 promoted 엔트리를 captured로 강등한다 (승격이 과했다는 사람의 판단). 사용자가 직접 지시했을 때만 호출하라.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '엔트리 id' } },
      required: ['id'],
    },
  },
];

function callTool(name, args) {
  args = args || {};
  switch (name) {
    case 'memory_write': {
      const { fm, note } = lib.writeEntry(args, ctx);
      return `기록됨: [${fm.type}] ${fm.title}\nid: ${fm.id} / state: ${fm.state} / scope: ${fm.scope}` +
        (fm.epoch ? ` / epoch: ${fm.epoch}` : '') + (note ? `\n${note}` : '');
    }
    case 'memory_settle': {
      const results = lib.settle(args.promote, ctx);
      const lines = results.map(r => `- ${r.id}: ${r.result}`);
      return `정산 선언 완료.` + (lines.length ? `\n승격 심판:\n${lines.join('\n')}` : ' (빈 정산 — 승격 대상 없음)');
    }
    case 'memory_search': {
      const hits = lib.search(args.query, ctx, !!args.include_superseded);
      if (!hits.length) return '검색 결과 없음.';
      return hits.map(h =>
        `[${h.e.fm.type}/${h.e.fm.state}${h.rank === 2 ? '·휴면' : ''}] ${h.e.fm.title}  (id: ${h.e.fm.id})\n  > ${h.snippet}`
      ).join('\n');
    }
    case 'memory_read': {
      const e = lib.findEntryById(args.id, ctx);
      if (!e) throw new Error(`엔트리 없음: ${args.id}`);
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
      throw new Error(`알 수 없는 툴: ${name}`);
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
          serverInfo: { name: 'memory', version: '0.1.0' },
        },
      });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      try {
        const text = callTool(params.name, params.arguments);
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      } catch (e) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `오류: ${e.message}` }], isError: true } });
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
