// ⏰ alarms: push encryption, VAPID signing, alarm times. node --test (node 22, no installs)
import test from 'node:test';
import assert from 'node:assert/strict';
import {encrypt, vapidKeys, vapidHeader, b64u, unb64u} from '../src/push.js';
import {alarmAt, dueAlarms, normalTime, runTool, fromValues} from '../src/data.js';
import {runAlarms} from '../src/index.js';

const te = new TextEncoder();
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach(x => { o.set(x, i); i += x.length; }); return o; };

// a pretend phone: makes keys and can open what the Worker sends
async function phone() {
  const kp = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  return {p256dh: b64u(pub), auth: b64u(auth), async open(body) {
    const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
    const as = await crypto.subtle.importKey('raw', asPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: as}, kp.privateKey, 256));
    const ikm = await hmac(await hmac(auth, shared), cat(te.encode('WebPush: info\0'), pub, asPub, new Uint8Array([1])));
    const prk = await hmac(salt, ikm);
    const cek = (await hmac(prk, cat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
    const nonce = (await hmac(prk, cat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: nonce}, key, ct));
    assert.equal(plain[plain.length - 1], 2);
    return new TextDecoder().decode(plain.slice(0, -1));
  }};
}

test('push message: the phone can open it', async () => {
  const p = await phone();
  const body = await encrypt('{"title":"⏰ Book MOT"}', p.p256dh, p.auth);
  assert.deepEqual([...body.slice(16, 20)], [0, 0, 16, 0]);
  assert.equal(await p.open(body), '{"title":"⏰ Book MOT"}');
});

test('push key: same secret = same key, and its signature checks out', async () => {
  const a = await vapidKeys('secret-one'), b = await vapidKeys('secret-one'), c = await vapidKeys('secret-two');
  assert.equal(a.publicKey, b.publicKey);
  assert.notEqual(a.publicKey, c.publicKey);
  assert.equal(unb64u(a.publicKey).length, 65);
  const hdr = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', a, 1800000000);
  const [, jwt, k] = hdr.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, a.publicKey);
  const [h, body, sig] = jwt.split('.');
  assert.equal(JSON.parse(new TextDecoder().decode(unb64u(body))).aud, 'https://fcm.googleapis.com');
  const pub = await crypto.subtle.importKey('raw', unb64u(a.publicKey), {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']);
  assert.ok(await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, pub, unb64u(sig), te.encode(h + '.' + body)));
});

test('alarm times follow UK time (GMT and BST)', () => {
  assert.equal(new Date(alarmAt('2026-11-18', '09:30', 'Europe/London')).toISOString(), '2026-11-18T09:30:00.000Z');
  assert.equal(new Date(alarmAt('2026-07-01', '09:30', 'Europe/London')).toISOString(), '2026-07-01T08:30:00.000Z');
  assert.equal(normalTime('9:05'), '09:05');
  assert.equal(normalTime('09:05:00'), '09:05');
  assert.equal(normalTime('9pm'), '21:00');
  assert.equal(normalTime('25:00'), '');
  assert.equal(normalTime('15'), '');
});

test('due alarms: only open tasks in that minute', () => {
  const snap = {tasks: [
    {id: 't1', title: 'A', due: '2026-11-18', time: '09:30', done: false, deleted_at: ''},
    {id: 't2', title: 'B', due: '2026-11-18', time: '09:31', done: false, deleted_at: ''},
    {id: 't3', title: 'C', due: '2026-11-18', time: '09:30', done: true, deleted_at: ''},
    {id: 't4', title: 'D', due: '2026-11-18', time: '', done: false, deleted_at: ''},
  ]};
  const at = Date.parse('2026-11-18T09:30:00Z');
  assert.deepEqual(dueAlarms(snap, at - 60000, at, 'Europe/London').map(t => t.id), ['t1']);
});

test('Claude can set and clear an alarm', () => {
  const snap = {tasks: [], notes: [], cats: [{name: 'Home', deleted_at: ''}]};
  const r = runTool(snap, 'add_task', {title: 'Bins out', time: '7pm'}, 'Europe/London');
  assert.match(r.text, /⏰ 19:00/);
  assert.equal(snap.tasks[0].due.length, 10);                 // no date given = today
  runTool(snap, 'edit_task', {id: snap.tasks[0].id, time: 'none'}, 'Europe/London');
  assert.equal(snap.tasks[0].time, '');
  assert.throws(() => runTool(snap, 'edit_task', {id: snap.tasks[0].id, time: 'soon'}, 'Europe/London'), /could not read the time/);
  assert.equal(fromValues('tasks', [['id', 'title', 'time'], ['t9', 'X', '18:15:00']])[0].time, '18:15');
});

test('every minute: sends due alarms to each phone, drops a phone that has gone', async () => {
  const p = await phone(), keys = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign']);
  const pk = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
  const env = {SHEET_ID: 's', TZ: 'Europe/London', TOKEN_SECRET: 'x-secret',
    GOOGLE_SERVICE_ACCOUNT: JSON.stringify({client_email: 'r@x', private_key: `-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----\n`})};
  const sheet = {
    Tasks: [['id', 'title', 'category', 'due', 'done', 'time'], ['t1', 'Book MOT', 'Home', '2026-11-18', 'FALSE', '09:30']],
    Devices: [['id', 'endpoint', 'p256dh', 'auth'], ['d1', 'https://push.example/good', p.p256dh, p.auth], ['d2', 'https://push.example/gone', p.p256dh, p.auth]],
  };
  const pushed = []; let wrote = null;
  const ok = o => new Response(JSON.stringify(o), {status: 200});
  const fake = async (url, opts = {}) => {
    url = String(url);
    if (url.startsWith('https://oauth2.googleapis.com')) return ok({access_token: 'g', expires_in: 3600});
    if (url.includes('values:batchGet')) return ok({valueRanges: new URL(url).searchParams.getAll('ranges').map(r => ({values: sheet[r.split('!')[0]]}))});
    if (url.includes('values:batchUpdate')) { wrote = JSON.parse(opts.body).data.find(d => d.range.startsWith('Devices')).values; return ok({}); }
    if (url.includes('values:batchClear')) return ok({});
    if (url.startsWith('https://push.example/')) { pushed.push({url, msg: JSON.parse(await p.open(new Uint8Array(opts.body)))}); return new Response('', {status: url.endsWith('gone') ? 410 : 201}); }
    return new Response('{}', {status: 404});
  };
  const r = await runAlarms(env, Date.parse('2026-11-18T09:30:00Z'), fake);
  assert.deepEqual(r, {sent: 1, gone: 1});
  assert.equal(pushed[0].msg.title, '⏰ Book MOT');
  assert.ok(wrote.find(row => row[0] === 'd2')[8], 'the gone phone is marked deleted');
  pushed.length = 0;
  assert.deepEqual(await runAlarms(env, Date.parse('2026-11-18T09:31:00Z'), fake), {sent: 0});
  assert.equal(pushed.length, 0);
});
