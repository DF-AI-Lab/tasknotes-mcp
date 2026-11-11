/* TaskNotes, new look (/next/). The Demo 2 skin on the live app's insides:
   ../store.js (data), ../sync.js + ../gsheet.js (Google Sheet), ../passport-lock.js (Passport), ../vault.js (Vault).
   Same storage as the live app, so the same tasks, notes and secrets show here. */
(function () {
  'use strict';
  var S = window.Store, G = window.GSheet, $ = function (id) { return document.getElementById(id); };
  // bump these with every change: VERSION for the app, DEMO_VERSION for the demo
  var VERSION = '2.0', DEMO_VERSION = '20';
  var DEMO = new URLSearchParams(location.search).has('demo');
  var VER_LABEL = DEMO ? 'demo.v.' + DEMO_VERSION : 'v.' + VERSION;
  var SKEY = DEMO ? 'tn_demo_state_v1' : 'tn_state_v1';
  var store = DEMO ? sessionStorage : localStorage;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var today = function () { return new Date(); };
  var todayStr = function () { return S.ymd(today()); };
  var parseDay = function (s) { return new Date(s + 'T12:00:00'); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };
  var fmtMins = S.fmtMins;
  var cloudOn = function () { return !DEMO && (G.on() || Sync.ready()); };
  var still = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };

  /* ---------- state ---------- */
  var st = load();
  if (!st.secrets) st.secrets = [];
  function load() {
    try { var t = store.getItem(SKEY), s = t && JSON.parse(t); if (s && s.v === 1) return s; } catch (e) { /* none yet */ }
    return DEMO ? S.demo(today()) : S.starter();
  }
  var syncTimer = 0;
  function save(noSync) {
    try { store.setItem(SKEY, JSON.stringify(st)); } catch (e) { /* full or private */ }
    if (!noSync) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 1500); }
  }

  /* ---------- reading ---------- */
  var live = function (r) { return S.live(r); };
  var kindOf = function (id) { return String(id || '').charAt(0) === 'n' ? 'notes' : 'tasks'; };
  var findAny = function (id) { return S.find(st, kindOf(id), id); };
  var tasks = function () { return st.tasks.filter(live); };
  var notes = function () { return st.notes.filter(live); };
  var pinned = function (r) { return S.isImportant(st, r); };
  var dayKey = function (r) { return r.due || todayStr(); };
  var nTitle = function (n) { return String(n.text || '').split('\n')[0]; };
  var nBody = function (n) { return String(n.text || '').split('\n').slice(1).join('\n').trim(); };
  var titleOf = function (r) { return r.text != null && r.title == null ? nTitle(r) : r.title; };
  // category colours: the live app keeps strong colours, this look shows them soft
  var SOFT = {'#e0663a': '#ffb072', '#2f6fdf': '#9db4ff', '#7a5af8': '#c9a6ff', '#0f9d76': '#6fe0b5', '#d6409f': '#ff9ec4', '#c99a06': '#f2d675', '#0ea5b7': '#7fdcea', '#64748b': '#aab3c2'};
  var soft = function (hex) { var h = String(hex || '').toLowerCase(); return SOFT[h] || (/^#[0-9a-f]{3,8}$/.test(h) ? 'color-mix(in srgb,' + h + ' 60%,#fff)' : '#8b8d94'); };
  var colOf = function (name) { var c = S.cat(st, name); return soft(c && c.colour); };
  function ordered(list) {
    return list.slice().sort(function (a, b) { return (pinned(b) - pinned(a)) || String(a.created || '').localeCompare(String(b.created || '')); });
  }
  function weekDays() {
    var t = today(), mon = S.addDays(t, -((t.getDay() + 6) % 7)), out = [];
    for (var i = 0; i < 7; i++) out.push(S.addDays(mon, i));
    return out;
  }
  function dueLabel(due) {
    if (!due) return 'no date';
    var t = today(), d = S.ymd(t), tm = S.ymd(S.addDays(t, 1)), wk = S.ymd(S.addDays(t, 7));
    if (due === d) return 'today';
    if (due === tm) return 'tomorrow';
    var dt = parseDay(due);
    if (due > d && due <= wk) return dt.toLocaleDateString('en-GB', {weekday: 'short'});
    return dt.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
  }

  /* ---------- ui state ---------- */
  var screen = 'day', picked = todayStr(), nf = {review: false, cat: ''}, sh = null, toastTimer = 0, toastUndo = null, upd = '', updNote = '';
  try { var ui = JSON.parse(sessionStorage.getItem('tn_ui2') || '{}'); screen = ui.screen || screen; nf = ui.nf || nf; } catch (e) { /* none */ }
  if (screen === 'secrets') screen = 'day';
  var remember = function () { try { sessionStorage.setItem('tn_ui2', JSON.stringify({screen: screen, nf: nf})); } catch (e) { /* none */ } };
  var $scroll = $('scroll'), $sheet = $('sheet'), $scrim = $('scrim'), $toast = $('toast'), $toastMsg = $('toast-msg');

  /* ---------- html bits ---------- */
  var ico = function (id) { return '<svg><use href="#i-' + id + '"/></svg>'; };
  var dotHtml = function (name) { return name ? '<i class="dot" style="background:' + esc(colOf(name)) + '"></i>' : ''; };
  function metaHtml(r, extra) {
    var parts = [];
    if (r.category) parts.push(dotHtml(r.category) + esc(r.category));
    if (extra) parts.push(extra);
    return '<span class="meta">' + parts.join(' · ') + '</span>';
  }
  var pinBtn = function (r) { return '<button class="pin' + (pinned(r) ? ' on' : '') + '" data-act="pin" data-id="' + esc(r.id) + '" aria-label="' + (pinned(r) ? 'Unpin' : 'Pin') + '" aria-pressed="' + pinned(r) + '">' + ico('pin') + '</button>'; };
  var curOpen = null, openPick;
  function bigRow(r) {
    var m = Number(r.estimate_mins) || 0;
    var meta = [r.category ? '<i></i>' + esc(r.category) : '', m ? (m < 60 ? m + ' min' : fmtMins(m)) : ''].filter(Boolean).join('<span style="opacity:.6">·</span>');
    return '<div class="row big" data-fid="r' + esc(r.id) + '" style="--c:' + esc(colOf(r.category)) + '"><div class="big-in"><div class="big-top">' +
      '<button class="bigtick" data-act="tick" data-id="' + esc(r.id) + '" aria-label="Done"><i class="ring"></i>' + ico('tick') + '</button>' +
      '<button class="open" data-act="fold" data-id="' + esc(r.id) + '" aria-expanded="true"><h2>' + esc(r.title) + '</h2>' + (meta ? '<span class="bmeta">' + meta + '</span>' : '') + '</button></div>' +
      (r.details ? '<p style="white-space:pre-line">' + esc(r.details) + '</p>' : '') +
      '<div class="big-foot"><button class="laterbtn" data-act="later" data-id="' + esc(r.id) + '">' + ico('clock') + 'Later</button>' +
      '<span class="acts">' + pinBtn(r) + '<button class="more" data-act="open" data-id="' + esc(r.id) + '" aria-label="Edit">' + ico('dots') + '</button></span></div></div></div>';
  }
  function doneTime(r) {
    var d = new Date(r.done_at || r.updated);
    return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function taskRow(r, extra) {
    if (!r.done && r.id === curOpen) return bigRow(r);
    var end = r.done ? doneTime(r) : fmtMins(r.estimate_mins);
    return '<div class="row' + (r.done ? ' isdone' : '') + '" data-fid="r' + esc(r.id) + '"><button class="tickbtn" data-act="tick" data-id="' + esc(r.id) + '" aria-label="' + (r.done ? 'Undo' : 'Done') + '"><span class="tick' + (r.done ? ' on' : '') + '">' + (r.done ? ico('tick') : '') + '</span></button>' +
      '<button class="open" data-act="' + (r.done ? 'open' : 'expand') + '" data-id="' + esc(r.id) + '"' + (r.done ? '' : ' aria-expanded="false"') + '><span class="main"><b><span class="ttl">' + esc(r.title) + '</span></b>' + metaHtml(r, extra) + '</span><span class="end">' + esc(end) + '</span></button>' +
      (r.done ? '' : pinBtn(r) + '<button class="more" data-act="open" data-id="' + esc(r.id) + '" aria-label="Edit">' + ico('dots') + '</button>') + '</div>';
  }
  var noteOpen = null;
  function bigNote(r) {
    var body = nBody(r);
    return '<div class="row big bignote" data-fid="r' + esc(r.id) + '" style="--c:' + esc(colOf(r.category)) + '"><div class="big-in"><div class="big-top">' +
      '<span class="bigtick noteglyph" aria-hidden="true">' + ico('note') + '</span>' +
      '<button class="open" data-act="nfold" data-id="' + esc(r.id) + '" aria-expanded="true"><h2>' + esc(nTitle(r)) + '</h2>' + (r.category ? '<span class="bmeta"><i></i>' + esc(r.category) + '</span>' : '') + '</button></div>' +
      (body ? '<p style="white-space:pre-line">' + esc(body) + '</p>' : '') +
      '<div class="big-foot"><button class="laterbtn' + (r.review_later ? ' on' : '') + '" data-act="rlater" data-id="' + esc(r.id) + '" aria-pressed="' + !!r.review_later + '">' + ico('flag') + 'Review later</button>' +
      '<span class="acts">' + pinBtn(r) + '<button class="more" data-act="open" data-id="' + esc(r.id) + '" aria-label="Edit">' + ico('dots') + '</button></span></div></div></div>';
  }
  function noteRow(r) {
    if (r.id === noteOpen) return bigNote(r);
    var first = nBody(r).split('\n')[0];
    return '<div class="row note" data-fid="r' + esc(r.id) + '"><span class="glyph">' + ico(r.review_later ? 'flag' : 'note') + '</span><button class="open" data-act="nexpand" data-id="' + esc(r.id) + '" aria-expanded="false"><span class="main"><b>' + esc(nTitle(r)) + '</b>' +
      '<span class="meta">' + esc(first || r.category) + '</span></span></button>' +
      '<button class="more" data-act="open" data-id="' + esc(r.id) + '" aria-label="Edit">' + ico('dots') + '</button></div>';
  }
  var panel = function (rows) { return '<div class="panel">' + rows.join('') + '</div>'; };
  var label = function (text, icon) { return '<div class="label">' + (icon ? ico(icon) : '') + esc(text) + '</div>'; };
  function syncState() {
    if (DEMO) return 'ok';
    if (!cloudOn()) return 'off';
    if (syncing) return 'spin';
    if (syncErr) return 'err';
    return S.outboxCount(st) ? 'wait' : 'ok';
  }
  function head(title, day) {
    var ss = syncState(), lbl = upd ? 'Update ready, tap to update' : ss === 'off' ? 'Cloud sync is off' : ss === 'err' ? 'Sync problem: ' + syncErr : 'Sync now';
    var h = '<header class="head"><div class="head-row"><button class="icon-wrap s-' + ss + (upd ? ' warn' : '') + (ss === 'spin' ? ' spin' : '') + '" data-act="refresh" aria-label="' + esc(lbl) + '"><svg class="app-icon" aria-hidden="true"><use href="#tn"/></svg><i class="status"></i></button><div class="head-text">';
    h += '<div class="eyebrow">' + (upd ? '<i class="dot"></i>New version ready' : esc(day ? day.month : today().toLocaleDateString('en-GB', {month: 'long'})) + '<span class="clock" data-clock></span>') + '</div>';
    h += '<h1 class="title">' + esc(title) + '</h1></div>';
    if (day) {
      var C = 135.1, dash = (day.total ? C * day.done / day.total : 0).toFixed(1) + ' ' + C;
      h += '<div class="ring" role="img" aria-label="' + day.done + ' of ' + day.total + ' done"><svg viewBox="0 0 46 46" aria-hidden="true"><circle class="fill" cx="23" cy="23" r="21.5" stroke-dasharray="' + dash + '"/></svg>' + day.done + '/' + day.total + '</div>';
    }
    h += '<button class="icon-btn plain" data-act="settings" aria-label="Settings">' + ico('dots') + '</button></div>';
    if (upd) h += '<button class="update-banner" data-act="update" aria-label="Update ready, tap to update">Update ready <span>Tap to update ›</span></button>';
    var dayMins = Number(st.settings.dayMins) || 360;
    var pct = day && day.mins ? Math.max(4, Math.min(100, Math.round(day.mins / dayMins * 100))) : 0;
    h += '<div class="fullbar" role="img" aria-label="' + (day ? 'Day ' + pct + '% full' : '') + '"><i style="width:' + pct + '%"></i></div>';
    return h + '</header>';
  }

  /* ---------- screens ---------- */
  function pendingHtml() {
    var p = st.tasks.filter(S.pendingDelete).map(function (r) { return ['tasks', r]; }).concat(st.notes.filter(S.pendingDelete).map(function (r) { return ['notes', r]; }));
    if (!p.length) return '';
    return label('Claude wants to delete') + panel(p.map(function (x) {
      return '<div class="row pend"><span class="main"><b>' + esc(titleOf(x[1])) + '</b><span class="meta">' + (x[0] === 'tasks' ? 'Task' : 'Note') + '</span></span>' +
        '<button class="mini" data-act="undel" data-id="' + esc(x[1].id) + '">Keep</button><button class="mini bad" data-act="okdel" data-id="' + esc(x[1].id) + '">Delete</button></div>';
    }));
  }
  function dayScreen() {
    var t = today(), ts = todayStr(), isToday = picked === ts, all = tasks();
    var dayTasks = all.filter(function (r) { return dayKey(r) === picked; });
    var left = dayTasks.filter(function (r) { return !r.done; });
    var total = dayTasks.length, done = total - left.length;
    var pd = parseDay(picked);
    var h = head(pd.toLocaleDateString('en-GB', {weekday: 'short'}) + ' ' + pd.getDate(), {month: pd.toLocaleDateString('en-GB', {month: 'long'}), done: done, total: total,
      mins: left.reduce(function (a, r) { return a + (Number(r.estimate_mins) || 0); }, 0)});
    var strip = '<nav class="week" aria-label="This week">' + weekDays().map(function (d) {
      var k = S.ymd(d), letter = d.toLocaleDateString('en-GB', {weekday: 'narrow'}).charAt(0);
      var any = all.some(function (r) { return !r.done && dayKey(r) === k; });
      return '<button class="day' + (k === picked ? ' on' : '') + (any ? ' has' : '') + '" data-act="day" data-v="' + k + '"' + (k === ts ? ' aria-current="date"' : '') + ' aria-label="' + esc(d.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'})) + '">' +
        letter + '<b>' + d.getDate() + '</b></button>';
    }).join('') + '<i class="dayhl" aria-hidden="true"></i></nav>';
    var out = [h, strip], pend = pendingHtml();
    if (pend) out.push(pend);
    var openable = function (id) { var r = id && S.find(st, 'tasks', id); return r && !r.done && live(r); };
    curOpen = openPick === null ? null : openable(openPick) ? openPick : (isToday && ordered(left)[0] ? ordered(left)[0].id : null);
    if (isToday && !left.length) out.push('<p class="quiet">' + (total ? 'All done for today' : 'Nothing planned today') + '</p>');
    if (isToday) {
      var late = all.filter(function (r) { return !r.done && r.due && r.due < ts && !pinned(r); }).sort(function (a, b) { return a.due.localeCompare(b.due); });
      if (late.length) {
        out.push(label('Late'));
        out.push(panel(late.map(function (r) { return taskRow(r, '<span class="late">' + esc(parseDay(r.due).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'})) + '</span>'); })));
      }
    }
    var pinT = all.filter(function (r) { return pinned(r) && !r.done && dayKey(r) !== picked; }).sort(function (a, b) { return dayKey(a).localeCompare(dayKey(b)); });
    var pinN = notes().filter(pinned);
    if (pinT.length || pinN.length) {
      out.push(label('Pinned', 'pin'));
      out.push(panel(pinT.map(function (r) { return taskRow(r, '<span class="' + (r.due && r.due < ts ? 'late' : '') + '">' + esc(cap(dueLabel(dayKey(r)))) + '</span>'); }).concat(pinN.map(noteRow))));
    }
    var then = ordered(left).concat(dayTasks.filter(function (r) { return r.done; }).sort(function (a, b) { return (a.done_at || '').localeCompare(b.done_at || ''); }));
    if (then.length) { out.push(label(isToday ? 'Today' : 'Tasks')); out.push(panel(then.map(function (r) { return taskRow(r); }))); }
    else if (!isToday) out.push('<p class="quiet">Nothing planned</p>');
    return out.join('');
  }
  var nq = '', nsOpen = false;
  function notesList() {
    var q = nq.trim().toLowerCase();
    var list = notes().filter(function (r) { return (!nf.review || r.review_later) && (!nf.cat || r.category === nf.cat) && (!q || (r.text + ' ' + (r.category || '')).toLowerCase().indexOf(q) > -1); });
    var out = [], pin = list.filter(pinned), rest = list.filter(function (r) { return !pinned(r); });
    if (pin.length) { out.push(label('Pinned', 'pin')); out.push(panel(pin.map(noteRow))); }
    if (rest.length) { out.push(label(nf.review ? 'Review later' : pin.length ? 'Notes' : 'All notes')); out.push(panel(rest.map(noteRow))); }
    if (!list.length) out.push('<p class="quiet">' + (q ? 'Nothing matches' : nf.review ? 'All reviewed' : 'No notes here') + '</p>');
    return out.join('');
  }
  function notesScreen() {
    var cats = S.cats(st), chips;
    if (nf.cat && !S.cat(st, nf.cat)) nf.cat = '';
    var revN = notes().filter(function (n) { return n.review_later; }).length;
    if (nsOpen) chips = '<div class="filterbar"><label class="vsearch wide">' + ico('search') + '<input id="nq" type="search" placeholder="Search notes" aria-label="Search notes" value="' + esc(nq) + '" autocomplete="off"></label><button class="nsbtn" data-act="nsclose" aria-label="Close search">' + ico('x') + '</button></div>';
    else chips = '<div class="filterbar" role="toolbar" aria-label="Filter notes"><button class="chip allchip' + (!nf.review && !nf.cat ? ' on' : '') + '" data-act="nfall" aria-pressed="' + (!nf.review && !nf.cat) + '">All</button><div class="chips filters"><button class="chip' + (nf.review ? ' on' : '') + '" data-act="nfreview" aria-pressed="' + nf.review + '" aria-label="Review later" title="Review later">' + ico('flag') + (revN ? '<span class="cnt">' + revN + '</span>' : '') + '</button>' +
      cats.map(function (c) { return '<button class="chip' + (nf.cat === c.name ? ' on' : '') + '" data-act="nfcat" data-v="' + esc(c.name) + '" aria-pressed="' + (nf.cat === c.name) + '"><i class="dot" style="background:' + esc(soft(c.colour)) + '"></i>' + esc(c.name) + '</button>'; }).join('') + '</div><button class="nsbtn" data-act="nsopen" aria-label="Search notes">' + ico('search') + '</button></div>';
    return head('Notes') + chips + '<div id="nlist">' + notesList() + '</div>';
  }
  function doneScreen() {
    var list = tasks().filter(function (r) { return r.done; }).sort(function (a, b) { return (b.done_at || '').localeCompare(a.done_at || ''); });
    var out = [head('Done')], groups = [], map = {};
    list.forEach(function (r) { var k = S.ymd(new Date(r.done_at || r.updated)); if (!map[k]) { map[k] = {k: k, rows: []}; groups.push(map[k]); } map[k].rows.push(r); });
    var ts = todayStr(), ys = S.ymd(S.addDays(today(), -1));
    groups.forEach(function (g) {
      out.push(label(g.k === ts ? 'Today' : g.k === ys ? 'Yesterday' : parseDay(g.k).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'})));
      out.push(panel(g.rows.map(function (r) { return taskRow(r); })));
    });
    if (!list.length) out.push('<p class="quiet">Nothing ticked off yet</p>');
    else if (list.length <= 5) out.push('<p class="quiet">Nice work.</p>');
    return out.join('');
  }

  /* ---------- vault (secrets) ---------- */
  // Locked by default. Your passport passcode opens it every time; the key and the readable list live only in memory.
  // It locks again after 1 minute without a tap, when you leave the tab, or when the app goes to the background.
  var vault = {key: null, items: [], at: 0, busy: false, pin: ''};
  var vf = 'secrets', vaultOpen = null, vShow = false, vq = '';
  var liveSecrets = function () { return st.secrets.filter(live); };
  function lockVault(quiet) {
    if (!vault.key && !vault.items.length) return;
    vault.key = null; vault.items = []; vaultOpen = null; vShow = false;
    if ($sheet.classList.contains('show') && $sheet.getAttribute('aria-label') === 'Secret') closeSheet();
    if (!quiet && screen === 'secrets' && !$('app').hidden) render();
  }
  async function refreshVault(quiet) {
    if (!vault.key) return;
    var key = vault.key;
    var items = await Promise.all(liveSecrets().map(async function (r) {
      var o = await Vault.open(key, r.data);
      return Object.assign({id: r.id, created: r.created, bad: !o}, o || {title: "Can't open on this phone", text: ''});
    }));
    if (vault.key !== key) return;
    vault.items = items.sort(function (a, z) { return a.title.localeCompare(z.title, 'en-GB', {sensitivity: 'base'}); });
    if (screen === 'secrets' && (!quiet || !$sheet.classList.contains('show'))) render();
  }
  function vaultList() {
    if (vf === 'docs') return '<p class="quiet">Documents are coming soon.<br>They need space in your Google Drive, so they come next.</p>';
    var q = vq.trim().toLowerCase();
    var l = vault.items.filter(function (r) { return !q || (r.title + ' ' + (r.kind || '')).toLowerCase().indexOf(q) > -1; });
    if (!vault.items.length) return '<p class="quiet">Nothing here yet. Tap + to add a secret.</p>';
    return l.length ? panel(l.map(vaultRow)) : '<p class="quiet">Nothing matches</p>';
  }
  function vaultRow(r) {
    var meta = r.bad ? 'Made on another phone' : (r.kind || 'Password');
    if (r.id === vaultOpen && !r.bad) {
      return '<div class="row big bignote" data-fid="' + esc(r.id) + '" style="--c:#9db4ff"><div class="big-in"><div class="big-top">' +
        '<span class="bigtick noteglyph" aria-hidden="true">' + ico('lock') + '</span>' +
        '<button class="open" data-act="vfold" aria-expanded="true"><h2>' + esc(r.title) + '</h2><span class="bmeta"><i></i>' + esc(meta) + '</span></button></div>' +
        '<p class="vval">' + (vShow ? esc(r.text) : '••••••••') + '</p>' +
        '<div class="big-foot"><button class="laterbtn' + (vShow ? ' on' : '') + '" data-act="vshow" aria-pressed="' + vShow + '">' + ico('eye') + (vShow ? 'Hide' : 'Show') + '</button>' +
        '<span class="acts"><button class="more" data-act="vcopy" data-id="' + esc(r.id) + '" aria-label="Copy">' + ico('copy') + '</button>' +
        '<button class="more" data-act="vdots" data-id="' + esc(r.id) + '" aria-label="Edit">' + ico('dots') + '</button></span></div></div></div>';
    }
    return '<div class="row note' + (r.bad ? ' bad' : '') + '" data-fid="' + esc(r.id) + '"><span class="glyph">' + ico('lock') + '</span><button class="open" data-act="' + (r.bad ? 'vdots' : 'vexpand') + '" data-id="' + esc(r.id) + '" aria-expanded="false"><span class="main"><b>' + esc(r.title) + '</b>' +
      '<span class="meta">' + esc(meta) + '</span></span></button><button class="more" data-act="vdots" data-id="' + esc(r.id) + '" aria-label="Edit">' + ico('dots') + '</button></div>';
  }
  function secretsScreen() {
    if (!vault.key) {
      var n = liveSecrets().length;
      return head('Vault') + '<div class="vlocked"><span class="vlk">' + ico('lock') + '</span><b>' + n + ' secret' + (n === 1 ? '' : 's') + ' locked away</b>' +
        '<small id="vmsg">' + (DEMO ? 'Demo passcode: ' + Vault.DEMO_PIN : 'Type your passcode to open') + '</small>' +
        '<div class="pdots" id="pdots">' + '<i></i><i></i><i></i><i></i><i></i><i></i>' + '</div>' +
        '<div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(function (k) {
          return k ? '<button data-act="vkey" data-v="' + k + '" aria-label="' + (k === 'del' ? 'Delete' : k) + '">' + (k === 'del' ? ico('del') : k) + '</button>' : '<span></span>';
        }).join('') + '</div></div>';
    }
    var bar = '<div class="filterbar vbar" role="tablist" aria-label="Vault"><div class="chips filters">' +
      [['secrets', 'Secrets'], ['docs', 'Documents']].map(function (t) { return '<button class="chip' + (vf === t[0] ? ' on' : '') + '" role="tab" data-act="vtab" data-v="' + t[0] + '" aria-selected="' + (vf === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div><label class="vsearch">' + ico('search') + '<input id="vq" type="search" placeholder="Search" aria-label="Search the vault" value="' + esc(vq) + '" autocomplete="off"></label></div>';
    return head('Vault') + bar + '<div id="vlist">' + vaultList() + '</div>' +
      '<button class="link" data-act="vlock">' + ico('lock') + 'Lock now</button><p class="foot">Scrambled before it leaves the phone. The Sheet and Claude only see gibberish. Locks after 1 minute.</p>';
  }
  function drawDots(shake) {
    var d = $('pdots'); if (!d) return;
    Array.prototype.forEach.call(d.children, function (x, i) { x.classList.toggle('on', i < vault.pin.length); });
    if (shake) { d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); }
  }
  async function vaultKey(k) {
    if (vault.busy || vault.key) return;
    if (k === 'del') { vault.pin = vault.pin.slice(0, -1); drawDots(); return; }
    if (vault.pin.length >= 6) return;
    vault.pin += k; drawDots();
    if (vault.pin.length < 6) return;
    vault.busy = true;
    try {
      var pin = vault.pin;
      var r = DEMO ? (pin === Vault.DEMO_PIN ? {key: await Vault.demoKey()} : {err: 'Wrong passcode. The demo one is ' + Vault.DEMO_PIN + '.'}) : await window.LockUI.vault(pin);
      vault.pin = '';
      if (r.key) { vault.key = r.key; vault.at = Date.now(); vaultOpen = null; vShow = false; await refreshVault(); return; }
      drawDots(true);
      var m = $('vmsg'); if (m) { m.textContent = r.err; m.classList.add('err'); }
    } finally { vault.busy = false; }
  }
  document.addEventListener('keydown', function (e) {
    if (screen !== 'secrets' || vault.key || !$('pdots') || $sheet.classList.contains('show') || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (/^[0-9]$/.test(e.key)) vaultKey(e.key); else if (e.key === 'Backspace') vaultKey('del');
  });
  ['pointerdown', 'keydown', 'input'].forEach(function (ev) { document.addEventListener(ev, function () { if (vault.key) vault.at = Date.now(); }, true); });
  setInterval(function () { if (vault.key && Date.now() - vault.at > Vault.IDLE_MS) lockVault(); }, 5000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') lockVault(); });
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* no */ } t.remove(); return ok;
    }
  }
  function secretSheet(id) {
    if (!vault.key) return;
    var it = id ? vault.items.find(function (x) { return x.id === id; }) : {title: '', text: '', kind: 'Password'};
    if (!it) return;
    if (it.bad) {
      confirmSheet('Delete this secret?', 'It was made on another phone, so this phone cannot open it.', 'Delete', function () { S.remove(st, 'secrets', id, 'you'); save(); refreshVault(); }, true);
      return;
    }
    sh = null; $sheet.setAttribute('aria-label', 'Secret');
    var kind = it.kind || 'Password';
    $sheet.innerHTML = '<div class="grab" aria-hidden="true"></div>' +
      '<input class="tline" id="v-name" placeholder="What is it for?" autocomplete="off" maxlength="60" aria-label="Name" value="' + esc(it.title) + '">' +
      '<div class="chips pills3">' + ['Password', 'PIN', 'Code'].map(function (t) { return '<button class="chip' + (t === kind ? ' on' : '') + '" data-act="vtype" data-v="' + t + '">' + t + '</button>'; }).join('') + '</div>' +
      '<label class="vsearch wide vsec">' + ico('lock') + '<input id="v-val" type="' + (id ? 'text' : 'password') + '" placeholder="The secret" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="The secret" value="' + esc(it.text) + '">' +
      '<button class="vpeek" data-act="vpeek" aria-label="Show or hide">' + ico('eye') + '</button></label>' +
      '<div class="sbar"><button class="btn primary" data-act="vsave" data-id="' + esc(id || '') + '">Save</button>' + (id ? '<button class="ib del" data-act="vdel" data-id="' + esc(id) + '" aria-label="Delete">' + ico('trash') + '</button>' : '') + '</div>';
    showSheet();
    if (!id) setTimeout(function () { var t = $('v-name'); if (t) t.focus(); }, 230);
  }
  async function saveSecret(id) {
    var title = $('v-name').value.trim(), text = $('v-val').value, ty = $sheet.querySelector('[data-act="vtype"].on');
    if (!title) { $('v-name').focus(); return; }
    if (!vault.key) { closeSheet(); return; }
    var data = await Vault.seal(vault.key, {title: title, text: text, kind: ty ? ty.getAttribute('data-v') : 'Password'});
    if (id) S.edit(st, 'secrets', id, {data: data}); else S.addSecret(st, data);
    save(); closeSheet(); await refreshVault(); toast('Saved and scrambled');
  }
  // demo: two made-up secrets, scrambled with the demo key
  if (DEMO && !st.secrets.length) {
    Vault.demoKey().then(async function (k) {
      var list = [{title: 'Bike lock', text: '4 7 1 9', kind: 'Code'}, {title: "Wi-Fi at mum's", text: 'blue-kettle-42', kind: 'Password'}, {title: 'Bank app', text: '582913', kind: 'PIN'}];
      for (var i = 0; i < list.length; i++) S.addSecret(st, await Vault.seal(k, list[i]));
      st.dirty = {}; save(true); if (screen === 'secrets') render();
    });
  }

  /* ---------- layout bits ---------- */
  function checkDown() {
    var d = $('down'); if (!d) return;
    var more = $scroll.scrollHeight - $scroll.scrollTop - $scroll.clientHeight > 130;
    d.classList.toggle('show', more); d.tabIndex = more ? 0 : -1;
  }
  function placeHl() { var hl = $scroll.querySelector('.dayhl'), on = $scroll.querySelector('.day.on'); if (!hl) return; if (!on) { hl.style.width = '0'; return; } hl.style.left = on.offsetLeft + 'px'; hl.style.width = on.offsetWidth + 'px'; }
  var dayBusy = false, pendDay = null;
  function changeDay(v) {
    if (dayBusy) { pendDay = v; return; }
    if (v === picked) return;
    var old = picked, dir = v > picked ? 1 : -1, reduce = still();
    var hl = $scroll.querySelector('.dayhl'), from = hl ? hl.offsetLeft : 0;
    var body = function () { return Array.prototype.filter.call($scroll.children, function (c) { return !c.classList.contains('week'); }); };
    var go = function () {
      picked = v; openPick = undefined; var top = $scroll.scrollTop; render(); $scroll.scrollTop = top;
      if (reduce || !document.body.animate) { dayBusy = false; return; }
      var nh = $scroll.querySelector('.dayhl');
      if (nh) nh.animate([{transform: 'translateX(' + (from - nh.offsetLeft) + 'px)'}, {transform: 'none'}], {duration: 320, easing: 'cubic-bezier(.3,1.3,.5,1)'});
      var nb = $scroll.querySelector('.day.on'), ob = $scroll.querySelector('.day[data-v="' + old + '"]');
      [[nb, 'var(--text)', 'var(--muted)', 1], [ob, 'var(--on-accent)', '#55575e', 0]].forEach(function (x) {
        if (!x[0]) return; var bb = x[0].querySelector('b');
        if (bb) bb.animate([{color: x[1]}, {}], {duration: 240, easing: 'ease-out'});
        x[0].animate([{color: x[3] ? x[2] : '#55575e'}, {}], {duration: 240, easing: 'ease-out'});
      });
      body().forEach(function (c, i) { c.animate([{opacity: 0, transform: 'translateX(' + (dir * 22) + 'px)'}, {opacity: 1, transform: 'none'}], {duration: 260, delay: i * 25, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards'}); });
      var t = document.querySelector('#top .title'); if (t) t.animate([{opacity: .3}, {opacity: 1}], {duration: 220});
      dayBusy = false;
      if (pendDay) { var n = pendDay; pendDay = null; changeDay(n); }
    };
    if (reduce || !document.body.animate) { go(); return; }
    dayBusy = true;
    var outs = body().map(function (c) { return c.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateX(' + (-dir * 14) + 'px)'}], {duration: 110, easing: 'ease-in', fill: 'forwards'}); });
    if (outs.length) outs[0].onfinish = go; else go();
  }
  function render() {
    var html = screen === 'day' ? dayScreen() : screen === 'notes' ? notesScreen() : screen === 'done' ? doneScreen() : secretsScreen();
    $scroll.innerHTML = html;
    var hd = $scroll.querySelector('.head'), $top = $('top');
    $top.innerHTML = ''; if (hd) $top.appendChild(hd);
    tickClock(); checkDown(); placeHl();
    if (screen === 'secrets' && !vault.key) drawDots();
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      var on = b.getAttribute('data-v') === screen; b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    remember();
  }

  /* ---------- tab change (header stays put, content nudges) ---------- */
  var ORDER = ['day', 'notes', 'done', 'secrets'], navBusy = false, navTo = '';
  function goTab(v) {
    var prev = screen;
    if (prev === 'secrets' && v !== 'secrets') { lockVault(true); vq = ''; }
    if (navBusy) { navTo = v; return; }
    if (v === prev || still() || !document.body.animate) { screen = v; $scroll.scrollTop = 0; render(); return; }
    var dir = ORDER.indexOf(v) > ORDER.indexOf(prev) ? 1 : -1, E = 'cubic-bezier(.2,.7,.2,1)';
    var body = function () { return Array.prototype.filter.call($scroll.children, function (c) { return !c.classList.contains('head'); }); };
    navBusy = true; navTo = v;
    body().forEach(function (c) { c.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'translateX(' + (-12 * dir) + 'px)'}], {duration: 90, easing: 'ease-in', fill: 'forwards'}); });
    setTimeout(function () {
      screen = navTo; $scroll.scrollTop = 0; render();
      body().forEach(function (c) { c.animate([{opacity: 0, transform: 'translateX(' + (16 * dir) + 'px)'}, {opacity: 1, transform: 'none'}], {duration: 180, easing: E}); });
      setTimeout(function () { navBusy = false; }, 180);
    }, 90);
  }

  /* ---------- clock ---------- */
  function tickClock() {
    var c = document.querySelector('[data-clock]'); if (!c) return;
    var n = new Date(), tm = pad(n.getHours()) + ':' + pad(n.getMinutes());
    c.textContent = '· ' + n.toLocaleDateString('en-GB', {weekday: 'short'}) + ' ' + n.getDate() + ' · ' + tm;
    if (c.parentNode.scrollWidth > c.parentNode.clientWidth) c.textContent = '· ' + tm;
  }
  setInterval(tickClock, 15000);

  /* ---------- toast ---------- */
  function toast(msg, undo, ms) {
    clearTimeout(toastTimer); toastUndo = undo || null;
    $toastMsg.textContent = msg;
    $('toast-undo').style.display = undo ? '' : 'none';
    $toast.classList.add('show');
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); toastUndo = null; }, ms || 4000);
  }
  function hideToast() { clearTimeout(toastTimer); $toast.classList.remove('show'); toastUndo = null; }

  /* ---------- actions ---------- */
  function mutate(fn) { fn(); save(); render(); }
  // FLIP: note where rows are, re-render, then spring each row from its old spot to its new one
  function flip(fn, liftId) {
    if (still() || !Element.prototype.animate) { fn(); return; }
    var before = {};
    Array.prototype.forEach.call($scroll.querySelectorAll('[data-fid]'), function (el) { var q = el.getBoundingClientRect(); before[el.getAttribute('data-fid')] = {t: q.top, h: q.height, big: el.classList.contains('big')}; });
    fn();
    Array.prototype.forEach.call($scroll.querySelectorAll('[data-fid]'), function (el) {
      var id = el.getAttribute('data-fid'), o = before[id];
      if (o == null) { el.animate([{opacity: 0, transform: 'scale(.97)'}, {opacity: 1, transform: 'none'}], {duration: 320, easing: 'ease-out'}); return; }
      var q = el.getBoundingClientRect(), dy = o.t - q.top, lift = id === liftId, big = el.classList.contains('big');
      if (Math.abs(q.height - o.h) > 2 || big !== o.big) {
        el.style.overflow = 'hidden';
        var a2 = el.animate([{transform: 'translateY(' + dy + 'px)', height: o.h + 'px'}, {transform: 'none', height: q.height + 'px'}], {duration: 480, easing: 'cubic-bezier(.32,1.15,.5,1)'});
        a2.onfinish = function () { el.style.overflow = ''; };
        var inner = el.querySelector(big ? '.big-in' : '.open');
        if (inner) inner.animate([{opacity: 0}, {opacity: 0, offset: big ? .25 : .1}, {opacity: 1}], {duration: big ? 420 : 300, easing: 'ease-out'});
        return;
      }
      if (Math.abs(dy) < 1 && !lift) return;
      if (lift) el.classList.add('lift');
      var a = el.animate(lift ? [{transform: 'translateY(' + dy + 'px) scale(1.03)'}, {transform: 'scale(1.03)', offset: .7}, {transform: 'none'}]
        : [{transform: 'translateY(' + dy + 'px)'}, {transform: 'none'}], {duration: lift ? 700 : 550, easing: 'cubic-bezier(.34,1.4,.5,1)'});
      if (lift) a.onfinish = function () { el.classList.remove('lift'); };
    });
  }
  var tickBusy = false;
  function tick(id) {
    var r = S.find(st, 'tasks', id); if (!r || tickBusy) return;
    var was = r.done, el = $scroll.querySelector('[data-fid="r' + id + '"]');
    var go = function () {
      tickBusy = false;
      flip(function () { mutate(function () { S.tick(st, id, !was); }); }, 'r' + id);
      toast(was ? 'Moved back to your list' : 'Done: ' + r.title, function () { flip(function () { mutate(function () { S.tick(st, id, was); }); }, 'r' + id); });
    };
    if (!was && el && !still()) {
      tickBusy = true;
      el.classList.add('ticking');
      var t = el.querySelector('.tick'); if (t) t.innerHTML = ico('tick');
      setTimeout(go, 260);
    } else go();
  }
  function later(id) {
    var r = S.find(st, 'tasks', id); if (!r) return;
    var old = r.due;
    mutate(function () { S.edit(st, 'tasks', id, {due: S.ymd(S.addDays(today(), 1))}); });
    toast('Moved to tomorrow', function () { mutate(function () { S.edit(st, 'tasks', id, {due: old}); }); });
  }
  function togglePin(id) {
    var r = findAny(id); if (!r) return;
    flip(function () { mutate(function () { S.star(st, kindOf(id), id); }); }, 'r' + id);
    var p = $scroll.querySelector('[data-fid="r' + id + '"] .pin'); if (p) p.classList.add('pop');
  }

  /* ---------- the edit sheet (tasks + notes) ---------- */
  function showSheet() { $scrim.classList.add('show'); $sheet.classList.add('show'); }
  function closeSheet() { sh = null; $scrim.classList.remove('show'); $sheet.classList.remove('show'); if (document.activeElement) document.activeElement.blur(); }
  function openSheet(id) {
    var r = id && findAny(id), k = id ? kindOf(id) : (screen === 'notes' ? 'notes' : 'tasks');
    var f;
    if (r && k === 'tasks') f = {title: r.title, details: r.details || '', category: r.category, due: r.due || '', mins: Number(r.estimate_mins) || 0, star: pinned(r), review: false};
    else if (r) f = {title: nTitle(r), details: nBody(r), category: r.category, due: '', mins: 0, star: pinned(r), review: !!r.review_later};
    else f = {title: '', details: '', category: screen === 'notes' && nf.cat ? nf.cat : '', due: k === 'tasks' ? picked : '', mins: 0, star: false, review: screen === 'notes' && nf.review};
    sh = {id: id || null, kind0: k, kind: k, open: null, f: f};
    renderSheet(); showSheet();
    if (!r) setTimeout(function () { var t = $('f-title'); if (t) t.focus(); }, 230);
  }
  var isTaskSheet = function () { return sh.kind === 'tasks'; };
  function pillsHtml() {
    var f = sh.f, o = sh.open, task = isTaskSheet();
    var p = function (key, on, inner) { return '<button class="chip' + (on ? ' on' : '') + (o === key ? ' open' : '') + '" data-act="pill" data-v="' + key + '">' + inner + '</button>'; };
    return p('cat', !!f.category, f.category ? dotHtml(f.category) + esc(f.category) : 'Category') +
      p('date', task && !!f.due, task && f.due ? esc(cap(dueLabel(f.due))) : 'Date') +
      p('time', task && !!f.mins, task && f.mins ? esc(fmtMins(f.mins)) : 'Time');
  }
  function drawerHtml() {
    var f = sh.f, o = sh.open, c = function (act, v, on, inner) { return '<button class="chip' + (on ? ' on' : '') + '" data-act="' + act + '" data-v="' + esc(v) + '">' + inner + '</button>'; };
    if (o === 'cat') return '<div class="chips">' + S.cats(st).map(function (k) { return c('setcat', k.name, k.name === f.category, '<i class="dot" style="background:' + esc(soft(k.colour)) + '"></i>' + esc(k.name)); }).join('') +
      (sh.newcat ? '<input class="dt newcat" id="f-newcat" placeholder="New category" maxlength="24" autocomplete="off" aria-label="New category name">' : '<button class="chip addcat" data-act="newcat" aria-label="Add category">' + ico('plus') + '</button>') + '</div>';
    if (o === 'date') {
      var ts = todayStr(), tm = S.ymd(S.addDays(today(), 1)), nw = S.ymd(S.addDays(today(), 7)), task = isTaskSheet();
      return '<div class="chips">' + c('setdate', ts, task && f.due === ts, 'Today') + c('setdate', tm, task && f.due === tm, 'Tomorrow') + c('setdate', nw, task && f.due === nw, 'Next week') +
        '<input class="dt" type="date" id="f-date" value="' + esc(task ? f.due : '') + '" aria-label="Pick a date">' + c('setdate', '', task && !f.due, 'No date') + '</div>';
    }
    if (o === 'time') return '<div class="chips">' + [5, 10, 15, 20, 30, 45, 60, 90, 120].map(function (m) { return c('setmins', m, isTaskSheet() && f.mins === m, fmtMins(m)); }).join('') + c('setmins', 0, !f.mins, 'No time') + '</div>';
    return '';
  }
  function renderSheet() {
    var f = sh.f;
    $sheet.setAttribute('aria-label', 'Item');
    $sheet.innerHTML = '<div class="grab" aria-hidden="true"></div><span class="sr" id="sh-label">' + headText() + '</span>' +
      '<input class="tline" id="f-title" data-f="title" placeholder="' + (isTaskSheet() ? 'What needs doing?' : 'What is it?') + '" autocomplete="off" maxlength="160" value="' + esc(f.title) + '" aria-label="Title">' +
      '<div class="chips pills3" id="pills">' + pillsHtml() + '</div>' +
      '<div class="sbody' + (sh.open ? ' open' : '') + '" id="sbody"><textarea class="nline" id="f-details" data-f="details" placeholder="Notes" rows="4" aria-label="Notes">' + esc(f.details) + '</textarea>' +
      '<div class="drawer" id="drawer">' + drawerHtml() + '</div></div>' +
      '<div class="sbar" id="sbar">' + sbarHtml() + '<button class="btn primary" data-act="save" id="save"' + (f.title.trim() ? '' : ' disabled') + '>Save</button>' + (sh.id ? '<button class="ib del" data-act="delete" aria-label="Delete">' + ico('trash') + '</button>' : '') + '</div>';
  }
  function headText() { return (sh.id ? 'Edit ' : 'New ') + (isTaskSheet() ? 'task' : 'note'); }
  function sbarHtml() {
    var f = sh.f, ib = function (act, on, icon, lbl) { return '<button class="ib' + (on ? ' on' : '') + '" data-act="' + act + '" aria-label="' + lbl + '" aria-pressed="' + on + '">' + ico(icon) + '</button>'; };
    return ib('spin', f.star, 'pin', 'Pin to top') + ib('needs', isTaskSheet(), 'circle', 'Needs doing (a task)') + (isTaskSheet() ? '' : ib('review', f.review, 'flag', 'Review later'));
  }
  function refreshPills() {
    $('pills').innerHTML = pillsHtml();
    $('sh-label').textContent = headText();
    $('f-title').placeholder = isTaskSheet() ? 'What needs doing?' : 'What is it?';
    var sb = $('sbar'); if (sb) { sb.querySelectorAll('.ib:not(.del)').forEach(function (b) { b.remove(); }); sb.insertAdjacentHTML('afterbegin', sbarHtml()); }
  }
  function refreshDrawer() { refreshPills(); var d = $('drawer'); if (d && sh.open) d.innerHTML = drawerHtml(); }
  function setOpen(k) {
    sh.open = k; sh.newcat = false; refreshPills();
    var b = $('sbody'), d = $('drawer'); if (!b) return;
    if (k) { d.innerHTML = drawerHtml(); d.scrollTop = 0; }
    b.classList.toggle('open', !!k);
  }
  function addCatFromSheet(name) {
    name = name.trim(); if (!name) return;
    var row = S.cat(st, name) || S.addCat(st, name);
    if (row) { sh.f.category = row.name; save(); }
    sh.newcat = false; setOpen(null);
  }
  function saveSheet() {
    if (!sh) return;
    var f = sh.f, title = f.title.trim();
    if (!title) return;
    var q = S.parseQuick(title, st, today());
    if (q.title) title = q.title;
    if (q.category) f.category = q.category;
    if (q.due) { f.due = q.due; sh.kind = 'tasks'; }
    if (q.mins) { f.mins = q.mins; sh.kind = 'tasks'; }
    var id = sh.id, k = sh.kind, r;
    if (id && k !== sh.kind0) { S.remove(st, sh.kind0, id, 'you'); id = null; }      // a note became a task (or back): make the new one, drop the old
    if (k === 'tasks') {
      var tf = {title: title, category: S.catOrFirst(st, f.category).name, due: f.due, estimate_mins: f.mins, details: f.details.trim()};
      r = id ? S.edit(st, 'tasks', id, tf) : S.addTask(st, tf);
    } else {
      var text = title + (f.details.trim() ? '\n' + f.details.trim() : '');
      var was = id && S.find(st, 'notes', id);
      var nfld = {text: text, category: S.catOrFirst(st, f.category).name, review_later: f.review, reviewed: was && was.review_later && !f.review ? true : (was ? was.reviewed : false)};
      r = id ? S.edit(st, 'notes', id, nfld) : S.addNote(st, nfld);
    }
    if (r && pinned(r) !== f.star) S.star(st, k, r.id, f.star);
    if (k === 'tasks' && screen === 'day' && r.due && weekDays().some(function (d) { return S.ymd(d) === r.due; })) picked = r.due;
    var isNew = !sh.id;
    save(); closeSheet(); render();
    if (isNew) toast(k === 'tasks' ? 'Added to ' + r.category + (r.estimate_mins ? ' · ' + fmtMins(r.estimate_mins) : '') + ' · ' + dueLabel(r.due) : 'Note added to ' + r.category,
      function () { S.remove(st, k, r.id, 'you'); save(); render(); });
  }
  function deleteSheet() {
    var id = sh && sh.id, k = sh && sh.kind0, r = id && S.find(st, k, id); if (!r) return;
    closeSheet();
    mutate(function () { S.remove(st, k, id, 'you'); });
    toast('Deleted: ' + String(titleOf(r)).slice(0, 28), function () { mutate(function () { S.undelete(st, k, id); }); });
  }

  /* ---------- small sheets ---------- */
  var shHead = function (title, back) { return '<div class="sh-head">' + (back ? '<button class="x back" data-act="' + back + '" aria-label="Back">' + ico('back') + '</button>' : '') + '<span class="label">' + esc(title) + '</span><button class="x" data-act="close" aria-label="Close">' + ico('x') + '</button></div>'; };
  var srow = function (act, title, sub, extra) { return '<button class="row srow" data-act="' + act + '"' + (extra || '') + '><span class="main"><b>' + esc(title) + '</b>' + (sub ? '<span class="meta">' + esc(sub) + '</span>' : '') + '</span>' + ico('chev') + '</button>'; };
  function paint(label, html) { sh = null; $sheet.setAttribute('aria-label', label); $sheet.innerHTML = html; showSheet(); }
  function confirmSheet(title, text, yes, fn, bad) {
    paint('Confirm', shHead(title) + '<p class="sp">' + esc(text) + '</p><div class="btns"><button class="btn" data-act="close">Cancel</button><button class="btn primary' + (bad ? ' danger' : '') + '" data-act="cyes">' + esc(yes) + '</button></div>');
    confirmFn = fn;
  }
  var confirmFn = null;
  var when = function (t) { return new Date(t).toLocaleString('en-GB', {hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'}); };
  function cloudText() {
    if (G.on()) return 'On · ' + (G.config().email || 'Google') + (syncErr ? ' · ' + syncErr : st.lastSync ? ' · synced ' + when(st.lastSync) : '');
    if (Sync.ready()) return 'On · through your Worker';
    return 'Off · sign in to save to your Google Sheet';
  }
  function openSettings() {
    var L = window.LockUI, fp = !DEMO && L.fingerOn();
    paint('Settings', shHead('Settings') +
      '<div class="panel form"><label class="frow"><span>Your name</span><input id="s-name" maxlength="20" value="' + esc(st.settings.name) + '" autocomplete="off"></label>' +
      '<label class="frow"><span>Free time in your day</span><input id="s-day" type="number" min="1" max="16" inputmode="numeric" value="' + Math.round((Number(st.settings.dayMins) || 360) / 60) + '"><em>hours</em></label></div>' +
      '<div class="panel">' + srow('mcats', 'Categories', S.cats(st).length + ' categories · add, rename, colour') +
      (DEMO ? '' : srow('mgoogle', 'Google account', cloudText()) +
        srow('mfp', 'Fingerprint', fp ? 'On for this phone' : L.canFinger() ? 'Open with your finger' : 'Not available on this device') +
        srow('mpass', 'Passport', L.passportId() + ' · passcode, backup codes (' + L.codesLeft() + ' of 10 left)') +
        srow('mlock', 'Lock now', 'Asks for your passcode next time')) + '</div>' +
      '<div class="panel">' + srow('minvite', 'Invite a friend', 'QR code and link for their own TaskNotes') +
      srow('mexport', 'Download a copy', 'All tasks and notes as a file') +
      srow('mdemo', DEMO ? 'Leave demo' : 'Try the demo', DEMO ? 'Back to your own data' : 'Fake data, your data is not touched') +
      srow('mold', 'Back to the old look', 'Same data, the old screens') + '</div>' +
      '<p class="foot">TaskNotes ' + VER_LABEL + ' · ' + S.outboxCount(st) + ' change(s) waiting to sync</p>');
  }
  function catsSheet() {
    paint('Categories', shHead('Categories', 'settings') + '<div class="panel">' + S.cats(st).map(function (c) {
      var n = tasks().filter(function (t) { return !t.done && t.category === c.name; }).length, m = notes().filter(function (x) { return x.category === c.name; }).length;
      return '<button class="row srow" data-act="catedit" data-v="' + esc(c.name) + '"><i class="dot big" style="background:' + esc(soft(c.colour)) + '"></i><span class="main"><b>' + esc(c.name) + '</b><span class="meta">' + n + ' task' + (n === 1 ? '' : 's') + ' · ' + m + ' note' + (m === 1 ? '' : 's') + '</span></span>' + ico('chev') + '</button>';
    }).join('') + '</div><button class="btn wide" data-act="catedit" data-v="">' + ico('plus') + 'Add a category</button>');
  }
  var catEditing = null, catCol = '';
  function catSheet(name) {
    var c = name ? S.cat(st, name) : {name: '', colour: S.COLOURS[S.cats(st).length % S.COLOURS.length]};
    if (!c) return;
    catEditing = name || null; catCol = String(c.colour || S.COLOURS[0]).toLowerCase();
    paint('Category', shHead(name ? 'Edit category' : 'New category', 'mcats') +
      '<input class="tline" id="c-name" maxlength="24" placeholder="Name" value="' + esc(c.name) + '" autocomplete="off" aria-label="Name">' +
      '<div class="swatches" id="c-cols">' + S.COLOURS.map(function (x) { return '<button class="' + (x === catCol ? 'on' : '') + '" data-act="ccol" data-v="' + x + '" style="background:' + soft(x) + '" aria-label="Colour"></button>'; }).join('') + '</div>' +
      '<p class="sp err" id="c-err" hidden></p>' +
      '<div class="sbar"><button class="btn primary" data-act="csave">Save</button>' + (name ? '<button class="ib del" data-act="cdel" aria-label="Delete category">' + ico('trash') + '</button>' : '') + '</div>');
    if (!name) setTimeout(function () { var t = $('c-name'); if (t) t.focus(); }, 230);
  }
  function catSave() {
    var nn = $('c-name').value.trim(), err = function (t) { var e = $('c-err'); e.textContent = t; e.hidden = false; };
    if (!nn) { err('Give it a name.'); return; }
    if (catEditing) {
      if (!S.editCat(st, catEditing, {name: nn, colour: catCol})) { err('There is already a category called ' + nn + '.'); return; }
      if (nf.cat === catEditing) nf.cat = nn;
    } else {
      if (S.cat(st, nn)) { err('There is already a category called ' + nn + '.'); return; }
      S.addCat(st, nn, '', catCol);
    }
    save(); render(); catsSheet();
  }
  function catDelete() {
    var name = catEditing;
    if (S.cats(st).length <= 1) { toast('You need at least one category.'); return; }
    var to = S.cats(st).find(function (x) { return x.name !== name; }).name, c = S.cat(st, name);
    confirmSheet('Delete ' + name + '?', 'Its tasks and notes move to ' + to + '. You get 10 seconds to undo.', 'Delete', function () {
      var moved = st.tasks.map(function (r) { return ['tasks', r]; }).concat(st.notes.map(function (r) { return ['notes', r]; })).filter(function (x) { return x[1].category === name; }).map(function (x) { return [x[0], x[1].id]; });
      var keep = {emoji: c.emoji, colour: c.colour};
      S.removeCat(st, name); if (nf.cat === name) nf.cat = ''; save(); render(); closeSheet();
      toast('Deleted ' + name, function () { S.addCat(st, name, keep.emoji, keep.colour); moved.forEach(function (x) { S.edit(st, x[0], x[1], {category: name}); }); save(); render(); }, 10000);
    }, true);
  }
  var APP_URL = 'https://df-ai-lab.github.io/tasknotes-mcp/';
  function inviteSheet() {
    paint('Invite', shHead('Invite a friend', 'settings') + '<p class="sp">Let a friend scan this with their phone camera. They get their own TaskNotes, with their own passport and tasks. It holds the link only, never your data.</p>' +
      '<img class="qr" src="../invite-qr.svg" alt="QR code for the TaskNotes link" width="200" height="200"><p class="foot">' + APP_URL + '</p>' +
      '<div class="btns"><button class="btn" data-act="icopy">Copy link</button>' + (navigator.share ? '<button class="btn primary" data-act="ishare">Share</button>' : '') + '</div>');
  }
  function exportCopy() {
    var blob = new Blob([JSON.stringify({app: 'TaskNotes', at: new Date().toISOString(), tasks: st.tasks, notes: st.notes, categories: st.cats}, null, 1)], {type: 'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tasknotes-' + todayStr() + '.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- Google account (pick your email, the app does the rest) ---------- */
  var sendAll = function () {                              // first link: everything on this phone goes up once
    S.KINDS.forEach(function (k) { (st[k] || []).forEach(function (r) { st.dirty[k + ':' + (k === 'cats' ? r.name : r.id)] = r.updated || new Date().toISOString(); }); });
    save(true);
  };
  function googleErr(e, retry) {
    var m = $('gmsg'); if (!m) return;
    if (!e.link) { m.textContent = e.message || 'Something went wrong. Try again.'; return; }
    m.innerHTML = '<span class="gsteps"><b>Google Sheets is not switched on yet</b><span>A one-time job for the app maker.</span>' +
      '<ol><li>Tap <b>Turn it on</b>. A Google page opens.</li><li>Click the blue <b>Enable</b> button.</li><li>Wait 1 minute, then come back.</li><li>Tap <b>Try again</b>.</li></ol>' +
      '<a class="btn" href="' + esc(e.link) + '" target="_blank" rel="noopener">Turn it on</a><button class="btn primary" data-act="' + (retry || 'gin') + '">Try again</button></span>';
  }
  async function googleIn(pick) {
    var m = $('gmsg'); if (m) m.textContent = 'Opening Google…';
    try {
      var c = await G.connect(pick);
      sendAll();
      if ($('gmsg')) $('gmsg').textContent = 'Connected. Saving…';
      await syncNow();
      if (syncE && syncE.link) { googleErr(syncE); return; }
      closeSheet(); render();
      toast(syncErr ? syncErr : 'Saving to ' + (c.email || 'your Google Sheet'));
    } catch (e) { googleErr(e); }
  }
  function googleSheet() {
    if (DEMO) { toast('Not in the demo'); return; }
    G.ready().catch(function () {});
    var g = G.config();
    if (!G.on()) {
      paint('Google', shHead('Google account', 'settings') + '<p class="sp">Pick your Google email. The app makes a Sheet called <b>TaskNotes Data</b> in that Drive and saves everything there.</p>' +
        '<p class="sp">It can only see files it made, never the rest of your Drive. Secrets stay scrambled.</p><p class="sp" id="gmsg"></p>' +
        '<button class="btn primary wide" data-act="gin">Sign in with Google</button><button class="link" data-act="gadv">Advanced: use your own Worker instead</button>');
      return;
    }
    paint('Google', shHead('Google account', 'settings') +
      '<div class="gacc"><span class="gav">' + esc((g.email || 'G').slice(0, 1).toUpperCase()) + '</span><span class="main"><b>' + esc(g.email || 'Google account') + '</b><span class="meta' + (syncErr ? ' late' : '') + '">' + esc(syncErr ? syncErr : 'On' + (st.lastSync ? ' · synced ' + when(st.lastSync) : '')) + '</span></span></div>' +
      '<p class="sp" id="gmsg"></p><div class="panel">' +
      '<a class="row srow" href="' + esc(G.sheetUrl()) + '" target="_blank" rel="noopener"><span class="main"><b>Open my Sheet</b><span class="meta">TaskNotes Data, in this Google Drive</span></span>' + ico('chev') + '</a>' +
      srow('gsync', 'Sync now', S.outboxCount(st) + ' change(s) waiting') + srow('gpick', 'Switch account', 'Save to a different Google email') + srow('gout', 'Sign out', 'Your data stays on this phone') + '</div>');
  }
  function workerSheet() {
    var c = Sync.config();
    paint('Worker', shHead('Your own Worker', 'mgoogle') + '<p class="sp">Advanced. Paste the two things from the Worker setup (see WORKER_SETUP.md).</p>' +
      '<div class="panel form"><label class="frow col"><span>Worker address</span><input id="yu" placeholder="https://tasknotes.yourname.workers.dev" value="' + esc(c.url) + '" autocapitalize="off" spellcheck="false"></label>' +
      '<label class="frow col"><span>App key</span><input id="yk" type="password" value="' + esc(c.key) + '" autocapitalize="off" spellcheck="false"></label></div>' +
      '<p class="sp" id="ymsg"></p><div class="btns">' + (c.url ? '<button class="btn" data-act="yoff">Turn off</button>' : '') + '<button class="btn primary" data-act="ysave">Test and save</button></div>');
  }
  async function workerSave() {
    var msg = function (t) { $('ymsg').textContent = t; };
    var cfg = {url: $('yu').value, key: $('yk').value};
    if (!/^https:\/\//.test(cfg.url.trim())) { msg('The address should start with https://'); return; }
    msg('Testing…');
    try {
      var bad = await Sync.test(cfg);
      if (bad) { msg(bad); return; }
      Sync.setConfig(cfg); sendAll(); msg('Connected. Syncing…');
      await syncNow(true); closeSheet();
    } catch (e) { msg('Could not reach it. Check the address and your internet.'); }
  }

  /* ---------- taps ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id'), v = el.getAttribute('data-v');
    var L = window.LockUI;
    switch (act) {
      case 'tab': goTab(v); break;
      case 'day': changeDay(v); break;
      case 'tick': tick(id); break;
      case 'later': later(id); break;
      case 'pin': togglePin(id); break;
      case 'open': openSheet(id); break;
      case 'down': $scroll.scrollBy({top: $scroll.clientHeight * .7, behavior: still() ? 'auto' : 'smooth'}); break;
      case 'expand': flip(function () { openPick = id; render(); }); break;
      case 'fold': flip(function () { openPick = null; render(); }); break;
      case 'add':
        if (screen === 'secrets') { if (!vault.key) toast('Type your passcode first'); else if (vf === 'docs') toast('Documents are coming soon'); else secretSheet(null); break; }
        openSheet(null); break;
      case 'undo': var u = toastUndo; hideToast(); if (u) u(); break;
      case 'undel': (function () { var k = kindOf(id); mutate(function () { S.undelete(st, k, id); }); toast('Kept'); })(); break;
      case 'okdel': (function () { var k = kindOf(id); mutate(function () { S.confirmDelete(st, k, id); }); toast('Deleted', function () { mutate(function () { S.undelete(st, k, id); }); }); })(); break;
      case 'nfreview': nf.review = !nf.review; noteOpen = null; render(); break;
      case 'nfall': nf = {review: false, cat: ''}; noteOpen = null; render(); break;
      case 'nfcat': nf.cat = nf.cat === v ? '' : v; noteOpen = null; render(); break;
      case 'nsopen': nsOpen = true; render(); var q = $('nq'); if (q) q.focus(); break;
      case 'nsclose': nsOpen = false; nq = ''; render(); break;
      case 'nexpand': flip(function () { noteOpen = id; render(); }); break;
      case 'nfold': flip(function () { noteOpen = null; render(); }); break;
      case 'rlater': (function () { var n = S.find(st, 'notes', id); if (!n) return; mutate(function () { S.flag(st, id); }); toast(n.review_later ? 'Flagged to review later' : 'Marked as reviewed', function () { mutate(function () { S.flag(st, id); }); }); })(); break;
      // vault
      case 'vkey': vaultKey(v); break;
      case 'vtab': vf = v; vaultOpen = null; vShow = false; render(); break;
      case 'vexpand': flip(function () { vaultOpen = id; vShow = false; render(); }); break;
      case 'vfold': flip(function () { vaultOpen = null; render(); }); break;
      case 'vshow': vShow = !vShow; render(); break;
      case 'vcopy': (function () { var it = vault.items.find(function (x) { return x.id === id; }); if (it) copyText(it.text).then(function (ok) { toast(ok ? 'Copied: ' + it.title.slice(0, 24) : 'Could not copy'); }); })(); break;
      case 'vdots': secretSheet(id); break;
      case 'vlock': lockVault(); toast('Vault locked'); break;
      case 'vtype': $sheet.querySelectorAll('[data-act="vtype"]').forEach(function (b) { b.classList.toggle('on', b === el); }); break;
      case 'vpeek': e.preventDefault(); var vi = $('v-val'); if (vi) vi.type = vi.type === 'password' ? 'text' : 'password'; break;
      case 'vsave': saveSecret(id); break;
      case 'vdel': (function () { var it = vault.items.find(function (x) { return x.id === id; }); S.remove(st, 'secrets', id, 'you'); save(); closeSheet(); vaultOpen = null; refreshVault();
        toast('Deleted: ' + (it ? it.title.slice(0, 24) : 'secret'), function () { S.undelete(st, 'secrets', id); save(); refreshVault(); }); })(); break;
      // header
      case 'settings': openSettings(); break;
      case 'update': doUpdate(); break;
      case 'refresh': if (upd) doUpdate(); else if (cloudOn()) syncNow(true); else if (DEMO) toast('Demo: nothing to sync'); else googleSheet(); break;
      case 'close': closeSheet(); break;
      case 'cyes': var fn = confirmFn; confirmFn = null; closeSheet(); if (fn) fn(); break;
      // edit sheet
      case 'save': saveSheet(); break;
      case 'delete': deleteSheet(); break;
      case 'pill': setOpen(sh.open === v ? null : v); break;
      case 'setcat': sh.f.category = v; sh.newcat = false; setOpen(null); break;
      case 'newcat': sh.newcat = true; refreshDrawer(); var ni = $('f-newcat'); if (ni) ni.focus(); break;
      case 'setdate': sh.f.due = v; if (v) sh.kind = 'tasks'; setOpen(null); break;
      case 'setmins': sh.f.mins = Number(v) || 0; if (sh.f.mins) sh.kind = 'tasks'; setOpen(null); break;
      case 'needs': sh.kind = isTaskSheet() ? 'notes' : 'tasks'; if (sh.kind === 'tasks' && !sh.f.due && screen === 'day') sh.f.due = picked; refreshPills(); break;
      case 'spin': sh.f.star = !sh.f.star; refreshPills(); break;
      case 'review': sh.f.review = !sh.f.review; refreshPills(); break;
      // settings
      case 'mcats': catsSheet(); break;
      case 'catedit': catSheet(v); break;
      case 'ccol': catCol = v; $sheet.querySelectorAll('[data-act="ccol"]').forEach(function (b) { b.classList.toggle('on', b === el); }); break;
      case 'csave': catSave(); break;
      case 'cdel': catDelete(); break;
      case 'mgoogle': googleSheet(); break;
      case 'gin': googleIn(false); break;
      case 'gpick': googleIn(true); break;
      case 'gadv': workerSheet(); break;
      case 'gsync': (async function () { var m = $('gmsg'); if (m) m.textContent = 'Syncing…'; try { if (!G.token()) await G.wake(); } catch (x) { googleErr(x); return; } await syncNow(); googleSheet(); if (syncE && syncE.link) googleErr(syncE, 'gsync'); })(); break;
      case 'gout': confirmSheet('Sign out of Google?', 'Nothing is deleted. Your data stays on this phone and in the Sheet.', 'Sign out', function () { G.signOut(); syncErr = ''; render(); toast('Signed out. Your data stays on this phone.'); }); break;
      case 'ysave': workerSave(); break;
      case 'yoff': Sync.setConfig({url: '', key: ''}); closeSheet(); render(); toast('Cloud sync off. Your data stays on this phone.'); break;
      case 'mfp': (async function () {
        if (L.fingerOn()) { L.fingerOff(); toast('Fingerprint off'); openSettings(); return; }
        if (!L.canFinger()) return;
        var ok = await L.fingerAdd(); toast(ok ? 'Fingerprint on' : 'Cancelled. Nothing changed.'); openSettings();
      })(); break;
      case 'mpass': closeSheet(); L.settings(); break;
      case 'mlock': closeSheet(); lockVault(true); L.lockNow(); break;
      case 'minvite': inviteSheet(); break;
      case 'icopy': copyText(APP_URL).then(function (ok) { toast(ok ? 'Link copied' : 'Copy did not work'); }); break;
      case 'ishare': navigator.share({title: 'TaskNotes', text: 'Your day, tasks and notes in one simple app', url: APP_URL}).catch(function () {}); break;
      case 'mexport': exportCopy(); break;
      case 'mdemo': location.href = DEMO ? './' : './?demo=1'; break;
      case 'mold': location.href = '../'; break;
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'nq') { nq = t.value; noteOpen = null; $('nlist').innerHTML = notesList(); return; }
    if (t.id === 'vq') { vq = t.value; vaultOpen = null; $('vlist').innerHTML = vaultList(); return; }
    if (t.id === 's-name') { st.settings.name = t.value.trim().slice(0, 20); save(true); return; }
    if (t.id === 's-day') { var h = Number(t.value); if (h) { st.settings.dayMins = Math.max(60, Math.min(960, h * 60)); save(true); render(); } return; }
    if (!sh) return;
    if (t.getAttribute && t.getAttribute('data-f')) {
      sh.f[t.getAttribute('data-f')] = t.value;
      if (t.id === 'f-title') { var b = $('save'); if (b) b.disabled = !t.value.trim(); }
    } else if (t.id === 'f-date') { sh.f.due = t.value; if (t.value) sh.kind = 'tasks'; refreshPills(); }
  });
  document.addEventListener('focusout', function (e) {
    if (sh && sh.newcat && e.target.id === 'f-newcat' && e.target.value.trim()) addCatFromSheet(e.target.value);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sh && sh.newcat) { sh.newcat = false; refreshDrawer(); return; }
    if (e.key === 'Enter' && sh && e.target.id === 'f-newcat') { e.preventDefault(); addCatFromSheet(e.target.value); return; }
    if (e.key === 'Escape' && $sheet.classList.contains('show')) closeSheet();
    if (e.key === 'Enter' && sh && e.target.id === 'f-title') { e.preventDefault(); saveSheet(); }
    if (e.key === 'Enter' && e.target.id === 'v-val') { e.preventDefault(); var s = $sheet.querySelector('[data-act="vsave"]'); if (s) s.click(); }
  });
  $scroll.addEventListener('scroll', checkDown, {passive: true});
  document.addEventListener('scroll', function (e) { var f = e.target; if (f.classList && f.classList.contains('filters')) f.classList.toggle('scrolled', f.scrollLeft > 2); }, true);
  // filter row: mouse wheel + drag scroll sideways (touch already swipes)
  $scroll.addEventListener('wheel', function (e) {
    var f = e.target.closest && e.target.closest('.filters'); if (!f || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (f.scrollWidth <= f.clientWidth) return; e.preventDefault(); f.scrollLeft += e.deltaY;
  }, {passive: false});
  (function () {
    var f = null, x0 = 0, s0 = 0, moved = false;
    $scroll.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; f = e.target.closest && e.target.closest('.filters'); if (!f) return; x0 = e.clientX; s0 = f.scrollLeft; moved = false; });
    window.addEventListener('pointermove', function (e) { if (!f) return; var dx = e.clientX - x0; if (Math.abs(dx) > 4) moved = true; f.scrollLeft = s0 - dx; });
    window.addEventListener('pointerup', function () { f = null; });
    document.addEventListener('click', function (e) { if (moved && e.target.closest && e.target.closest('.filters')) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  })();
  window.addEventListener('resize', function () { checkDown(); placeHl(); });

  /* ---------- sync ---------- */
  var syncing = false, syncErr = '', syncE = null;
  function paintHead() { var a = document.querySelector('#top .icon-wrap'); if (!a) return; var h = document.createElement('div'); h.innerHTML = head('x'); var n = h.querySelector('.icon-wrap'); a.className = n.className; a.setAttribute('aria-label', n.getAttribute('aria-label')); }
  async function syncNow(loud) {
    if (DEMO || syncing || !cloudOn()) return;
    if (wakeP) await wakeP.catch(function () {});
    if (!navigator.onLine) { if (loud) toast('Offline. Changes will sync later.'); return; }
    syncing = true; paintHead();
    try {
      var r = G.on() ? await G.run(st) : await Sync.run(st);
      syncErr = ''; syncE = null;
      S.purge(st, Date.now());
      save(true);
      if (vault.key) await refreshVault(true);
      if (loud) toast('Synced' + (r.sent ? ' · sent ' + r.sent : ''));
      if (!$('app').hidden && !$sheet.classList.contains('show') && !dayBusy && !navBusy) { var top = $scroll.scrollTop; render(); $scroll.scrollTop = top; }
    } catch (e) {
      syncErr = e.message || 'Sync failed'; syncE = e;
      if (e.needTap) { syncErr = 'Tap anywhere to reconnect Google'; wakeOnTap(); loud = false; }
      if (loud) toast(syncErr);
    } finally { syncing = false; paintHead(); }
  }
  // Google's sign-in lasts an hour. A new one needs a tap (browsers block pop-ups otherwise), so the next tap
  // anywhere quietly gets a fresh one, with no account picker.
  var wakeP = null, wakeArmed = false;
  function wakeOnTap() {
    if (wakeArmed || !G.on()) return;
    wakeArmed = true;
    G.ready().catch(function () {});
    document.addEventListener('pointerdown', function h() {
      document.removeEventListener('pointerdown', h, true);
      wakeArmed = false;
      wakeP = G.wake().then(function () { wakeP = null; syncErr = ''; syncNow(); }, function (e) { wakeP = null; syncErr = e.message; paintHead(); });
    }, true);
  }
  if (!DEMO && G.on() && !G.token()) wakeOnTap();
  window.addEventListener('online', function () { syncNow(); });
  setInterval(function () { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') syncNow(); });

  /* ---------- updates ---------- */
  // version.json says the newest version. If it is newer than this copy, the header shows "Update ready".
  var updSkip = '';
  async function checkUpdate() {
    if (!navigator.onLine || location.protocol === 'file:') return;
    try {
      var j = await (await fetch('version.json?t=' + Date.now(), {cache: 'no-store'})).json();
      var want = String(DEMO ? j.demo : j.version || ''), have = DEMO ? DEMO_VERSION : VERSION;
      if (!want || Number(want) <= Number(have) || updSkip === want) return;
      upd = want; updNote = j.notes || '';
      if (!$('app').hidden && !$sheet.classList.contains('show')) render();
    } catch (e) { /* offline or no file: try later */ }
  }
  async function doUpdate() {
    save(true);
    toast('Updating…');
    var reload = function () { location.reload(); };
    try {
      var reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) { navigator.serviceWorker.addEventListener('controllerchange', reload); await reg.update(); setTimeout(reload, 6000); return; }
    } catch (e) { /* reload below */ }
    reload();
  }
  setTimeout(checkUpdate, 3000);
  setInterval(checkUpdate, 10 * 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') checkUpdate(); });

  /* ---------- start ---------- */
  S.purge(st, Date.now());
  if (DEMO) $('demobar').hidden = false;
  var started = false;
  function onEnter() {
    $('app').hidden = false;
    render();
    if (!started) { started = true; syncNow(); }
  }
  window.LockUI.start({
    app: 'TaskNotes', prefix: 'tn', demo: DEMO,
    name: function () { return st.settings.name || ''; },
    setName: function (n) { st.settings.name = String(n || '').trim().slice(0, 20); save(true); },
    onEnter: onEnter,
    // Passport "Sign out": send what's left to the Sheet, then wipe this phone so the next Google account starts clean
    onSignOut: async function () {
      clearTimeout(syncTimer);
      if (G.on() && S.outboxCount(st)) await syncNow();
      try { store.removeItem(SKEY); } catch (e) { /* none */ }
      st = S.starter(); st.secrets = [];
      vault.key = null; vault.items = [];
      G.setToken(''); G.setConfig(null);
    }
  });
  if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
