// TaskNotes Worker: the one gateway to the Google Sheet.
//   /api/ping, /api/sync   the phone app (Bearer APP_KEY)
//   /mcp                   Claude (MCP over Streamable HTTP, Bearer token from the PIN login)
//   /authorize, /token, /register, /.well-known/*   the PIN login for Claude
import {applyChanges, runTool, TOOLS} from './data.js';
import {readAll, writeAll} from './google.js';
import * as oauth from './oauth.js';
import {same} from './oauth.js';

export const VERSION = '0.2.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const cors = (req, env) => {
  const o = req.headers.get('Origin') || '';
  const allow = (env.APP_ORIGIN || 'https://df-ai-lab.github.io').split(',').map(s => s.trim());
  return {'Access-Control-Allow-Origin': allow.includes(o) || o.startsWith('http://localhost') ? o : allow[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate', Vary: 'Origin'};
};
const json = (o, status, headers) => new Response(JSON.stringify(o), {status: status || 200, headers: Object.assign({'Content-Type': 'application/json', 'Cache-Control': 'no-store'}, headers || {})});

// one write at a time inside this Worker copy, so two quick changes do not overwrite each other
let queue = Promise.resolve();
const serial = fn => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/', origin = url.origin;
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: h});
    try {
      // ---------- the phone ----------
      if (path.startsWith('/api/')) {
        const key = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        if (!env.APP_KEY || !same(key, env.APP_KEY)) return json({error: 'Wrong app key'}, 401, h);
        if (path === '/api/ping') {
          try { const s = await readAll(env); return json({ok: true, sheet: true, version: VERSION, tasks: s.tasks.length, notes: s.notes.length}, 200, h); }
          catch (e) { return json({ok: true, sheet: false, error: e.message}, 200, h); }
        }
        if (path === '/api/sync' && req.method === 'POST') {
          const body = await req.json().catch(() => ({}));
          const snap = await serial(async () => {
            const s = await readAll(env);
            if (applyChanges(s, body.changes || {})) await writeAll(env, s);
            return s;
          });
          return json(snap, 200, h);
        }
        return json({error: 'Not found'}, 404, h);
      }

      // ---------- Claude's PIN login ----------
      if (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/openid-configuration') return json(oauth.metadata(origin), 200, {'Access-Control-Allow-Origin': '*'});
      if (path.startsWith('/.well-known/oauth-protected-resource')) return json(oauth.resourceMeta(origin), 200, {'Access-Control-Allow-Origin': '*'});
      if (path === '/register' && req.method === 'POST') return oauth.register(req, env);
      if (path === '/authorize') return oauth.authorize(req, env);
      if (path === '/token' && req.method === 'POST') return oauth.tokenEndpoint(req, env);

      // ---------- MCP ----------
      if (path === '/mcp') {
        if (!await oauth.bearerOk(req, env)) {
          return json({error: 'unauthorized'}, 401, Object.assign({}, h, {'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`}));
        }
        if (req.method === 'GET') return new Response('Use POST', {status: 405, headers: Object.assign({Allow: 'POST'}, h)});
        if (req.method === 'DELETE') return new Response(null, {status: 204, headers: h});
        if (req.method !== 'POST') return new Response(null, {status: 405, headers: h});
        const body = await req.json().catch(() => null);
        if (!body) return json({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}, 400, h);
        const many = Array.isArray(body);
        const out = (await Promise.all((many ? body : [body]).map(m => handle(m, env)))).filter(Boolean);
        if (!out.length) return new Response(null, {status: 202, headers: h});
        return json(many ? out : out[0], 200, h);
      }

      if (path === '/') return new Response(`TaskNotes Worker v${VERSION} is running.\nClaude connector address: ${origin}/mcp\n`, {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
      return new Response('Not found', {status: 404});
    } catch (e) {
      return json({error: e.message || 'Something went wrong'}, 500, h);
    }
  },
};

// one JSON-RPC message from Claude
export async function handle(m, env) {
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return m && m.id != null ? {jsonrpc: '2.0', id: m.id, error: {code: -32600, message: 'Invalid request'}} : null;
  if (m.id == null) return null;                                           // a notification: nothing to answer
  const ok = result => ({jsonrpc: '2.0', id: m.id, result});
  switch (m.method) {
    case 'initialize': {
      const want = m.params && m.params.protocolVersion;
      return ok({protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[1], capabilities: {tools: {listChanged: false}},
        serverInfo: {name: 'tasknotes', title: 'TaskNotes', version: VERSION},
        instructions: "Darren's TaskNotes: tasks (with category, due date, minutes estimate) and quick notes (some flagged 'review later'). " +
          'Use day_summary for "what is on today". Always use the [id] from a list when editing. Deletes only mark items; Darren confirms them in the app.'});
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({tools: TOOLS});
    case 'tools/call': {
      const name = m.params && m.params.name, args = (m.params && m.params.arguments) || {};
      if (!TOOLS.some(t => t.name === name)) return {jsonrpc: '2.0', id: m.id, error: {code: -32602, message: 'Unknown tool: ' + name}};
      try {
        const text = await serial(async () => {
          const snap = await readAll(env);
          const r = runTool(snap, name, args, env.TZ);
          if (r.changed) await writeAll(env, snap);
          return r.text;
        });
        return ok({content: [{type: 'text', text}], isError: false});
      } catch (e) {
        return ok({content: [{type: 'text', text: e.message || String(e)}], isError: true});
      }
    }
    case 'resources/list': return ok({resources: []});
    case 'prompts/list': return ok({prompts: []});
    default: return {jsonrpc: '2.0', id: m.id, error: {code: -32601, message: 'Method not found: ' + m.method}};
  }
}
