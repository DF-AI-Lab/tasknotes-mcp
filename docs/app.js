/* TaskNotes - the screen. Draws from Store, saves to localStorage, syncs through Sync. */
(function () {
  'use strict';
  const S = window.Store, $ = id => document.getElementById(id);
  // 🏷️ bump these with every change: VERSION for the live app, DEMO_VERSION for the demo
  const VERSION = '1.03', DEMO_VERSION = '03';
  const DEMO = new URLSearchParams(location.search).has('demo');
  const VER_LABEL = DEMO ? 'demo.v.' + DEMO_VERSION : 'v.' + VERSION;
  const SKEY = DEMO ? 'tn_demo_state_v1' : 'tn_state_v1';
  const store = DEMO ? sessionStorage : localStorage;
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const today = () => new Date();
  const col = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#64748b';

  // ---------- state ----------
  let st = load();
  if (!st.secrets) st.secrets = [];
  function load() {
    try { const t = store.getItem(SKEY); const s = t && JSON.parse(t); if (s && s.v === 1) return s; } catch (e) { /* none yet */ }
    return DEMO ? S.demo(today()) : S.starter();
  }
  let syncTimer = 0;
  function save(noSync) {
    try { store.setItem(SKEY, JSON.stringify(st)); } catch (e) { /* full or private */ }
    if (!noSync) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 1500); }
  }
  let filter = null, tab = 'day', kind = 'Task';
  try { const ui = JSON.parse(sessionStorage.getItem('tn_ui') || '{}'); tab = ui.tab || tab; filter = ui.filter || null; } catch (e) { /* none */ }
  const remember = () => { try { sessionStorage.setItem('tn_ui', JSON.stringify({tab, filter})); } catch (e) { /* none */ } };

  function applyLook() {
    const l = st.settings.theme || 'ocean';
    if (l === 'ocean') document.documentElement.removeAttribute('data-look'); else document.documentElement.setAttribute('data-look', l);
    const bg = {ocean: '#0f1622', ember: '#16130f', mint: '#f3f6f2'}[l];
    document.querySelector('meta[name=theme-color]').setAttribute('content', bg);
  }

  // ---------- drawing ----------
  const vis = r => !filter || r.category === filter;
  const catOf = name => S.cat(st, name) || {name: name || '?', emoji: '📁', colour: '#64748b'};
  const live = r => S.live(r);

  function render() {
    if (filter && !S.cat(st, filter)) filter = null;
    const now = today(), t0 = S.ymd(now);
    const open = st.tasks.filter(t => live(t) && !t.done);
    const todays = open.filter(t => t.due && t.due <= t0);
    const planned = todays.reduce((a, t) => a + (Number(t.estimate_mins) || 0), 0);
    const dayMins = Number(st.settings.dayMins) || 360;
    const revN = st.notes.filter(n => live(n) && n.review_later).length;
    const titles = {day: 'Your day', notes: 'Notes', review: 'Review later', done: 'Done', secrets: '🔐 Secrets'};
    const subs = {
      day: now.toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'}) + ' · ' + (planned ? S.fmtMins(planned) + ' planned of ~' + S.fmtMins(dayMins) : todays.length ? todays.length + ' to do' : 'nothing due today'),
      notes: 'Quick thoughts by category', review: 'Notes you flagged to look at again', done: 'Hidden from your day, but kept',
      secrets: vault.key ? 'Open · locks after 1 min without a tap' : 'Locked · needs your PIN every time'};
    let h = `<div class="top"><div><h2>${titles[tab]}</h2><small>${esc(subs[tab])}</small></div>
      <div class="topr">${DEMO ? '' : syncButton()}<div class="mewrap"><button class="av" id="me" aria-label="Settings">${esc(initials())}</button><small class="ver">${VER_LABEL}</small></div></div></div>`;

    if (tab === 'day') {
      const pending = st.tasks.filter(S.pendingDelete).map(r => ['tasks', r]).concat(st.notes.filter(S.pendingDelete).map(r => ['notes', r]));
      if (pending.length) {
        h += `<h3 class="sec bad"><span>🤖 Claude wants to delete</span></h3><div class="gone">${pending.map(([k, r]) =>
          `<div class="row"><span>${esc(r.title || r.text)}</span><button class="mini" data-undel="${k}:${esc(r.id)}">Keep</button><button class="mini bad" data-okdel="${k}:${esc(r.id)}">Delete</button></div>`).join('')}</div>`;
      }
      const cs = S.cats(st);
      h += `<div class="bar" role="img" aria-label="${esc(S.fmtMins(planned) || '0m')} planned today">${cs.map(c => {
        const m = todays.filter(t => t.category === c.name).reduce((a, t) => a + (Number(t.estimate_mins) || 0), 0);
        return `<i style="width:${Math.min(100, m / dayMins * 100)}%;background:${col(c.colour)}"></i>`; }).join('')}</div>
        <div class="legend">${esc(cs.filter(c => todays.some(t => t.category === c.name)).map(c => c.name).join(' · ') || 'All clear today 🎉')}</div>`;
    }
    if (tab === 'day' || tab === 'notes') h += tiles();
    if (tab === 'day') {
      const groups = {};
      open.filter(vis).forEach(t => { const b = S.bucket(t.due, now); (groups[b] = groups[b] || []).push(t); });
      let any = false;
      S.BUCKETS.forEach((b, i) => {
        const list = groups[b];
        if (!list && b !== 'Today') return;
        any = true;
        (list || []).sort((a, z) => (a.due || '9').localeCompare(z.due || '9') || a.created.localeCompare(z.created));
        h += `<h3 class="sec${b === 'Overdue' ? ' bad' : ''}"><span>${b}${list ? ' · ' + list.length : ''}</span>${i <= 1 && filter && !h.includes('data-clr') ? '<button data-clr="1">Show all ✕</button>' : ''}</h3>`;
        h += list ? list.map(item).join('') : '<div class="empty">Nothing due today ✨</div>';
      });
      if (!any) h += '<div class="empty">No tasks yet. Add one below 👇</div>';
      const ns = st.notes.filter(n => live(n) && vis(n)).slice(0, 4);
      if (ns.length) h += `<h3 class="sec"><span>Latest notes</span><button data-tab2="notes">All notes →</button></h3><div class="notes">${ns.map(note).join('')}</div>`;
    }
    if (tab === 'notes') {
      const ns = st.notes.filter(n => live(n) && vis(n));
      h += `<h3 class="sec"><span>${filter ? esc(filter) + ' notes' : 'All notes'} · ${ns.length}</span>${filter ? '<button data-clr="1">Show all ✕</button>' : ''}</h3>`;
      h += ns.length ? `<div class="notes">${ns.map(note).join('')}</div>` : '<div class="empty">No notes yet. Switch the box below to Note 👇</div>';
    }
    if (tab === 'review') {
      const ns = st.notes.filter(n => live(n) && n.review_later);
      h += `<h3 class="sec"><span>${ns.length} to review</span></h3>`;
      h += ns.length ? `<div class="notes">${ns.map(note).join('')}</div>` : '<div class="empty">All reviewed 🎉</div>';
    }
    if (tab === 'done') {
      const ds = st.tasks.filter(t => live(t) && t.done).sort((a, z) => (z.done_at || '').localeCompare(a.done_at || ''));
      h += `<h3 class="sec"><span>${ds.length} done</span></h3>`;
      h += ds.length ? ds.map(item).join('') : '<div class="empty">Nothing ticked off yet</div>';
    }
    if (tab === 'secrets') h += vaultHtml();
    $('scroll').innerHTML = h;
    if (tab === 'secrets' && !vault.key) vaultPad();
    $('qa').hidden = tab === 'secrets';
    const badge = $('revn'); badge.hidden = !revN; badge.textContent = revN;
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('kind').textContent = kind;
    $('qtext').placeholder = kind === 'Task' ? `Add task${filter ? ' to ' + filter : ''}… e.g. "Call mum 10m tomorrow"` : `Add note${filter ? ' to ' + filter : ''}…`;
    remember();
  }
  function initials() { const n = (st.settings.name || '').trim(); return n ? n.slice(0, 2).toUpperCase() : '⚙️'; }
  function syncButton() {
    if (!Sync.ready()) return '<button class="sync" id="syncb" aria-label="Cloud sync is off">☁️<i></i></button>';
    const n = S.outboxCount(st);
    const cls = syncing ? 'spin' : syncErr ? 'err' : n ? 'wait' : 'ok';
    return `<button class="sync ${cls}" id="syncb" aria-label="Sync now">🔄<i></i></button>`;
  }
  function tiles() {
    const cs = S.cats(st);
    return `<div class="grid${filter ? ' filtering' : ''}">${cs.map(c => {
      const nt = st.tasks.filter(t => live(t) && !t.done && t.category === c.name).length;
      const nn = st.notes.filter(n => live(n) && n.category === c.name).length;
      return `<button class="tile${filter === c.name ? ' sel' : ''}" data-cat="${esc(c.name)}" style="background:${col(c.colour)}"><b>${esc(c.emoji)} ${esc(c.name)}</b><small>${nt} task${nt === 1 ? '' : 's'}${nn ? ' · ' + nn + ' note' + (nn === 1 ? '' : 's') : ''}</small></button>`;
    }).join('')}${cs.length % 2 ? '<button class="tile addc" data-addcat="1">＋ Category</button>' : ''}</div>`;
  }
  function item(t) {
    const c = catOf(t.category), late = t.due && !t.done && t.due < S.ymd(today());
    return `<div class="item${t.done ? ' done' : ''}"><button class="chk" data-tick="${esc(t.id)}" aria-label="${t.done ? 'Not done' : 'Done'}: ${esc(t.title)}">${t.done ? '✓' : ''}</button>
      <button class="body" data-edit="tasks:${esc(t.id)}"><div class="t">${esc(t.title)}</div><div class="s${late ? ' late' : ''}"><span class="pill" style="background:${col(c.colour)}">${esc(c.name)}</span>${esc(t.done ? 'done ' + new Date(t.done_at || t.updated).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) : S.dueLabel(t.due, today()))}</div></button>
      <span class="time">${S.fmtMins(t.estimate_mins)}</span></div>`;
  }
  function note(n) {
    const c = catOf(n.category);
    return `<div class="sn${n.review_later ? ' rev' : ''}"><em style="color:${n.review_later ? 'var(--ac)' : col(c.colour)}">${n.review_later ? '🔖 REVIEW LATER' : esc(c.name.toUpperCase())}</em>
      <button class="body tx" data-edit="notes:${esc(n.id)}">${esc(n.text)}</button>
      <div class="fl"><span>${n.review_later ? esc(c.name) : new Date(n.created).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})}</span><button class="flagbtn" data-flag="${esc(n.id)}">${n.review_later ? '✓ Reviewed' : '🔖 Later'}</button></div></div>`;
  }

  // ---------- taps ----------
  $('scroll').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.cat) { filter = filter === d.cat ? null : d.cat; render(); return; }
    if (d.clr) { filter = null; render(); return; }
    if (d.tab2) { tab = d.tab2; render(); $('scroll').scrollTop = 0; return; }
    if (d.addcat) { catSheet(null); return; }
    if (d.tick) {
      const t = S.tick(st, d.tick); save(); render();
      toast(t.done ? '✅ Done: ' + t.title : 'Moved back to your list', () => { S.tick(st, t.id); save(); render(); });
      return;
    }
    if (d.flag) {
      const n = S.flag(st, d.flag); save(); render();
      toast(n.review_later ? '🔖 Flagged to review later' : '✓ Marked as reviewed', () => { S.flag(st, n.id); save(); render(); });
      return;
    }
    if (d.edit) { const [k, id] = d.edit.split(':'); editSheet(k, id); return; }
    if (d.undel) { const [k, id] = d.undel.split(':'); S.undelete(st, k, id); save(); render(); toast('Kept 👍'); return; }
    if (d.okdel) { const [k, id] = d.okdel.split(':'); S.confirmDelete(st, k, id); save(); render(); toast('🗑️ Deleted', () => { S.undelete(st, k, id); save(); render(); }); return; }
    if (d.vadd) { secretSheet(null); return; }
    if (d.vedit) { secretSheet(d.vedit); return; }
    if (d.vtog) { if (vault.open.has(d.vtog)) vault.open.delete(d.vtog); else vault.open.add(d.vtog); render(); return; }
    if (d.vall) { if (vault.open.size) vault.open.clear(); else vault.items.forEach(x => vault.open.add(x.id)); render(); return; }
    if (d.vlock) { lockVault(); toast('🔒 Secrets locked'); return; }
    if (d.vcopy) {
      const it = vault.items.find(x => x.id === d.vcopy);
      if (it) copyText(it.text).then(ok => toast(ok ? '📋 Copied: ' + it.title.slice(0, 24) : '😕 Could not copy'));
      return;
    }
    if (b.id === 'me') { settingsSheet(); return; }
    if (b.id === 'syncb') { if (Sync.ready()) syncNow(true); else syncSheet(); }
  });
  $('nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    if (tab === 'secrets' && b.dataset.tab !== 'secrets') lockVault(true);
    tab = b.dataset.tab;
    if (tab === 'review' || tab === 'done') filter = null;
    if (tab === 'notes' || tab === 'review') kind = 'Note'; else if (tab === 'day') kind = 'Task';
    $('scroll').scrollTop = 0; render();
  });
  $('kind').addEventListener('click', () => { kind = kind === 'Task' ? 'Note' : 'Task'; render(); $('qtext').focus(); });
  $('qa').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('qtext').value.trim();
    if (!v) return;
    if (kind === 'Task') {
      const q = S.parseQuick(v, st, today());
      const t = S.addTask(st, {title: q.title || v, category: q.category || filter, due: q.due || S.ymd(today()), estimate_mins: q.mins});
      toast(`➕ Added to ${t.category}${q.mins ? ' · ' + S.fmtMins(q.mins) : ''} · ${S.dueLabel(t.due, today())}`, () => { st.tasks = st.tasks.filter(x => x !== t); delete st.dirty['tasks:' + t.id]; save(); render(); });
    } else {
      const q = S.parseQuick(v, st, today());
      const n = S.addNote(st, {text: q.category ? v.replace(/\s#[\w-]+/, '').trim() : v, category: q.category || filter, review_later: tab === 'review'});
      toast('🗒️ Note added to ' + n.category, () => { st.notes = st.notes.filter(x => x !== n); delete st.dirty['notes:' + n.id]; save(); render(); });
    }
    $('qtext').value = '';
    save(); render();
  });

  // ---------- toast ----------
  let tt = 0, undoFn = null;
  function toast(msg, undo) {
    $('tmsg').textContent = msg; undoFn = undo || null; $('undo').hidden = !undo;
    $('toast').classList.add('show'); clearTimeout(tt); tt = setTimeout(() => $('toast').classList.remove('show'), 3500);
  }
  $('undo').addEventListener('click', () => { if (undoFn) undoFn(); undoFn = null; $('toast').classList.remove('show'); });

  // ---------- the bottom sheet ----------
  function openSheet(html, wire) {
    $('sheet').innerHTML = html; $('sheetwrap').hidden = false;
    wire && wire($('sheet'));
    const f = $('sheet').querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 60);
  }
  function closeSheet() { $('sheetwrap').hidden = true; $('sheet').innerHTML = ''; }
  $('backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheetwrap').hidden) closeSheet(); });
  const catChips = (cur) => `<div class="chips" id="catchips">${S.cats(st).map(c => `<button type="button" class="chip${c.name === cur ? ' on' : ''}" data-c="${esc(c.name)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>`;
  const chipPick = (root, id) => root.querySelectorAll('#' + id + ' .chip').forEach(b => b.addEventListener('click', () => { root.querySelectorAll('#' + id + ' .chip').forEach(x => x.classList.toggle('on', x === b)); }));
  const picked = (root, id, attr) => { const b = root.querySelector('#' + id + ' .chip.on'); return b ? b.dataset[attr] : ''; };

  function editSheet(k, id) {
    const r = S.find(st, k, id);
    if (!r) return;
    const t0 = today(), d = n => S.ymd(S.addDays(t0, n));
    if (k === 'tasks') {
      const mins = [5, 10, 15, 30, 45, 60, 90, 120];
      openSheet(`<h2>Edit task</h2>
        <div class="field"><label for="ft">Task</label><input class="inp" id="ft" value="${esc(r.title)}"></div>
        <div class="field"><span class="lbl">Category</span>${catChips(r.category)}</div>
        <div class="field"><label for="fd">Due</label>
          <div class="chips" id="duechips">${[['Today', d(0)], ['Tomorrow', d(1)], ['Next week', d(7)], ['No date', '']].map(([l, v]) => `<button type="button" class="chip${r.due === v ? ' on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
          <input class="inp" type="date" id="fd" value="${esc(r.due)}"></div>
        <div class="field"><label for="fm">Time it takes (minutes)</label>
          <div class="chips" id="minchips">${mins.map(m => `<button type="button" class="chip${Number(r.estimate_mins) === m ? ' on' : ''}" data-v="${m}">${S.fmtMins(m)}</button>`).join('')}</div>
          <input class="inp" type="number" min="0" step="5" inputmode="numeric" id="fm" value="${Number(r.estimate_mins) || ''}"></div>
        <div class="btns"><button class="btn" id="fdel" type="button">🗑️ Delete</button><button class="btn p" id="fsave" type="button">Save</button></div>`, sh => {
        chipPick(sh, 'catchips');
        sh.querySelectorAll('#duechips .chip').forEach(b => b.addEventListener('click', () => { sh.querySelector('#fd').value = b.dataset.v; sh.querySelectorAll('#duechips .chip').forEach(x => x.classList.toggle('on', x === b)); }));
        sh.querySelectorAll('#minchips .chip').forEach(b => b.addEventListener('click', () => { sh.querySelector('#fm').value = b.dataset.v; sh.querySelectorAll('#minchips .chip').forEach(x => x.classList.toggle('on', x === b)); }));
        sh.querySelector('#fsave').addEventListener('click', () => {
          const title = sh.querySelector('#ft').value.trim();
          if (!title) { sh.querySelector('#ft').focus(); return; }
          S.edit(st, 'tasks', id, {title, category: picked(sh, 'catchips', 'c') || r.category, due: sh.querySelector('#fd').value, estimate_mins: Number(sh.querySelector('#fm').value) || 0});
          save(); closeSheet(); render(); toast('💾 Saved');
        });
        sh.querySelector('#fdel').addEventListener('click', () => del('tasks', id, r.title));
      });
    } else {
      openSheet(`<h2>Edit note</h2>
        <div class="field"><label for="fx">Note</label><textarea class="inp" id="fx">${esc(r.text)}</textarea></div>
        <div class="field"><span class="lbl">Category</span>${catChips(r.category)}</div>
        <div class="chips" id="revchips"><button type="button" class="chip${r.review_later ? ' on' : ''}" data-v="1">🔖 Review later</button><button type="button" class="chip${r.review_later ? '' : ' on'}" data-v="">Just a note</button></div>
        <div class="btns"><button class="btn" id="fdel" type="button">🗑️ Delete</button><button class="btn p" id="fsave" type="button">Save</button></div>`, sh => {
        chipPick(sh, 'catchips'); chipPick(sh, 'revchips');
        sh.querySelector('#fsave').addEventListener('click', () => {
          const text = sh.querySelector('#fx').value.trim();
          if (!text) { sh.querySelector('#fx').focus(); return; }
          const rev = !!picked(sh, 'revchips', 'v');
          S.edit(st, 'notes', id, {text, category: picked(sh, 'catchips', 'c') || r.category, review_later: rev, reviewed: r.review_later && !rev ? true : r.reviewed});
          save(); closeSheet(); render(); toast('💾 Saved');
        });
        sh.querySelector('#fdel').addEventListener('click', () => del('notes', id, r.text));
      });
    }
  }
  function del(k, id, label) {
    S.remove(st, k, id, 'you'); save(); closeSheet(); render();
    toast('🗑️ Deleted: ' + String(label).slice(0, 28), () => { S.undelete(st, k, id); save(); render(); });
  }

  // ---------- settings ----------
  function settingsSheet() {
    const fp = window.LockUI.fingerOn();
    const looks = [['ocean', 'Ocean', '#6ea0ff'], ['ember', 'Ember', '#ff8a4c'], ['mint', 'Mint', '#0f9d76']];
    openSheet(`<h2>⚙️ Settings</h2>
      <div class="field"><label for="sn">Your name</label><input class="inp" id="sn" maxlength="20" value="${esc(st.settings.name)}"></div>
      <div class="field"><span class="lbl">Colour</span><div class="chips" id="lookchips">${looks.map(([k, n, c]) => `<button type="button" class="chip${(st.settings.theme || 'ocean') === k ? ' on' : ''}" data-v="${k}"><span class="sw"><i style="background:${c}"></i>${n}</span></button>`).join('')}</div></div>
      <div class="field"><label for="sd">Free time in your day (hours)</label><input class="inp" id="sd" type="number" min="1" max="16" inputmode="numeric" value="${Math.round((Number(st.settings.dayMins) || 360) / 60)}"></div>
      <div class="menu">
        <button type="button" id="mcats">🗂️ Categories<span class="sub">${S.cats(st).length} categories · add, rename, colour</span></button>
        ${DEMO ? '' : `<button type="button" id="msync">☁️ Cloud sync<span class="sub">${Sync.ready() ? (st.lastSync ? 'On · last synced ' + new Date(st.lastSync).toLocaleString('en-GB', {hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'}) : 'On · not synced yet') : 'Off · keep a copy in your Google Sheet'}</span></button>
        <button type="button" id="mfp">👆 Fingerprint<span class="sub">${fp ? '● On for this phone' : window.LockUI.canFinger() ? 'Open with your finger' : 'Not available on this device'}</span></button>
        <button type="button" id="mpin">🔢 Change PIN<span class="sub">Pick a new 6-digit PIN</span></button>
        <button type="button" id="mcodes">🔑 New backup codes<span class="sub">${window.LockUI.codesLeft()} of 10 left · the old ones stop working</span></button>
        <button type="button" id="mlock">🔒 Lock now</button>`}
        <button type="button" id="mexport">💾 Download a copy<span class="sub">All tasks and notes as a file</span></button>
        <button type="button" id="mdemo">${DEMO ? '🚪 Leave demo' : '🧪 Try the demo'}<span class="sub">${DEMO ? 'Back to your own data' : 'Fake data, your data is not touched'}</span></button>
      </div>
      <p class="small">TaskNotes ${VER_LABEL} · ${S.outboxCount(st)} change(s) waiting to sync</p>
      <button class="btn p" id="sdone" type="button">Done</button>`, sh => {
      chipPick(sh, 'lookchips');
      sh.querySelectorAll('#lookchips .chip').forEach(b => b.addEventListener('click', () => { st.settings.theme = b.dataset.v; applyLook(); save(true); }));
      const keep = () => {
        st.settings.name = sh.querySelector('#sn').value.trim().slice(0, 20);
        st.settings.dayMins = Math.max(60, Math.min(960, (Number(sh.querySelector('#sd').value) || 6) * 60));
        save(true); render();
      };
      sh.querySelector('#sdone').addEventListener('click', () => { keep(); closeSheet(); });
      sh.querySelector('#mcats').addEventListener('click', () => { keep(); catsSheet(); });
      sh.querySelector('#mexport').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({app: 'TaskNotes', at: new Date().toISOString(), tasks: st.tasks, notes: st.notes, categories: st.cats}, null, 1)], {type: 'application/json'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tasknotes-' + S.ymd(today()) + '.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
      sh.querySelector('#mdemo').addEventListener('click', () => { location.href = DEMO ? './' : './?demo=1'; });
      if (DEMO) return;
      sh.querySelector('#msync').addEventListener('click', () => { keep(); syncSheet(); });
      sh.querySelector('#mfp').addEventListener('click', async () => {
        if (window.LockUI.fingerOn()) { window.LockUI.fingerOff(); toast('👆 Fingerprint off'); settingsSheet(); return; }
        if (!window.LockUI.canFinger()) return;
        const ok = await window.LockUI.fingerAdd(); toast(ok ? '👆 Fingerprint on' : 'Cancelled. Nothing changed.'); settingsSheet();
      });
      sh.querySelector('#mpin').addEventListener('click', () => { closeSheet(); window.LockUI.changePin(); });
      sh.querySelector('#mcodes').addEventListener('click', () => confirmSheet('🔑 Make 10 new backup codes?', 'The old ones stop working.', 'Make new codes', () => window.LockUI.newCodes()));
      sh.querySelector('#mlock').addEventListener('click', () => { closeSheet(); lockVault(true); window.LockUI.lockNow(); });
    });
  }
  function confirmSheet(title, text, yes, fn, bad) {
    openSheet(`<h2>${esc(title)}</h2><p class="small">${esc(text)}</p><div class="btns"><button class="btn" id="cno" type="button">Cancel</button><button class="btn ${bad ? 'bad' : 'p'}" id="cyes" type="button">${esc(yes)}</button></div>`, sh => {
      sh.querySelector('#cno').addEventListener('click', closeSheet);
      sh.querySelector('#cyes').addEventListener('click', () => { closeSheet(); fn(); });
    });
  }
  function catsSheet() {
    openSheet(`<h2>🗂️ Categories</h2><div class="menu" style="gap:8px">${S.cats(st).map(c =>
      `<div class="catrow"><span class="dot" style="background:${col(c.colour)}"></span><span class="nm">${esc(c.emoji)} ${esc(c.name)}</span><button class="mini" data-ed="${esc(c.name)}">Edit</button></div>`).join('')}</div>
      <button class="btn" id="cadd" type="button">＋ Add a category</button><button class="btn p" id="cback" type="button">Done</button>`, sh => {
      sh.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => catSheet(b.dataset.ed)));
      sh.querySelector('#cadd').addEventListener('click', () => catSheet(null));
      sh.querySelector('#cback').addEventListener('click', () => { closeSheet(); render(); });
    });
  }
  function catSheet(name) {
    const c = name ? S.cat(st, name) : {name: '', emoji: '📁', colour: S.COLOURS[S.cats(st).length % S.COLOURS.length]};
    const emojis = ['📁', '🏠', '💼', '🤖', '💪', '🛒', '💰', '🚗', '👪', '📚', '🎮', '✈️', '🐶', '🌱', '🎨', '🔧'];
    openSheet(`<h2>${name ? 'Edit category' : 'New category'}</h2>
      <div class="field"><label for="cn">Name</label><input class="inp" id="cn" maxlength="24" value="${esc(c.name)}" autofocus></div>
      <div class="field"><span class="lbl">Icon</span><div class="chips" id="emchips">${emojis.map(e => `<button type="button" class="chip${e === c.emoji ? ' on' : ''}" data-v="${e}">${e}</button>`).join('')}</div></div>
      <div class="field"><span class="lbl">Colour</span><div class="colours" id="colchips">${S.COLOURS.map(x => `<button type="button" class="${x === c.colour ? 'on' : ''}" data-v="${x}" style="background:${x}" aria-label="Colour ${x}"></button>`).join('')}</div></div>
      <p class="small" id="cerr" hidden></p>
      <div class="btns">${name ? '<button class="btn" id="cdel" type="button">🗑️ Delete</button>' : ''}<button class="btn p" id="csave" type="button">Save</button></div>`, sh => {
      chipPick(sh, 'emchips');
      sh.querySelectorAll('#colchips button').forEach(b => b.addEventListener('click', () => sh.querySelectorAll('#colchips button').forEach(x => x.classList.toggle('on', x === b))));
      const err = t => { const e = sh.querySelector('#cerr'); e.textContent = t; e.hidden = false; };
      sh.querySelector('#csave').addEventListener('click', () => {
        const nn = sh.querySelector('#cn').value.trim();
        const emoji = picked(sh, 'emchips', 'v') || '📁';
        const pickedCol = (sh.querySelector('#colchips button.on') || {}).dataset?.v || c.colour;
        if (!nn) { err('Give it a name.'); return; }
        if (name) {
          if (!S.editCat(st, name, {name: nn, emoji, colour: pickedCol})) { err('There is already a category called ' + nn + '.'); return; }
          if (filter === name) filter = nn;
        } else {
          if (S.cat(st, nn)) { err('There is already a category called ' + nn + '.'); return; }
          S.addCat(st, nn, emoji, pickedCol);
        }
        save(); render(); catsSheet();
      });
      const d = sh.querySelector('#cdel');
      if (d) d.addEventListener('click', () => {
        if (S.cats(st).length <= 1) { err('You need at least one category.'); return; }
        const to = S.cats(st).find(x => x.name !== name).name;
        confirmSheet('Delete ' + name + '?', 'Its tasks and notes move to ' + to + '.', 'Delete', () => { S.removeCat(st, name); if (filter === name) filter = null; save(); render(); catsSheet(); }, true);
      });
    });
  }
  function syncSheet() {
    const c = Sync.config();
    openSheet(`<h2>☁️ Cloud sync</h2>
      <p class="small">Keeps a copy of everything in your Google Sheet, so Claude can see it too. Paste the two things from the Worker setup (see WORKER_SETUP.md).</p>
      <div class="field"><label for="yu">Worker address</label><input class="inp" id="yu" placeholder="https://tasknotes.yourname.workers.dev" value="${esc(c.url)}" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label for="yk">App key</label><input class="inp" id="yk" type="password" value="${esc(c.key)}" autocapitalize="off" spellcheck="false"></div>
      <p class="small" id="ymsg"></p>
      <div class="btns">${c.url ? '<button class="btn" id="yoff" type="button">Turn off</button>' : ''}<button class="btn p" id="ysave" type="button">Test and save</button></div>`, sh => {
      const msg = t => { sh.querySelector('#ymsg').textContent = t; };
      sh.querySelector('#ysave').addEventListener('click', async () => {
        const cfg = {url: sh.querySelector('#yu').value, key: sh.querySelector('#yk').value};
        if (!/^https:\/\//.test(cfg.url.trim())) { msg('The address should start with https://'); return; }
        msg('Testing…');
        try {
          const bad = await Sync.test(cfg);
          if (bad) { msg('😕 ' + bad); return; }
          Sync.setConfig(cfg);
          // first link: everything on this phone goes up once
          S.KINDS.forEach(k => (st[k] || []).forEach(r => { st.dirty[k + ':' + (k === 'cats' ? r.name : r.id)] = r.updated || new Date().toISOString(); }));
          save(true);
          msg('✅ Connected. Syncing…');
          await syncNow(true);
          closeSheet();
        } catch (e) { msg('😕 Could not reach it. Check the address and your internet.'); }
      });
      const off = sh.querySelector('#yoff');
      if (off) off.addEventListener('click', () => { Sync.setConfig({url: '', key: ''}); closeSheet(); render(); toast('☁️ Cloud sync off. Your data stays on this phone.'); });
    });
  }

  // ---------- 🔐 secrets ----------
  // Locked by default. The PIN opens it (every time); the key and the readable list live only in memory.
  // It locks again after 1 minute without a tap, when you leave the tab, or when the app goes to the background.
  const vault = {key: null, items: [], at: 0, busy: false, open: new Set()};   // open = cards showing their text
  const liveSecrets = () => st.secrets.filter(live);
  function lockVault(quiet) {
    if (!vault.key && !vault.items.length) return;
    vault.key = null; vault.items = []; vault.open.clear();
    if (!$('sheetwrap').hidden && $('sheet').querySelector('#xt')) closeSheet();
    if (!quiet && tab === 'secrets' && !$('app').hidden) render();
  }
  async function refreshVault(quiet) {
    if (!vault.key) return;
    const key = vault.key;
    const items = await Promise.all(liveSecrets().map(async r => {
      const o = await Vault.open(key, r.data);
      return Object.assign({id: r.id, created: r.created, bad: !o}, o || {title: "🔒 Can't open on this phone", text: ''});
    }));
    if (vault.key !== key) return;
    vault.items = items.sort((a, z) => a.title.localeCompare(z.title, 'en-GB', {sensitivity: 'base'}));
    if (tab === 'secrets' && (!quiet || $('sheetwrap').hidden)) render();
  }
  function vaultHtml() {
    const n = liveSecrets().length;
    if (!vault.key) {
      return `<div class="vault"><div class="vicon">🔐</div><b>${n} secret${n === 1 ? '' : 's'} locked away</b>
        <small id="vmsg">${DEMO ? 'Demo PIN: ' + Vault.DEMO_PIN : 'Type your PIN to open'}</small><div id="vpad" class="vpad"></div></div>`;
    }
    let h = `<div class="vbar"><button class="btn p" data-vadd="1" type="button">＋ New secret</button><button class="btn" data-vlock="1" type="button">🔒 Lock</button></div>`;
    h += `<h3 class="sec"><span>${vault.items.length} secret${vault.items.length === 1 ? '' : 's'}</span></h3>`;
    if (vault.items.length > 1) h = h.replace('</span></h3>', `</span><button data-vall="1">${vault.open.size ? 'Close all' : 'Open all'}</button></h3>`);
    h += vault.items.length ? vault.items.map(it => { const on = vault.open.has(it.id); return `<div class="sec-card${it.bad ? ' bad' : ''}${on ? ' on' : ''}">
        <div class="sh"><button class="stog" data-vtog="${esc(it.id)}" type="button" aria-expanded="${on}"><i>${on ? '▾' : '▸'}</i><b>${esc(it.title)}</b></button>${it.bad ? '' : `<button class="mini" data-vcopy="${esc(it.id)}" type="button">📋 Copy</button>`}<button class="mini" data-vedit="${esc(it.id)}" type="button">${it.bad ? '🗑️' : '✏️'}</button></div>
        ${on && it.text ? `<div class="stx">${esc(it.text)}</div>` : ''}</div>`; }).join('')
      : '<div class="empty">Nothing here yet. Tap ＋ New secret 👆</div>';
    h += '<p class="small vfoot">Scrambled with your PIN before it leaves the phone. The Sheet and Claude only see gibberish.</p>';
    return h;
  }
  function vaultPad() {
    const box = $('vpad');
    if (!box) return;
    let pin = '';
    const dots = document.createElement('div'); dots.className = 'dots';
    for (let i = 0; i < 6; i++) dots.appendChild(document.createElement('i'));
    const draw = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const grid = document.createElement('div'); grid.className = 'pad';
    const msg = t => { const m = $('vmsg'); if (m) { m.textContent = t; m.classList.add('err'); } };
    const press = async k => {
      if (vault.busy) return;
      if (k === 'del') { pin = pin.slice(0, -1); draw(); return; }
      if (pin.length >= 6) return;
      pin += k; draw();
      if (pin.length < 6) return;
      vault.busy = true;
      try {
        const r = DEMO ? (pin === Vault.DEMO_PIN ? {key: await Vault.demoKey()} : {err: 'Wrong PIN. The demo PIN is ' + Vault.DEMO_PIN + '.'})
                       : await window.LockUI.vault(pin);
        if (r.key) { vault.key = r.key; vault.at = Date.now(); await refreshVault(); return; }
        pin = ''; draw(); dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); msg(r.err);
      } finally { vault.busy = false; }
    };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].forEach(k => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = k === 'del' ? '⌫' : k; b.setAttribute('aria-label', k === 'del' ? 'Delete' : k || 'blank');
      if (!k) b.disabled = true;
      if (k === 'del') b.classList.add('ic');
      b.addEventListener('click', () => press(k));
      grid.appendChild(b);
    });
    box.append(dots, grid);
    vault.press = press;
  }
  document.addEventListener('keydown', e => {
    if (tab !== 'secrets' || vault.key || !$('vpad') || !$('sheetwrap').hidden || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (/^[0-9]$/.test(e.key)) vault.press(e.key); else if (e.key === 'Backspace') vault.press('del');
  });
  ['pointerdown', 'keydown', 'input'].forEach(ev => document.addEventListener(ev, () => { if (vault.key) vault.at = Date.now(); }, true));
  setInterval(() => { if (vault.key && Date.now() - vault.at > Vault.IDLE_MS) lockVault(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') lockVault(); });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* no */ } t.remove(); return ok;
    }
  }
  function secretSheet(id) {
    if (!vault.key) return;
    const it = id ? vault.items.find(x => x.id === id) : {title: '', text: ''};
    if (!it) return;
    if (it.bad) {
      confirmSheet('Delete this secret?', 'It was made on another phone, so this phone cannot open it.', 'Delete', () => {
        S.remove(st, 'secrets', id, 'you'); save(); refreshVault(); }, true);
      return;
    }
    openSheet(`<h2>${id ? '✏️ Edit secret' : '🔐 New secret'}</h2>
      <div class="field"><label for="xt">Name</label><input class="inp" id="xt" maxlength="60" value="${esc(it.title)}" placeholder="e.g. Bike lock code" autofocus autocomplete="off"></div>
      <div class="field"><label for="xx">Secret</label><textarea class="inp" id="xx" placeholder="The thing you want hidden" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(it.text)}</textarea></div>
      <p class="small" id="xerr" hidden></p>
      <div class="btns">${id ? '<button class="btn" id="xdel" type="button">🗑️ Delete</button>' : ''}<button class="btn p" id="xsave" type="button">Save</button></div>`, sh => {
      sh.querySelector('#xsave').addEventListener('click', async () => {
        const title = sh.querySelector('#xt').value.trim(), text = sh.querySelector('#xx').value;
        if (!title) { sh.querySelector('#xt').focus(); return; }
        if (!vault.key) { closeSheet(); return; }
        const data = await Vault.seal(vault.key, {title, text});
        if (id) S.edit(st, 'secrets', id, {data}); else S.addSecret(st, data);
        save(); closeSheet(); await refreshVault(); toast('🔐 Saved and scrambled');
      });
      const d = sh.querySelector('#xdel');
      if (d) d.addEventListener('click', () => {
        S.remove(st, 'secrets', id, 'you'); save(); closeSheet(); refreshVault();
        toast('🗑️ Deleted: ' + it.title.slice(0, 24), () => { S.undelete(st, 'secrets', id); save(); refreshVault(); });
      });
    });
  }
  // demo: two made-up secrets, scrambled with the demo key
  if (DEMO && !st.secrets.length) {
    Vault.demoKey().then(async k => {
      for (const o of [{title: 'Bike lock', text: '4 7 1 9'}, {title: 'Wi-Fi at mum\'s', text: 'Network: Fawcett-Home\nPassword: blue-kettle-42'}]) S.addSecret(st, await Vault.seal(k, o));
      st.dirty = {}; save(true); if (tab === 'secrets') render();
    });
  }

  // ---------- sync ----------
  let syncing = false, syncErr = '';
  async function syncNow(loud) {
    if (DEMO || syncing || !Sync.ready()) return;
    if (!navigator.onLine) { if (loud) toast('📴 Offline. Changes will sync later.'); return; }
    syncing = true; if (!$('app').hidden) render();
    try {
      const r = await Sync.run(st);
      syncErr = '';
      S.purge(st, Date.now());
      save(true);
      if (vault.key) await refreshVault(true);
      if (loud) toast('🔄 Synced' + (r.sent ? ' · sent ' + r.sent : ''));
    } catch (e) {
      syncErr = e.message || 'Sync failed';
      if (loud) toast('😕 ' + syncErr);
    } finally { syncing = false; render(); }
  }
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });

  // ---------- 🎉 updates ----------
  // version.json on the site says the newest version. If it is newer than this copy, a pop-up offers to update.
  // "Update now" asks the service worker to fetch the new files, then reloads the page.
  let updSkip = '';
  async function checkUpdate() {
    if (!navigator.onLine) return;
    try {
      const j = await (await fetch('version.json?t=' + Date.now(), {cache: 'no-store'})).json();
      const want = String(DEMO ? j.demo : j.version || ''), have = DEMO ? DEMO_VERSION : VERSION;
      if (!want || Number(want) <= Number(have) || updSkip === want) return;
      $('updh').textContent = '🎉 New update: ' + (DEMO ? 'demo.v.' : 'v.') + want;
      $('updn').textContent = j.notes || 'Tap to get the newest version.';
      $('upd').hidden = false; $('upd').dataset.v = want;
    } catch (e) { /* offline or no file: try later */ }
  }
  $('updx').addEventListener('click', () => { updSkip = $('upd').dataset.v; $('upd').hidden = true; });
  $('updgo').addEventListener('click', async () => {
    $('updgo').disabled = true; $('updgo').textContent = 'Updating…';
    save(true);
    const reload = () => location.reload();
    try {
      const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
      if (reg) {
        navigator.serviceWorker.addEventListener('controllerchange', reload);
        await reg.update();
        setTimeout(reload, 6000);                     // the new files may already be in: reload anyway
        return;
      }
    } catch (e) { /* reload below */ }
    reload();
  });
  setTimeout(checkUpdate, 3000);
  setInterval(checkUpdate, 10 * 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });

  // ---------- start ----------
  applyLook();
  S.purge(st, Date.now());
  if (DEMO) $('demobar').hidden = false;
  let started = false;
  function onEnter() {
    $('app').hidden = false;
    render();
    if (!started) { started = true; syncNow(); }
  }
  window.LockUI.start({
    app: 'TaskNotes', prefix: 'tn', demo: DEMO,
    name: () => st.settings.name || '',
    setName: n => { st.settings.name = String(n || '').trim().slice(0, 20); save(true); },
    onEnter
  });
  if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
