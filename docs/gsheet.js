/* TaskNotes - ☁️ your own Google account, right from the app (no Worker needed).
   Tap "Sign in with Google", pick your email, and the app makes a Sheet called "TaskNotes Data" in that Drive.
   Every sync reads the Sheet, adds this phone's changes (newest `updated` wins), and writes it back.
   Scope drive.file: the app can only ever see the files it made, never the rest of your Drive.
   It uses the same Google project as Where's My Money (config.js). */
(function (root) {
  'use strict';
  const KEY = 'tn_google_v1', TOK = 'tn_google_tok';
  const NAME = 'TaskNotes Data';
  const SHEET_TYPE = 'application/vnd.google-apps.spreadsheet';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const GSI = 'https://accounts.google.com/gsi/client';
  const DRIVE = 'https://www.googleapis.com/drive/v3', SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

  // same columns as the Worker (worker/src/data.js), so Claude can read the same Sheet later
  const COLS = {
    tasks: ['id', 'title', 'category', 'due', 'estimate_mins', 'done', 'done_at', 'created', 'updated', 'deleted_at', 'deleted_by'],
    notes: ['id', 'text', 'category', 'review_later', 'reviewed', 'created', 'updated', 'deleted_at', 'deleted_by'],
    cats: ['name', 'colour', 'emoji', 'updated', 'deleted_at'],
    secrets: ['id', 'data', 'created', 'updated', 'deleted_at', 'deleted_by'],
  };
  const TABS = {tasks: 'Tasks', notes: 'Notes', cats: 'Categories', secrets: 'Secrets'};
  const BOOLS = new Set(['done', 'review_later', 'reviewed']), NUMS = new Set(['estimate_mins']);
  const keyOf = (kind, r) => kind === 'cats' ? r.name : r.id;

  // ---------- rows <-> Sheet values ----------
  function cell(col, v) {
    if (BOOLS.has(col)) return v === true || /^(true|yes|1|x|✓)$/i.test(String(v == null ? '' : v).trim());
    if (NUMS.has(col)) return Number(v) || 0;
    return v == null ? '' : String(v);
  }
  function fromValues(kind, values) {
    if (!values || !values.length) return [];
    const head = values[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
    return values.slice(1).filter(r => r.some(v => String(v == null ? '' : v).trim() !== '')).map(r => {
      const o = {};
      COLS[kind].forEach(c => { const i = head.indexOf(c); o[c] = cell(c, i >= 0 ? r[i] : ''); });
      return o;
    }).filter(o => keyOf(kind, o));
  }
  const toValues = (kind, rows) => [COLS[kind]].concat(rows.map(r => COLS[kind].map(c => cell(c, r[c]))));
  // newest `updated` wins. Returns true if the Sheet needs writing
  function applyChanges(snap, changes) {
    let changed = false;
    Object.keys(COLS).forEach(kind => {
      const list = snap[kind] || (snap[kind] = []), at = new Map(list.map((r, i) => [keyOf(kind, r), i]));
      ((changes && changes[kind]) || []).forEach(raw => {
        const r = {}; COLS[kind].forEach(c => { r[c] = cell(c, raw[c]); });
        const k = keyOf(kind, r);
        if (!k) return;
        if (!at.has(k)) { list.push(r); at.set(k, list.length - 1); changed = true; return; }
        const old = list[at.get(k)];
        if ((r.updated || '') >= (old.updated || '') && JSON.stringify(r) !== JSON.stringify(old)) { list[at.get(k)] = r; changed = true; }
      });
    });
    return changed;
  }

  // ---------- saved settings: {email, sheetId} (the token only lives for this visit) ----------
  const ls = root.localStorage, ss = root.sessionStorage;
  function config() { try { return JSON.parse(ls.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function setConfig(c) { try { if (c) ls.setItem(KEY, JSON.stringify(c)); else ls.removeItem(KEY); } catch (e) { /* private window */ } }
  const on = () => !!config().on;
  function token() { try { const t = JSON.parse(ss.getItem(TOK)); return t && t.exp > Date.now() + 60000 ? t.t : ''; } catch (e) { return ''; } }
  function setToken(t, secs) { try { if (t) ss.setItem(TOK, JSON.stringify({t, exp: Date.now() + (secs || 3600) * 1000})); else ss.removeItem(TOK); } catch (e) { /* ignore */ } }
  const clientId = () => (root.TN_CONFIG || {}).googleClientId || '';
  const sheetUrl = () => config().sheetId ? 'https://docs.google.com/spreadsheets/d/' + config().sheetId + '/edit' : '';

  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (root.google && root.google.accounts && root.google.accounts.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = GSI; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not reach Google. Check your internet and try again.'));
      document.head.appendChild(s);
    });
  }
  // mode: 'first' (normal Google sign-in), 'pick' (choose another account), 'quiet' (no picker: you said yes before)
  async function signIn(mode) {
    if (!clientId()) throw new Error('Google sign-in is not set up in this copy of the app.');
    await loadGsi();
    const hint = mode === 'quiet' ? config().email : '';
    await new Promise((resolve, reject) => {
      const client = root.google.accounts.oauth2.initTokenClient(Object.assign({
        client_id: clientId(), scope: SCOPE,
        callback: t => { if (t && t.access_token) { setToken(t.access_token, Number(t.expires_in)); resolve(); } else reject(new Error('Google did not let you in. Try again.')); },
        error_callback: () => reject(new Error('Google sign-in was closed or blocked. Try again.')),
      }, hint ? {login_hint: hint} : {}));
      client.requestAccessToken(mode === 'quiet' ? Object.assign({prompt: ''}, hint ? {login_hint: hint} : {}) : mode === 'pick' ? {prompt: 'select_account'} : {});
    });
  }

  async function api(url, opts, fetcher) {
    opts = Object.assign({}, opts || {});
    opts.headers = Object.assign({Authorization: 'Bearer ' + token()}, opts.body ? {'Content-Type': 'application/json'} : {}, opts.headers || {});
    let r;
    try { r = await (fetcher || root.fetch.bind(root))(url, opts); } catch (e) { throw new Error('Could not reach Google. Check your internet.'); }
    if (r.status === 401) { setToken(''); const e = new Error('Google needs you to sign in again.'); e.needTap = true; throw e; }
    if (!r.ok) {
      let j = {}; try { j = await r.json(); } catch (e) { /* no body */ }
      const msg = (j.error && j.error.message) || '';
      if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg + JSON.stringify(j))) {
        const e = new Error('Google Sheets is not switched on for this app yet. This is a one-time job for the app maker.');
        e.link = (msg.match(/https:\/\/console\.developers\.google\.com\S+/) || [])[0] || '';
        throw e;
      }
      const e = new Error('Google said no (' + r.status + ')' + (msg ? ': ' + msg : '.')); e.status = r.status; throw e;
    }
    return r.status === 204 ? {} : r.json();
  }

  // find "TaskNotes Data" in your Drive (only files this app made are visible), or make it
  async function findOrMake(fetcher) {
    const q = encodeURIComponent(`name='${NAME}' and mimeType='${SHEET_TYPE}' and trashed=false`);
    const list = await api(`${DRIVE}/files?q=${q}&orderBy=createdTime&fields=files(id,name)`, {}, fetcher);
    const f = (list.files || []).find(x => x.name === NAME);
    if (f) return f.id;
    const made = await api(SHEETS, {method: 'POST', body: JSON.stringify({properties: {title: NAME},
      sheets: Object.values(TABS).map(title => ({properties: {title}}))})}, fetcher);
    await writeAll(made.spreadsheetId, {tasks: [], notes: [], cats: [], secrets: []}, fetcher);
    return made.spreadsheetId;
  }
  async function email(fetcher) {
    try { return ((await api(`${DRIVE}/about?fields=user(emailAddress)`, {}, fetcher)).user || {}).emailAddress || ''; } catch (e) { return ''; }
  }

  // tap "Sign in with Google": pick an account, find or make the Sheet
  async function connect(pick, fetcher) {
    await signIn(pick ? 'pick' : 'first');
    const who = await email(fetcher), id = await findOrMake(fetcher);
    setConfig({on: true, email: who, sheetId: id});
    return config();
  }
  // no token this visit: get one quietly (needs a tap, browsers block pop-ups otherwise)
  async function wake() { if (on() && !token()) await signIn('quiet'); }
  function signOut() {
    const t = token();
    setToken(''); setConfig(null);
    try { if (t && root.google && root.google.accounts) root.google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* ignore */ }
  }

  async function readAll(id, fetcher) {
    const ranges = Object.values(TABS).map(t => 'ranges=' + encodeURIComponent(t + '!A1:Z')).join('&');
    let j;
    try { j = await api(`${SHEETS}/${id}/values:batchGet?${ranges}`, {}, fetcher); }
    catch (e) {
      if (!/Unable to parse range/i.test(e.message)) throw e;
      const meta = await api(`${SHEETS}/${id}?fields=sheets.properties.title`, {}, fetcher);      // a tab was deleted: put it back
      const have = new Set(meta.sheets.map(s => s.properties.title));
      const add = Object.values(TABS).filter(t => !have.has(t)).map(title => ({addSheet: {properties: {title}}}));
      if (add.length) await api(`${SHEETS}/${id}:batchUpdate`, {method: 'POST', body: JSON.stringify({requests: add})}, fetcher);
      j = await api(`${SHEETS}/${id}/values:batchGet?${ranges}`, {}, fetcher);
    }
    const out = {};
    Object.keys(TABS).forEach((k, i) => { out[k] = fromValues(k, ((j.valueRanges || [])[i] || {}).values || []); });
    return out;
  }
  async function writeAll(id, snap, fetcher) {
    const data = Object.entries(TABS).map(([k, tab]) => ({range: tab + '!A1', values: toValues(k, snap[k] || [])}));
    await api(`${SHEETS}/${id}/values:batchUpdate`, {method: 'POST', body: JSON.stringify({valueInputOption: 'RAW', data})}, fetcher);
    const clear = Object.entries(TABS).map(([k, tab]) => `${tab}!A${(snap[k] || []).length + 2}:Z`);
    await api(`${SHEETS}/${id}/values:batchClear`, {method: 'POST', body: JSON.stringify({ranges: clear})}, fetcher);
  }

  // one round, same shape as Sync.run: send this phone's changes, take the whole Sheet back
  async function run(state, fetcher) {
    const S = root.Store || require('./store.js');
    if (!token()) { const e = new Error('Tap anywhere to reconnect Google.'); e.needTap = true; throw e; }
    let id = config().sheetId;
    if (!id) { id = await findOrMake(fetcher); setConfig(Object.assign(config(), {sheetId: id})); }
    let sent = S.outbox(state), snap;
    try { snap = await readAll(id, fetcher); }
    catch (e) {
      if (e.status !== 404) throw e;                           // the Sheet was deleted: make a new one, send everything
      id = await findOrMake(fetcher); setConfig(Object.assign(config(), {sheetId: id}));
      S.KINDS.forEach(k => (state[k] || []).forEach(r => { state.dirty[k + ':' + keyOf(k, r)] = r.updated || new Date().toISOString(); }));
      sent = S.outbox(state);
      snap = await readAll(id, fetcher);
    }
    if (applyChanges(snap, sent)) await writeAll(id, snap, fetcher);
    S.merge(state, sent, snap);
    return {sent: S.KINDS.reduce((n, k) => n + (sent[k] || []).length, 0)};
  }

  const GSheet = {config, setConfig, on, token, setToken, clientId, sheetUrl, ready: loadGsi, connect, wake, signOut, run,
    _: {fromValues, toValues, applyChanges, readAll, writeAll, findOrMake}};
  if (typeof module !== 'undefined' && module.exports) module.exports = GSheet;
  else root.GSheet = GSheet;
})(typeof window !== 'undefined' ? window : globalThis);
