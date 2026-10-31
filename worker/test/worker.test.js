// node --test test/   (node 22, no installs). A fake Google Sheet stands in for the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {handle} from '../src/index.js';
import {runTool, parseDue, fromValues, toValues, applyChanges} from '../src/data.js';
import {_test as g} from '../src/google.js';

// ---------- a fake Google ----------
const sheet = {
  Tasks: [['id', 'title', 'category', 'due', 'estimate_mins', 'done', 'done_at', 'created'], ['t1', 'Book MOT', 'Home', '01/11/2026', '15', 'FALSE', '', '2026-10-30']],
  Notes: [['id', 'text', 'category', 'review_later', 'reviewed', 'created'], ['n1', 'Fence loose', 'Home', 'TRUE', 'FALSE', '2026-10-30']],
  Categories: [['name', 'colour'], ['Home', '#e0663a'], ['Work', '#2f6fdf']],
};
let calls = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); calls.push(url);
  const ok = o => new Response(JSON.stringify(o), {status: 200, headers: {'Content-Type': 'application/json'}});
  if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({access_token: 'g-token', expires_in: 3600});
  assert.equal(opts.headers.Authorization, 'Bearer g-token');
  if (url.includes('values:batchGet')) {
    const ranges = [...new URL(url).searchParams.getAll('ranges')].map(r => r.split('!')[0]);
    return ok({valueRanges: ranges.map(t => ({values: sheet[t]}))});
  }
  if (url.includes('values:batchUpdate')) {
    JSON.parse(opts.body).data.forEach(d => { sheet[d.range.split('!')[0]] = d.values.map(r => r.map(v => typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v))); });
    return ok({});
  }
  if (url.includes('values:batchClear')) return ok({});
  return new Response('{}', {status: 404});
};

const keys = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
const pk = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
const env = {
  SHEET_ID: 'sheet123', TZ: 'Europe/London', APP_KEY: 'app-key-123', MCP_PIN: '24681357', TOKEN_SECRET: 'a-long-secret-for-tests-only',
  GOOGLE_SERVICE_ACCOUNT: JSON.stringify({client_email: 'robot@x.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----\n`}),
};
const W = 'https://tasknotes.test';
const call = (path, init = {}) => worker.fetch(new Request(W + path, init), env);

test('reads the old mock sheet format', () => {
  const t = fromValues('tasks', sheet.Tasks);
  assert.equal(t[0].due, '2026-11-01'); assert.equal(t[0].estimate_mins, 15); assert.equal(t[0].done, false);
  const n = fromValues('notes', sheet.Notes); assert.equal(n[0].review_later, true);
  assert.deepEqual(toValues('cats', [{name: 'Home', colour: '#e0663a'}])[1], ['Home', '#e0663a', '', '', '']);
});

test('dates', () => {
  assert.equal(parseDue('tomorrow', '2026-10-31'), '2026-11-01');
  assert.equal(parseDue('monday', '2026-10-31'), '2026-11-02');
  assert.equal(parseDue('sat', '2026-10-31'), '2026-11-07');
  assert.equal(parseDue('', '2026-10-31'), '');
  assert.throws(() => parseDue('whenever', '2026-10-31'));
});

test('phone: wrong key is refused, sync merges and writes', async () => {
  g.reset();
  assert.equal((await call('/api/ping', {method: 'POST', headers: {Authorization: 'Bearer nope'}})).status, 401);
  const ping = await (await call('/api/ping', {method: 'POST', headers: {Authorization: 'Bearer app-key-123'}})).json();
  assert.equal(ping.sheet, true);
  const row = {id: 't_phone', title: 'From phone', category: 'Work', due: '2026-11-02', estimate_mins: 30, done: false, created: '2026-10-31T10:00:00Z', updated: '2026-10-31T10:00:00Z'};
  const r = await call('/api/sync', {method: 'POST', headers: {Authorization: 'Bearer app-key-123', 'Content-Type': 'application/json'}, body: JSON.stringify({changes: {tasks: [row]}})});
  const snap = await r.json();
  assert.equal(snap.tasks.length, 2);
  assert.equal(sheet.Tasks[0].length, 11);                     // new columns added
  assert.equal(sheet.Tasks[2][1], 'From phone');
  // an older copy does not win
  applyChanges(snap, {tasks: [Object.assign({}, row, {title: 'old', updated: '2020-01-01'})]});
  assert.equal(snap.tasks.find(t => t.id === 't_phone').title, 'From phone');
});

test('Claude: PIN login, then the tools', async () => {
  // no token = told where to log in
  const no = await call('/mcp', {method: 'POST', body: '{}'});
  assert.equal(no.status, 401);
  assert.match(no.headers.get('WWW-Authenticate'), /oauth-protected-resource/);
  const meta = await (await call('/.well-known/oauth-authorization-server')).json();
  assert.equal(meta.token_endpoint, W + '/token');
  // register
  const ru = 'https://claude.ai/api/mcp/auth_callback';
  assert.equal((await call('/register', {method: 'POST', body: JSON.stringify({redirect_uris: ['https://evil.example/cb']})})).status, 400);
  const reg = await (await call('/register', {method: 'POST', body: JSON.stringify({redirect_uris: [ru], client_name: 'Claude'})})).json();
  // PKCE
  const verifier = 'verifier-' + 'x'.repeat(50);
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
  const q = new URLSearchParams({response_type: 'code', client_id: reg.client_id, redirect_uri: ru, code_challenge: challenge, code_challenge_method: 'S256', state: 'abc'});
  const pageRes = await call('/authorize?' + q);
  assert.match(await pageRes.text(), /Connect Claude/);
  const wrong = await call('/authorize', {method: 'POST', body: new URLSearchParams([...q, ['pin', '0000']])});
  assert.match(await wrong.text(), /Wrong PIN/);
  const good = await call('/authorize', {method: 'POST', body: new URLSearchParams([...q, ['pin', '24681357']])});
  assert.equal(good.status, 302);
  const back = new URL(good.headers.get('Location'));
  assert.equal(back.searchParams.get('state'), 'abc');
  const tokBad = await call('/token', {method: 'POST', body: new URLSearchParams({grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: ru, code_verifier: 'wrong'})});
  assert.equal(tokBad.status, 400);
  const tok = await (await call('/token', {method: 'POST', body: new URLSearchParams({grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: ru, code_verifier: verifier})})).json();
  assert.ok(tok.access_token && tok.refresh_token);
  const ref = await (await call('/token', {method: 'POST', body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: tok.refresh_token})})).json();
  assert.ok(ref.access_token);

  const mcp = async body => (await call('/mcp', {method: 'POST', headers: {Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json'}, body: JSON.stringify(body)}));
  const init = await (await mcp({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 't', version: '1'}}})).json();
  assert.equal(init.result.serverInfo.name, 'tasknotes');
  assert.equal((await mcp({jsonrpc: '2.0', method: 'notifications/initialized'})).status, 202);
  const list = await (await mcp({jsonrpc: '2.0', id: 2, method: 'tools/list'})).json();
  assert.ok(list.result.tools.some(t => t.name === 'add_task'));
  const add = await (await mcp({jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name: 'add_task', arguments: {title: 'Ring the garage', category: 'home', due: 'tomorrow', estimate_mins: 10}}})).json();
  assert.equal(add.result.isError, false);
  assert.match(add.result.content[0].text, /Ring the garage \| Home/);
  assert.ok(sheet.Tasks.some(r => r[1] === 'Ring the garage'));
  const bad = await (await mcp({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'add_task', arguments: {title: 'x', category: 'Nope'}}})).json();
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /Categories: Home, Work/);
});

