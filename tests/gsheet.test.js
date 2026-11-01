// ☁️ Google account sync, against a fake Google (no network)
const test = require('node:test');
const assert = require('node:assert/strict');
const mem = () => { const m = new Map(); return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
globalThis.Store = require('../docs/store.js');
const S = globalThis.Store;
const G = require('../docs/gsheet.js');

// a tiny fake of the Drive + Sheets APIs: one spreadsheet, tabs as arrays of rows
function fakeGoogle() {
  const g = {sheets: null, calls: []};
  const ok = j => ({ok: true, status: 200, json: async () => j});
  g.fetch = async (url, opts = {}) => {
    const u = new URL(url), body = opts.body ? JSON.parse(opts.body) : null;
    g.calls.push((opts.method || 'GET') + ' ' + u.pathname);
    assert.match(opts.headers.Authorization, /^Bearer tok/);
    if (u.pathname === '/drive/v3/files') return ok({files: g.sheets ? [{id: 'sh1', name: 'TaskNotes Data'}] : []});
    if (u.pathname === '/v4/spreadsheets' && opts.method === 'POST') { g.sheets = {}; body.sheets.forEach(s => { g.sheets[s.properties.title] = []; }); return ok({spreadsheetId: 'sh1'}); }
    if (u.pathname.endsWith('/values:batchGet')) return ok({valueRanges: u.searchParams.getAll('ranges').map(r => ({values: g.sheets[r.split('!')[0]]}))});
    if (u.pathname.endsWith('/values:batchUpdate')) { body.data.forEach(d => { g.sheets[d.range.split('!')[0]] = d.values; }); return ok({}); }
    if (u.pathname.endsWith('/values:batchClear')) return ok({});
    throw new Error('unexpected ' + url);
  };
  return g;
}

test('☁️ first sync makes the Sheet and sends everything, a second phone gets it', async () => {
  const g = fakeGoogle();
  G.setToken('tok1', 3600); G.setConfig({on: true, email: 'me@gmail.com'});
  const a = S.starter();
  S.addTask(a, {title: 'Book MOT', category: 'Home', estimate_mins: 15});
  const sec = S.addSecret(a, 'v1.abc.def');
  S.KINDS.forEach(k => a[k].forEach(r => { a.dirty[k + ':' + (k === 'cats' ? r.name : r.id)] = r.updated; }));
  await G.run(a, g.fetch);
  assert.equal(G.config().sheetId, 'sh1');
  assert.equal(S.outboxCount(a), 0, 'everything sent');
  assert.equal(g.sheets.Tasks[0][0], 'id');
  assert.ok(g.sheets.Tasks.some(r => r[1] === 'Book MOT'));
  assert.ok(g.sheets.Secrets.some(r => r[1] === 'v1.abc.def'), 'secrets go up scrambled');

  const b = S.starter(); b.cats = []; b.dirty = {};
  await G.run(b, g.fetch);
  assert.ok(b.tasks.some(t => t.title === 'Book MOT' && t.estimate_mins === 15));
  assert.ok(b.secrets.some(s => s.id === sec.id));
});

test('☁️ no token = asks for a tap, nothing is sent', async () => {
  G.setToken('');
  const a = S.starter();
  await assert.rejects(G.run(a, fakeGoogle().fetch), e => e.needTap === true);
});

test('☁️ Sheets switched off gives a clear message', async () => {
  G.setToken('tok2', 3600); G.setConfig({on: true, sheetId: 'sh1'});
  const off = async () => ({ok: false, status: 403, json: async () => ({error: {message: 'Google Sheets API has not been used in project 1018 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=1018 then retry.'}})});
  await assert.rejects(G.run(S.starter(), off), e => /not switched on/.test(e.message) && /console\.developers/.test(e.link));
});
