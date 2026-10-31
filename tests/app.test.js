// node --test tests/   (node 22, no installs)
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../docs/store.js');
const Lock = require('../docs/lock.js');

const SAT = new Date('2026-10-31T10:00:00');

test('quick add reads time, day and category', () => {
  const s = S.starter();
  const q = S.parseQuick('Call mum 20m tomorrow #home', s, SAT);
  assert.equal(q.title, 'Call mum');
  assert.equal(q.mins, 20);
  assert.equal(q.due, '2026-11-01');
  assert.equal(q.category, 'Home');
  const q2 = S.parseQuick('Gym 1.5h mon #ai', s, SAT);
  assert.equal(q2.mins, 90); assert.equal(q2.due, '2026-11-02'); assert.equal(q2.category, 'AI Lab');
  const q3 = S.parseQuick('Buy #milk', s, SAT);       // unknown category stays in the text
  assert.equal(q3.title, 'Buy #milk'); assert.equal(q3.category, '');
});

test('buckets and labels', () => {
  assert.equal(S.bucket('2026-10-30', SAT), 'Overdue');
  assert.equal(S.bucket('2026-10-31', SAT), 'Today');
  assert.equal(S.bucket('2026-11-01', SAT), 'Tomorrow');
  assert.equal(S.bucket('2026-11-05', SAT), 'This week');
  assert.equal(S.bucket('2026-12-25', SAT), 'Later');
  assert.equal(S.bucket('', SAT), 'No date');
  assert.equal(S.fmtMins(90), '1h 30m'); assert.equal(S.fmtMins(15), '15m'); assert.equal(S.fmtMins(0), '');
});

test('add, tick, flag and soft delete mark rows dirty', () => {
  const s = S.starter(); s.dirty = {};
  const t = S.addTask(s, {title: 'A', category: 'work', estimate_mins: 15});
  assert.equal(t.category, 'Work');
  S.tick(s, t.id); assert.equal(t.done, true); assert.ok(t.done_at);
  const n = S.addNote(s, {text: 'idea'});
  S.flag(s, n.id); assert.equal(n.review_later, true);
  S.remove(s, 'tasks', t.id, 'claude'); assert.ok(S.pendingDelete(t));
  S.undelete(s, 'tasks', t.id); assert.ok(S.live(t));
  assert.equal(S.outboxCount(s), 2);
});

test('purge drops rows deleted over 7 days ago', () => {
  const s = S.starter();
  const t = S.addTask(s, {title: 'old'}); S.remove(s, 'tasks', t.id, 'claude');
  t.deleted_at = new Date(Date.now() - 8 * S.DAY).toISOString();
  const k = S.addTask(s, {title: 'keep'}); S.remove(s, 'tasks', k.id, 'you');
  assert.equal(S.purge(s, Date.now()), 1);
  assert.equal(s.tasks.length, 1);
});

test('rename a category moves its tasks', () => {
  const s = S.starter();
  const t = S.addTask(s, {title: 'x', category: 'Home'});
  S.editCat(s, 'Home', {name: 'House'});
  assert.equal(t.category, 'House');
  assert.ok(S.cat(s, 'House')); assert.equal(S.cat(s, 'Home'), undefined);
  S.removeCat(s, 'House'); assert.equal(t.category, 'Work');
});

test('merge keeps rows changed during a sync and clears sent ones', () => {
  const s = S.starter(); s.dirty = {};
  const a0 = S.addTask(s, {title: 'a'});
  const sent = S.outbox(s);
  const snap = {tasks: [Object.assign({}, sent.tasks[0]), {id: 't_cloud', title: 'from claude', updated: '2026-01-01T00:00:00Z'}], notes: [], cats: s.cats};
  S.merge(s, sent, snap);
  assert.equal(S.outboxCount(s), 0);
  assert.equal(s.tasks.length, 2);
  // a change made after sending stays local and dirty
  const sent2 = S.outbox(s);
  const a = s.tasks.find(x => x.id === a0.id);
  a.title = 'a2'; a.updated = '2099-01-01T00:00:00Z'; s.dirty['tasks:' + a.id] = a.updated;
  S.merge(s, sent2, {tasks: [Object.assign({}, a, {title: 'a', updated: '2026-01-02T00:00:00Z'})], notes: [], cats: s.cats});
  assert.equal(s.tasks.find(x => x.id === a.id).title, 'a2');
  assert.equal(S.outboxCount(s), 1);
});

test('demo data is clean', () => {
  const s = S.demo(SAT);
  assert.ok(s.tasks.length > 5 && s.notes.length > 3);
  assert.equal(S.outboxCount(s), 0);
  assert.equal(s.tasks.filter(S.pendingDelete).length, 1);
});

test('shared lock: PIN, backup codes, wrong tries', async () => {
  assert.match(Lock.pinProblem('123456', '123456'), /too easy/);
  assert.equal(Lock.pinProblem('482916', '482916'), '');
  const codes = Lock.makeCodes();
  const rec = await Lock.create('482916', codes);
  assert.equal(await Lock.checkPin(rec, '482916'), true);
  assert.equal(await Lock.checkPin(rec, '000000'), false);
  assert.equal(await Lock.useCode(rec, codes[3].toUpperCase()), 3);
  assert.equal(await Lock.findCode(rec, codes[3]), -1);
  assert.equal(Lock.codesLeft(rec), 9);
  for (let i = 0; i < 5; i++) Lock.fail(rec, 1000);
  assert.ok(Lock.lockedUntil(rec, 2000) > 0);
});

test('🔐 secrets: scrambled, only the right key opens them, and they sync like other rows', async () => {
  const V = require('../docs/vault.js');
  const key = await V.keyFrom(crypto.getRandomValues(new Uint8Array(32)));
  const other = await V.keyFrom(crypto.getRandomValues(new Uint8Array(32)));
  const data = await V.seal(key, {title: 'Bike lock', text: '4719'});
  assert.match(data, /^v1\./);
  assert.ok(!data.includes('Bike') && !data.includes('4719'));
  assert.deepEqual(await V.open(key, data), {title: 'Bike lock', text: '4719'});
  assert.equal(await V.open(other, data), null);
  assert.equal(await V.open(key, 'rubbish'), null);

  const s = S.starter(); s.dirty = {};
  const r = S.addSecret(s, data);
  assert.equal(S.outbox(s).secrets.length, 1);
  // an older Worker that does not send secrets back must not wipe them
  S.merge(s, S.outbox(s), {tasks: [], notes: [], cats: s.cats});
  assert.equal(s.secrets.length, 1);
  // a new Worker echoes it back: now it is synced
  S.merge(s, S.outbox(s), {tasks: [], notes: [], cats: s.cats, secrets: [Object.assign({}, r)]});
  assert.equal(S.outboxCount(s), 0);
  // an old saved state with no secrets list still works
  const old = S.starter(); delete old.secrets;
  assert.equal(S.outbox(old).secrets.length, 0);
});

test('🔐 the secrets key comes from the lock, so the same lock gives the same key', async () => {
  const V = require('../docs/vault.js');
  const rec = await Lock.create('482915', Lock.makeCodes());
  const mb = () => Uint8Array.from(atob(rec.mb), c => c.charCodeAt(0));
  const data = await V.seal(await V.keyFrom(mb()), {title: 'PIN for the shed', text: '1066'});
  assert.equal((await V.open(await V.keyFrom(mb()), data)).text, '1066');
});