test('tools on a snapshot', () => {
  const snap = {tasks: [], notes: [], cats: [{name: 'Home', colour: '#e0663a', emoji: '🏠', updated: '', deleted_at: ''}]};
  const id = runTool(snap, 'add_task', {title: 'A', due: 'today', estimate_mins: 30}).text.match(/\[(t_[^\]]+)\]/)[1];
  assert.match(runTool(snap, 'day_summary', {}).text, /1 task\(s\) due or overdue, about 30m/);
  runTool(snap, 'complete_task', {id});
  assert.equal(snap.tasks[0].done, true);
  assert.match(runTool(snap, 'list_tasks', {include_done: true}).text, /✅ A/);
  const nid = runTool(snap, 'add_note', {text: 'look at this', review_later: true}).text.match(/\[(n_[^\]]+)\]/)[1];
  assert.match(runTool(snap, 'list_review_notes', {}).text, /look at this/);
  runTool(snap, 'edit_note', {id: nid, review_later: false});
  assert.equal(snap.notes[0].reviewed, true);
  runTool(snap, 'delete_item', {id: nid});
  assert.equal(snap.notes[0].deleted_by, 'claude');
  assert.match(runTool(snap, 'add_category', {name: 'Garden', emoji: '🌱'}).text, /Garden/);
  assert.match(runTool(snap, 'list_categories', {}).text, /Garden/);
  assert.throws(() => runTool(snap, 'edit_task', {id: 'nope'}), /Nothing has the id/);
});

test('MCP handles unknown methods and bad messages', async () => {
  assert.equal((await handle({jsonrpc: '2.0', id: 9, method: 'nope'}, env)).error.code, -32601);
  assert.equal(await handle({jsonrpc: '2.0', method: 'notifications/cancelled'}, env), null);
});
