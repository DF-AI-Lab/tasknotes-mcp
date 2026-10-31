/* TaskNotes - the data (no screen code here, so node tests can run it).
   One plain object holds everything: tasks, notes, categories. Every change stamps `updated` and marks the row
   dirty, so the next sync knows what to send. Deletes are soft: `deleted_at` + `deleted_by`.
     deleted_by 'claude'  = Claude asked to delete it; still shown crossed out until you confirm or undo
     deleted_by 'you'     = gone from view; kept as a marker so the delete reaches the Sheet
   Anything deleted more than 7 days ago is dropped for good (purge). */
(function (root) {
  'use strict';
  const DAY = 86400000, PURGE_DAYS = 7;
  const KINDS = ['tasks', 'notes', 'cats', 'secrets'];
  const COLOURS = ['#e0663a', '#2f6fdf', '#7a5af8', '#0f9d76', '#d6409f', '#c99a06', '#0ea5b7', '#64748b'];

  const nowIso = () => new Date().toISOString();
  const rid = p => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function empty() {
    return {v: 1, tasks: [], notes: [], cats: [], secrets: [], dirty: {}, lastSync: '', settings: {name: '', theme: 'ocean', dayMins: 360}};
  }
  function starter() {
    const s = empty();
    [['Home', '🏠', '#e0663a'], ['Work', '💼', '#2f6fdf'], ['AI Lab', '🤖', '#7a5af8'], ['Health', '💪', '#0f9d76']]
      .forEach(([name, emoji, colour]) => s.cats.push({name, emoji, colour, updated: nowIso(), deleted_at: ''}));
    return s;
  }

  // ---------- reading ----------
  const live = r => !r.deleted_at;
  const pendingDelete = r => !!r.deleted_at && r.deleted_by === 'claude';
  const shown = r => live(r) || pendingDelete(r);
  const cats = s => s.cats.filter(live);
  const cat = (s, name) => s.cats.find(c => live(c) && c.name.toLowerCase() === String(name || '').toLowerCase());
  const catOrFirst = (s, name) => cat(s, name) || cats(s)[0] || {name: '', emoji: '📁', colour: '#64748b'};

  // which bucket a task's due date falls in, for the Day screen
  function bucket(due, today) {
    if (!due) return 'No date';
    const t = ymd(today), tm = ymd(addDays(today, 1)), wk = ymd(addDays(today, 7));
    if (due < t) return 'Overdue';
    if (due === t) return 'Today';
    if (due === tm) return 'Tomorrow';
    if (due <= wk) return 'This week';
    return 'Later';
  }
  const BUCKETS = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date'];

  function dueLabel(due, today) {
    if (!due) return 'no date';
    const b = bucket(due, today);
    if (b === 'Today') return 'today';
    if (b === 'Tomorrow') return 'tomorrow';
    const d = new Date(due + 'T12:00:00');
    const day = d.toLocaleDateString('en-GB', {weekday: 'short'});
    if (b === 'This week') return day;
    const label = d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
    return b === 'Overdue' ? 'was ' + label : label;
  }
  const fmtMins = m => { m = Number(m) || 0; if (!m) return ''; return m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + 'm'; };

  // ---------- quick add: "Book MOT 15m tomorrow #home" ----------
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function parseQuick(text, s, today) {
    let t = ' ' + String(text || '') + ' ', category = '', due = '', mins = 0;
    t = t.replace(/\s#([\w-]+)/g, (m, c) => {
      const hit = s.cats.filter(live).find(x => x.name.toLowerCase().replace(/\s+/g, '').startsWith(c.toLowerCase()));
      if (hit) { category = hit.name; return ' '; }
      return m;
    });
    t = t.replace(/\s(\d+(?:\.\d+)?)\s?(h|hr|hrs|hours?|m|min|mins|minutes?)(?=\s)/i, (m, n, u) => {
      mins = Math.round(Number(n) * (/^h/i.test(u) ? 60 : 1)); return ' ';
    });
    t = t.replace(/\s(today|tonight|tomorrow|tmrw|mon|tue|wed|thu|fri|sat|sun)[a-z]*(?=\s)/i, (m, w) => {
      w = w.toLowerCase();
      if (w === 'today' || w === 'tonight') due = ymd(today);
      else if (w === 'tomorrow' || w === 'tmrw') due = ymd(addDays(today, 1));
      else { let n = (DAYS.indexOf(w) - today.getDay() + 7) % 7; if (n === 0) n = 7; due = ymd(addDays(today, n)); }
      return ' ';
    });
    return {title: t.replace(/\s+/g, ' ').trim(), category, due, mins};
  }

  // ---------- changing ----------
  function touch(s, kind, row) { row.updated = nowIso(); s.dirty[kind + ':' + key(kind, row)] = row.updated; return row; }
  const key = (kind, row) => kind === 'cats' ? row.name : row.id;

  function addTask(s, f) {
    const row = {id: rid('t'), title: String(f.title || '').trim(), category: catOrFirst(s, f.category).name,
      due: f.due || '', estimate_mins: Number(f.estimate_mins) || 0, done: false, done_at: '', created: nowIso(),
      updated: '', deleted_at: '', deleted_by: ''};
    s.tasks.unshift(row);
    return touch(s, 'tasks', row);
  }
  function addNote(s, f) {
    const row = {id: rid('n'), text: String(f.text || '').trim(), category: catOrFirst(s, f.category).name,
      review_later: !!f.review_later, reviewed: false, created: nowIso(), updated: '', deleted_at: '', deleted_by: ''};
    s.notes.unshift(row);
    return touch(s, 'notes', row);
  }
  const find = (s, kind, id) => (s[kind] || []).find(r => r.id === id);
  function edit(s, kind, id, f) {
    const row = find(s, kind, id);
    if (!row) return null;
    Object.keys(f).forEach(k => { if (k !== 'id' && k !== 'created') row[k] = f[k]; });
    return touch(s, kind, row);
  }
  function tick(s, id, done) {
    const row = find(s, 'tasks', id);
    if (!row) return null;
    row.done = done == null ? !row.done : !!done;
    row.done_at = row.done ? nowIso() : '';
    return touch(s, 'tasks', row);
  }
  function flag(s, id, on) {
    const row = find(s, 'notes', id);
    if (!row) return null;
    row.review_later = on == null ? !row.review_later : !!on;
    row.reviewed = !row.review_later;
    return touch(s, 'notes', row);
  }
  function remove(s, kind, id, by) {                     // by: 'you' (straight away) or 'claude' (asks first)
    const row = find(s, kind, id);
    if (!row) return null;
    row.deleted_at = nowIso(); row.deleted_by = by || 'you';
    return touch(s, kind, row);
  }
  function undelete(s, kind, id) {
    const row = find(s, kind, id);
    if (!row) return null;
    row.deleted_at = ''; row.deleted_by = '';
    return touch(s, kind, row);
  }
  // 🔐 a secret: `data` is already scrambled by the app (title + text), so the Sheet and Claude only see gibberish
  function addSecret(s, data) {
    s.secrets = s.secrets || [];
    const row = {id: rid('s'), data: String(data || ''), created: nowIso(), updated: '', deleted_at: '', deleted_by: ''};
    s.secrets.unshift(row);
    return touch(s, 'secrets', row);
  }
  const confirmDelete = (s, kind, id) => { const r = find(s, kind, id); if (!r) return null; r.deleted_by = 'you'; return touch(s, kind, r); };

  function addCat(s, name, emoji, colour) {
    name = String(name || '').trim().slice(0, 24);
    if (!name) return null;
    let row = s.cats.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (row && live(row)) return row;
    if (!row) { row = {name, emoji: '', colour: '', updated: '', deleted_at: ''}; s.cats.push(row); }
    row.deleted_at = '';
    row.emoji = emoji || row.emoji || '📁';
    row.colour = colour || row.colour || COLOURS[s.cats.length % COLOURS.length];
    return touch(s, 'cats', row);
  }
  function editCat(s, oldName, f) {
    const row = cat(s, oldName);
    if (!row) return null;
    const newName = String(f.name || row.name).trim().slice(0, 24);
    if (newName.toLowerCase() !== row.name.toLowerCase()) {
      if (cat(s, newName)) return null;                       // that name is taken
      // a rename = the old name deleted + a new one, and every task/note moves across
      row.deleted_at = nowIso(); touch(s, 'cats', row);
      const fresh = addCat(s, newName, f.emoji || row.emoji, f.colour || row.colour);
      s.tasks.concat(s.notes).forEach(r => { if (r.category === row.name) { r.category = newName; touch(s, r.id[0] === 't' ? 'tasks' : 'notes', r); } });
      return fresh;
    }
    if (f.emoji) row.emoji = f.emoji;
    if (f.colour) row.colour = f.colour;
    return touch(s, 'cats', row);
  }
  function removeCat(s, name) {
    const row = cat(s, name);
    if (!row || cats(s).length <= 1) return null;
    row.deleted_at = nowIso(); touch(s, 'cats', row);
    const to = cats(s)[0].name;                                // its tasks and notes move to the first category
    s.tasks.concat(s.notes).forEach(r => { if (r.category === row.name) { r.category = to; touch(s, r.id[0] === 't' ? 'tasks' : 'notes', r); } });
    return row;
  }

  function purge(s, nowMs) {
    const old = r => r.deleted_at && (nowMs - Date.parse(r.deleted_at)) > PURGE_DAYS * DAY;
    let n = 0;
    KINDS.forEach(k => { if (!s[k]) s[k] = []; const before = s[k].length; s[k] = s[k].filter(r => !old(r)); n += before - s[k].length; });
    return n;
  }

  // ---------- sync ----------
  // what to send: every dirty row, as it is now
  function outbox(s) {
    const out = {tasks: [], notes: [], cats: [], secrets: []};
    Object.keys(s.dirty).forEach(k => {
      const i = k.indexOf(':'), kind = k.slice(0, i), id = k.slice(i + 1);
      const row = kind === 'cats' ? s.cats.find(c => c.name === id) : find(s, kind, id);
      if (row) out[kind].push(Object.assign({}, row));
    });
    return out;
  }
  const outboxCount = s => Object.keys(s.dirty).length;
  // the Worker answers with the whole Sheet; rows changed here while the sync was running are kept
  function merge(s, sent, snap) {
    const known = KINDS.filter(k => Array.isArray(snap[k]));      // an older Worker may not send secrets yet: leave those alone
    KINDS.forEach(k => { if (!s[k]) s[k] = []; });
    known.forEach(kind => {
      const mine = new Map(s[kind].map(r => [key(kind, r), r]));
      const next = snap[kind].map(r => {
        const k = key(kind, r), local = mine.get(k), d = s.dirty[kind + ':' + k];
        return local && d && d > (r.updated || '') ? local : r;
      });
      const have = new Set(next.map(r => key(kind, r)));
      s[kind].forEach(r => { const k = key(kind, r); if (!have.has(k) && s.dirty[kind + ':' + k]) next.push(r); });
      s[kind] = next;
    });
    // anything sent and not changed since is safe now
    known.forEach(kind => (sent[kind] || []).forEach(r => {
      const k = kind + ':' + key(kind, r);
      if (s.dirty[k] === r.updated) delete s.dirty[k];
    }));
    s.lastSync = nowIso();
    return s;
  }

  // ---------- demo data (?demo=1) ----------
  function demo(today) {
    const s = starter();
    s.settings.name = 'Darren';
    const d = n => ymd(addDays(today, n));
    [['Book MOT', 'Home', d(0), 15], ['Set up Cloudflare Worker', 'AI Lab', d(0), 60], ["Reply to Sam's email", 'Work', d(0), 10],
     ['Gym: legs', 'Health', d(0), 50], ['Pay window cleaner', 'Home', d(-1), 5], ['Clean out the shed', 'Home', d(1), 90],
     ['Write MCP tool list', 'AI Lab', d(1), 30], ['Send invoice', 'Work', d(3), 20], ['Plan next sprint', 'Work', d(12), 45],
     ['Read about passkeys', 'AI Lab', '', 25]]
      .forEach(([title, category, due, estimate_mins]) => addTask(s, {title, category, due, estimate_mins}));
    tick(s, addTask(s, {title: 'Order bin bags', category: 'Home', due: d(0), estimate_mins: 5}).id, true);
    [['Shared login for all DF apps', 'AI Lab', true], ['Try reminders v2', 'AI Lab', false], ['Fence panel is loose', 'Home', true],
     ['Ask about Friday rota', 'Work', true], ['Stretch after runs', 'Health', false]]
      .forEach(([text, category, review_later]) => addNote(s, {text, category, review_later}));
    const t = addTask(s, {title: 'Old test task', category: 'Work', due: d(-5), estimate_mins: 10});
    remove(s, 'tasks', t.id, 'claude');
    s.tasks.reverse(); s.notes.reverse();
    s.dirty = {};
    return s;
  }

  const Store = {DAY, PURGE_DAYS, COLOURS, BUCKETS, empty, starter, demo, ymd, addDays, bucket, dueLabel, fmtMins, parseQuick,
    live, pendingDelete, shown, cats, cat, catOrFirst, addTask, addNote, edit, tick, flag, remove, undelete, confirmDelete,
    addCat, editCat, removeCat, addSecret, KINDS, purge, outbox, outboxCount, merge, find};
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
  else root.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
