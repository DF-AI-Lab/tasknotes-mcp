/* TaskNotes - sync with the Cloudflare Worker (which keeps the Google Sheet).
   The phone sends every changed row; the Worker writes them to the Sheet (newest `updated` wins)
   and answers with the whole Sheet. Works offline: changes wait in the outbox until the next sync. */
(function (root) {
  'use strict';
  const KEY = 'tn_sync_v1';

  function config() { try { return JSON.parse(root.localStorage.getItem(KEY)) || {url: '', key: ''}; } catch (e) { return {url: '', key: ''}; } }
  function setConfig(c) {
    const url = String(c.url || '').trim().replace(/\/+$/, '');
    try { root.localStorage.setItem(KEY, JSON.stringify({url, key: String(c.key || '').trim()})); } catch (e) { /* private window */ }
  }
  const ready = () => { const c = config(); return !!(c.url && c.key); };

  async function call(path, bodyObj) {
    const c = config();
    const r = await fetch(c.url + path, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key},
      body: JSON.stringify(bodyObj || {})});
    if (r.status === 401) throw new Error('The app key is wrong. Check Settings > Cloud sync.');
    if (!r.ok) throw new Error('Sync failed (' + r.status + '). Try again later.');
    return r.json();
  }

  // one round: send the outbox, merge what comes back. Returns {sent, got}
  async function run(state) {
    const S = root.Store || require('./store.js');
    const sent = S.outbox(state);
    const snap = await call('/api/sync', {changes: sent});
    S.merge(state, sent, snap);
    return {sent: sent.tasks.length + sent.notes.length + sent.cats.length, got: (snap.tasks || []).length + (snap.notes || []).length};
  }
  async function test(c) {
    const url = String(c.url || '').trim().replace(/\/+$/, '');
    const r = await fetch(url + '/api/ping', {method: 'POST', headers: {Authorization: 'Bearer ' + String(c.key || '').trim()}});
    if (r.status === 401) return 'The app key is wrong.';
    if (!r.ok) return 'The Worker answered ' + r.status + '.';
    const j = await r.json();
    return j.sheet ? '' : (j.error || 'The Worker cannot open the Sheet yet.');
  }

  const Sync = {config, setConfig, ready, run, test};
  if (typeof module !== 'undefined' && module.exports) module.exports = Sync;
  else root.Sync = Sync;
})(typeof window !== 'undefined' ? window : globalThis);
