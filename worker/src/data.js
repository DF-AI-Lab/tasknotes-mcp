// TaskNotes Worker - the data rules (no network here, so tests can run it in node).
// A "snapshot" is the whole Sheet as plain objects: {tasks: [...], notes: [...], cats: [...]}.

export const COLS = {
  tasks: ['id', 'title', 'category', 'due', 'estimate_mins', 'done', 'done_at', 'created', 'updated', 'deleted_at', 'deleted_by'],
  notes: ['id', 'text', 'category', 'review_later', 'reviewed', 'created', 'updated', 'deleted_at', 'deleted_by'],
  cats: ['name', 'colour', 'emoji', 'updated', 'deleted_at'],
};
export const TABS = {tasks: 'Tasks', notes: 'Notes', cats: 'Categories'};
const BOOLS = new Set(['done', 'review_later', 'reviewed']);
const NUMS = new Set(['estimate_mins']);
const COLOURS = ['#e0663a', '#2f6fdf', '#7a5af8', '#0f9d76', '#d6409f', '#c99a06', '#0ea5b7', '#64748b'];
const DAY = 86400000, PURGE_DAYS = 7;

export const keyOf = (kind, r) => kind === 'cats' ? r.name : r.id;
export const live = r => !r.deleted_at;
const nowIso = () => new Date().toISOString();
const rid = p => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// ---------- Sheet rows <-> objects ----------
function cell(col, v) {
  if (BOOLS.has(col)) return v === true || /^(true|yes|1|x|✓)$/i.test(String(v ?? '').trim());
  if (NUMS.has(col)) return Number(v) || 0;
  if (col === 'due') return normalDate(v);
  return v == null ? '' : String(v);
}
function normalDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);          // 01/11/2026 (UK)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}$/.test(s)) {                                        // a Sheets day number
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * DAY);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
export function fromValues(kind, values) {
  if (!values || !values.length) return [];
  const head = values[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
  return values.slice(1).filter(r => r.some(v => String(v ?? '').trim() !== '')).map(r => {
    const o = {};
    COLS[kind].forEach(c => { const i = head.indexOf(c === 'colour' && !head.includes('colour') ? 'color' : c); o[c] = cell(c, i >= 0 ? r[i] : ''); });
    return o;
  }).filter(o => keyOf(kind, o));
}
export function toValues(kind, rows) {
  return [COLS[kind]].concat(rows.map(r => COLS[kind].map(c => {
    const v = r[c];
    if (BOOLS.has(c)) return !!v;
    if (NUMS.has(c)) return Number(v) || 0;
    return v == null ? '' : String(v);
  })));
}
export function clean(kind, r) {                      // a row from the phone, trimmed to the known columns
  const o = {};
  COLS[kind].forEach(c => { o[c] = cell(c, r[c]); });
  return o;
}

// ---------- sync: newest `updated` wins ----------
export function applyChanges(snap, changes) {
  let changed = false;
  for (const kind of ['tasks', 'notes', 'cats']) {
    const list = snap[kind], at = new Map(list.map((r, i) => [keyOf(kind, r), i]));
    for (const raw of (changes && changes[kind]) || []) {
      const r = clean(kind, raw), k = keyOf(kind, r);
      if (!k) continue;
      if (!at.has(k)) { list.push(r); at.set(k, list.length - 1); changed = true; continue; }
      const old = list[at.get(k)];
      if ((r.updated || '') >= (old.updated || '') && JSON.stringify(r) !== JSON.stringify(old)) { list[at.get(k)] = r; changed = true; }
    }
  }
  if (purge(snap, Date.now())) changed = true;
  return changed;
}
export function purge(snap, nowMs) {
  let n = 0;
  for (const kind of ['tasks', 'notes', 'cats']) {
    const before = snap[kind].length;
    snap[kind] = snap[kind].filter(r => !(r.deleted_at && nowMs - Date.parse(r.deleted_at) > PURGE_DAYS * DAY));
    n += before - snap[kind].length;
  }
  return n;
}

// ---------- dates ----------
export function todayIn(tz) {
  try { return new Intl.DateTimeFormat('en-CA', {timeZone: tz || 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
const plus = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function parseDue(v, today) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'none' || s === 'no date') return '';
  if (s === 'today' || s === 'tonight') return today;
  if (s === 'tomorrow') return plus(today, 1);
  if (s === 'next week') return plus(today, 7);
  const di = DAYS.findIndex(d => d.startsWith(s.replace(/^next\s+/, '').slice(0, 3)) && s.replace(/^next\s+/, '').length >= 3);
  if (di >= 0) { const wd = new Date(today + 'T12:00:00Z').getUTCDay(); let n = (di - wd + 7) % 7; if (n === 0) n = 7; return plus(today, n); }
  const d = normalDate(v);
  if (!d) throw new Error(`I could not read the date "${v}". Use YYYY-MM-DD, today, tomorrow or a weekday.`);
  return d;
}
function when(due, today) {
  if (!due) return 'no date';
  if (due < today) return 'OVERDUE, was ' + due;
  if (due === today) return 'today';
  if (due === plus(today, 1)) return 'tomorrow';
  return due;
}
const mins = m => { m = Number(m) || 0; if (!m) return ''; return m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + 'm'; };

// ---------- the MCP tools ----------
function findCat(snap, name) {
  const n = String(name || '').trim().toLowerCase();
  const cs = snap.cats.filter(live);
  if (!n) return cs[0] || null;
  return cs.find(c => c.name.toLowerCase() === n) || cs.find(c => c.name.toLowerCase().replace(/\s+/g, '').startsWith(n.replace(/\s+/g, ''))) || null;
}
function needCat(snap, name) {
  const c = findCat(snap, name);
  if (c) return c.name;
  if (!snap.cats.filter(live).length) return '';
  throw new Error(`There is no category called "${name}". Categories: ${snap.cats.filter(live).map(c => c.name).join(', ')}. Use add_category first if you need a new one.`);
}
function getRow(snap, id) {
  id = String(id || '').trim();
  for (const kind of ['tasks', 'notes']) { const r = snap[kind].find(x => x.id === id); if (r) return [kind, r]; }
  throw new Error(`Nothing has the id "${id}". List tasks or notes first to get the right id.`);
}
const taskLine = (t, today) => `- [${t.id}] ${t.done ? '✅ ' : ''}${t.title} | ${t.category} | ${when(t.due, today)}${t.estimate_mins ? ' | ' + mins(t.estimate_mins) : ''}${t.deleted_at ? ' | (waiting for delete confirm)' : ''}`;
const noteLine = n => `- [${n.id}] ${n.review_later ? '🔖 ' : ''}${n.text.replace(/\s+/g, ' ')} | ${n.category}${n.deleted_at ? ' | (waiting for delete confirm)' : ''}`;
const touch = r => { r.updated = nowIso(); return r; };

const str = (d) => ({type: 'string', description: d});
export const TOOLS = [
  {name: 'day_summary', description: "Today's plan: overdue and due-today tasks with total time, plus how many notes wait for review. Start here when asked what is on today.",
    inputSchema: {type: 'object', properties: {}}, annotations: {readOnlyHint: true}},
  {name: 'list_tasks', description: 'List open tasks (or done ones). Each line starts with the [id] to use in other tools.',
    inputSchema: {type: 'object', properties: {
      category: str('Only this category (optional)'),
      when: {type: 'string', enum: ['all', 'overdue', 'today', 'tomorrow', 'week', 'no_date'], description: "'today' includes overdue. Default all."},
      include_done: {type: 'boolean', description: 'Show done tasks instead of open ones'},
      search: str('Only tasks whose title contains this text')}}, annotations: {readOnlyHint: true}},
  {name: 'add_task', description: 'Add a task.',
    inputSchema: {type: 'object', required: ['title'], properties: {
      title: str('What to do'), category: str('Category name (default: the first one)'),
      due: str('YYYY-MM-DD, today, tomorrow, a weekday, or empty for no date'),
      estimate_mins: {type: 'number', description: 'How many minutes it takes'}}}},
  {name: 'edit_task', description: 'Change a task. Only the fields you pass change.',
    inputSchema: {type: 'object', required: ['id'], properties: {
      id: str('Task id, like t_abc123'), title: str('New title'), category: str('New category'),
      due: str('New due date (YYYY-MM-DD, today, tomorrow, weekday, or "none")'), estimate_mins: {type: 'number'}}}},
  {name: 'complete_task', description: 'Tick a task off (or set done=false to reopen it). Done tasks are hidden but kept.',
    inputSchema: {type: 'object', required: ['id'], properties: {id: str('Task id'), done: {type: 'boolean', description: 'Default true'}}}},
  {name: 'list_notes', description: 'List notes. Each line starts with the [id]. 🔖 = flagged to review later.',
    inputSchema: {type: 'object', properties: {category: str('Only this category'), review_later_only: {type: 'boolean'}, search: str('Text to look for')}},
    annotations: {readOnlyHint: true}},
  {name: 'list_review_notes', description: 'Notes flagged "review later".', inputSchema: {type: 'object', properties: {}}, annotations: {readOnlyHint: true}},
  {name: 'add_note', description: 'Add a quick note. Set review_later to flag it for the Review screen.',
    inputSchema: {type: 'object', required: ['text'], properties: {text: str('The note'), category: str('Category name'), review_later: {type: 'boolean'}}}},
  {name: 'edit_note', description: 'Change a note. review_later=false marks it reviewed.',
    inputSchema: {type: 'object', required: ['id'], properties: {id: str('Note id, like n_abc123'), text: str('New text'), category: str('New category'), review_later: {type: 'boolean'}}}},
  {name: 'list_categories', description: 'All categories with how many open tasks and notes each has.', inputSchema: {type: 'object', properties: {}}, annotations: {readOnlyHint: true}},
  {name: 'add_category', description: 'Add a category.',
    inputSchema: {type: 'object', required: ['name'], properties: {name: str('Name'), emoji: str('One emoji (optional)'), colour: str('Hex colour like #2f6fdf (optional)')}}},
  {name: 'delete_item', description: 'Ask to delete a task or note. It is NOT gone yet: it shows crossed out in the app until Darren confirms or keeps it, and goes by itself after 7 days.',
    inputSchema: {type: 'object', required: ['id'], properties: {id: str('Task or note id')}}, annotations: {destructiveHint: true}},
];

// run one tool on the snapshot. Returns {text, changed}
export function runTool(snap, name, a, tz) {
  a = a || {};
  const today = todayIn(tz);
  const open = snap.tasks.filter(t => live(t) && !t.done);
  switch (name) {
    case 'day_summary': {
      const due = open.filter(t => t.due && t.due <= today).sort((x, y) => x.due.localeCompare(y.due));
      const total = due.reduce((s, t) => s + (Number(t.estimate_mins) || 0), 0);
      const rev = snap.notes.filter(n => live(n) && n.review_later).length;
      const pend = snap.tasks.concat(snap.notes).filter(r => r.deleted_at && r.deleted_by === 'claude').length;
      return {text: `Today is ${today}. ${due.length} task(s) due or overdue${total ? ', about ' + mins(total) : ''}.\n` +
        (due.map(t => taskLine(t, today)).join('\n') || '(nothing due)') +
        `\n\nTomorrow: ${open.filter(t => t.due === plus(today, 1)).length} task(s). No date: ${open.filter(t => !t.due).length}.` +
        `\nNotes to review: ${rev}.${pend ? `\nWaiting for Darren to confirm delete: ${pend}.` : ''}`};
    }
    case 'list_tasks': {
      let list = snap.tasks.filter(t => (a.include_done ? t.done : !t.done) && !(t.deleted_at && t.deleted_by !== 'claude'));
      if (a.category) { const c = needCat(snap, a.category); list = list.filter(t => t.category === c); }
      if (a.search) list = list.filter(t => t.title.toLowerCase().includes(String(a.search).toLowerCase()));
      const w = a.when || 'all';
      if (w === 'overdue') list = list.filter(t => t.due && t.due < today);
      if (w === 'today') list = list.filter(t => t.due && t.due <= today);
      if (w === 'tomorrow') list = list.filter(t => t.due === plus(today, 1));
      if (w === 'week') list = list.filter(t => t.due && t.due <= plus(today, 7));
      if (w === 'no_date') list = list.filter(t => !t.due);
      list.sort((x, y) => (x.due || '9999').localeCompare(y.due || '9999'));
      return {text: list.length ? `${list.length} task(s), today is ${today}:\n` + list.map(t => taskLine(t, today)).join('\n') : 'No tasks match.'};
    }
    case 'add_task': {
      const title = String(a.title || '').trim();
      if (!title) throw new Error('A task needs a title.');
      const t = {id: rid('t'), title, category: needCat(snap, a.category), due: parseDue(a.due, today), estimate_mins: Math.max(0, Math.round(Number(a.estimate_mins) || 0)),
        done: false, done_at: '', created: nowIso(), updated: '', deleted_at: '', deleted_by: ''};
      snap.tasks.push(touch(t));
      return {text: 'Added:\n' + taskLine(t, today), changed: true};
    }
    case 'edit_task': {
      const [kind, t] = getRow(snap, a.id);
      if (kind !== 'tasks') throw new Error(`${a.id} is a note. Use edit_note.`);
      if (a.title != null) { if (!String(a.title).trim()) throw new Error('The title cannot be empty.'); t.title = String(a.title).trim(); }
      if (a.category != null) t.category = needCat(snap, a.category);
      if (a.due != null) t.due = parseDue(a.due, today);
      if (a.estimate_mins != null) t.estimate_mins = Math.max(0, Math.round(Number(a.estimate_mins) || 0));
      touch(t);
      return {text: 'Changed:\n' + taskLine(t, today), changed: true};
    }
    case 'complete_task': {
      const [kind, t] = getRow(snap, a.id);
      if (kind !== 'tasks') throw new Error(`${a.id} is a note, not a task.`);
      t.done = a.done !== false; t.done_at = t.done ? nowIso() : '';
      touch(t);
      return {text: (t.done ? 'Ticked off: ' : 'Reopened: ') + t.title, changed: true};
    }
    case 'list_notes':
    case 'list_review_notes': {
      let list = snap.notes.filter(n => !(n.deleted_at && n.deleted_by !== 'claude'));
      if (name === 'list_review_notes' || a.review_later_only) list = list.filter(n => n.review_later && live(n));
      if (a.category) { const c = needCat(snap, a.category); list = list.filter(n => n.category === c); }
      if (a.search) list = list.filter(n => n.text.toLowerCase().includes(String(a.search).toLowerCase()));
      return {text: list.length ? `${list.length} note(s):\n` + list.map(noteLine).join('\n') : 'No notes match.'};
    }
    case 'add_note': {
      const text = String(a.text || '').trim();
      if (!text) throw new Error('A note needs some text.');
      const n = {id: rid('n'), text, category: needCat(snap, a.category), review_later: !!a.review_later, reviewed: false, created: nowIso(), updated: '', deleted_at: '', deleted_by: ''};
      snap.notes.push(touch(n));
      return {text: 'Added note:\n' + noteLine(n), changed: true};
    }
    case 'edit_note': {
      const [kind, n] = getRow(snap, a.id);
      if (kind !== 'notes') throw new Error(`${a.id} is a task. Use edit_task.`);
      if (a.text != null) { if (!String(a.text).trim()) throw new Error('The note cannot be empty.'); n.text = String(a.text).trim(); }
      if (a.category != null) n.category = needCat(snap, a.category);
      if (a.review_later != null) { n.review_later = !!a.review_later; if (!n.review_later) n.reviewed = true; }
      touch(n);
      return {text: 'Changed:\n' + noteLine(n), changed: true};
    }
    case 'list_categories': {
      const cs = snap.cats.filter(live);
      return {text: cs.length ? cs.map(c => `- ${c.emoji || ''} ${c.name}: ${open.filter(t => t.category === c.name).length} open task(s), ${snap.notes.filter(n => live(n) && n.category === c.name).length} note(s)`).join('\n') : 'No categories yet.'};
    }
    case 'add_category': {
      const nm = String(a.name || '').trim().slice(0, 24);
      if (!nm) throw new Error('A category needs a name.');
      let c = snap.cats.find(x => x.name.toLowerCase() === nm.toLowerCase());
      if (c && live(c)) return {text: `"${c.name}" is already a category.`};
      const colour = /^#[0-9a-f]{6}$/i.test(a.colour || '') ? a.colour : COLOURS[snap.cats.length % COLOURS.length];
      if (c) Object.assign(c, {deleted_at: '', emoji: a.emoji || c.emoji, colour});
      else { c = {name: nm, colour, emoji: a.emoji || '📁', updated: '', deleted_at: ''}; snap.cats.push(c); }
      touch(c);
      return {text: `Added category ${c.emoji} ${c.name}.`, changed: true};
    }
    case 'delete_item': {
      const [, r] = getRow(snap, a.id);
      if (r.deleted_at) return {text: 'That is already waiting to be deleted.'};
      r.deleted_at = nowIso(); r.deleted_by = 'claude'; touch(r);
      return {text: `Marked "${r.title || r.text}" for deletion. Darren will see it crossed out in the app and can confirm or keep it. It goes by itself in 7 days.`, changed: true};
    }
    default: throw new Error('Unknown tool: ' + name);
  }
}
