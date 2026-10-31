/* DF AI Lab shared lock (copied from Where's My Money? Lite lock.js, so every app can reuse it).
   Passcode, 10 backup codes, scrambled backup file. WebCrypto only (browser + node 22). No server, so this is a
   screen lock: one random key (mb) is wrapped once by the passcode and once by each backup code (PBKDF2 -> AES-GCM).
   The record holds only those wrapped copies, never the passcode or the codes.
   The backup file holds the data encrypted with mb, plus the same wrapped copies, so the passcode or any unused code opens it. */
(function (root) {
  'use strict';
  const ITER = 100000, IDLE_MS = 5 * 60 * 1000, MAX_TRIES = 5, LOCK_MS = 15 * 60 * 1000;
  const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789';            // no 0/o/1/l/i look-alikes
  const subtle = () => globalThis.crypto.subtle;
  const enc = new TextEncoder(), dec = new TextDecoder();

  const b64 = bytes => { let s = ''; bytes = new Uint8Array(bytes); for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };
  const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const random = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

  function makeCodes() {
    const out = new Set();
    while (out.size < 10) {
      const r = random(8);
      let c = '';
      for (let i = 0; i < 8; i++) { if (i === 4) c += '-'; c += LETTERS[r[i] % LETTERS.length]; }
      out.add(c);
    }
    return [...out];
  }
  const secretOf = text => String(text == null ? '' : text).toLowerCase().replace(/[^a-z0-9]/g, '');

  // same words as live
  function pinProblem(pin, again) {
    if (!/^\d{6}$/.test(String(pin))) return 'The passcode must be 6 numbers.';
    if (pin !== again) return 'The two passcodes are not the same. Try again.';
    if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'That passcode is too easy to guess. Pick another.';
    return '';
  }

  // ---------- wrapping the master key ----------
  async function keyFrom(secret, salt, iter) {
    const base = await subtle().importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter}, base,
                              {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  async function wrap(secret, mbBytes, iter) {
    const salt = random(16), iv = random(12);
    const ct = await subtle().encrypt({name: 'AES-GCM', iv}, await keyFrom(secret, salt, iter), mbBytes);
    return {salt: b64(salt), iv: b64(iv), ct: b64(ct)};
  }
  async function unwrap(w, secret, iter) {                      // the master key bytes, or null
    try {
      const raw = await subtle().decrypt({name: 'AES-GCM', iv: unb64(w.iv)}, await keyFrom(secret, unb64(w.salt), iter), unb64(w.ct));
      return new Uint8Array(raw);
    } catch (e) { return null; }
  }
  const mbOf = rec => unb64(rec.mb);

  async function create(pin, codes) {
    const mb = random(32);
    const rec = {v: 1, iter: ITER, mb: b64(mb), pin: await wrap(pin, mb, ITER), codes: [], passkeys: [], fails: {count: 0, until: 0}};
    await newCodes(rec, codes);
    return rec;
  }
  async function checkPin(rec, pin) {
    if (!pin || !rec || !rec.pin) return false;
    const mb = await unwrap(rec.pin, String(pin), rec.iter);
    return !!mb && b64(mb) === rec.mb;
  }
  async function findCode(rec, text) {                           // index of the first unused code that fits (nothing changes), else -1
    const secret = secretOf(text);
    if (!secret) return -1;
    const hits = await Promise.all(rec.codes.map(async c => {
      if (c.used) return false;
      const mb = await unwrap(c, secret, rec.iter);
      return !!mb && b64(mb) === rec.mb;
    }));
    return hits.indexOf(true);
  }
  async function useCode(rec, text) {                            // findCode, and that code is used up
    const i = await findCode(rec, text);
    if (i >= 0) rec.codes[i].used = true;
    return i;
  }
  const codesLeft = rec => rec.codes.filter(c => !c.used).length;
  async function setPin(rec, pin) { rec.pin = await wrap(pin, mbOf(rec), rec.iter); return rec; }
  async function newCodes(rec, codes) {
    const mb = rec.mb ? mbOf(rec) : null;
    rec.codes = [];
    for (const c of codes) rec.codes.push(Object.assign(await wrap(secretOf(c), mb, rec.iter), {used: false}));
    return rec;
  }

  // ---------- wrong tries: 5 = locked for 15 minutes ----------
  function fail(rec, nowMs) {
    const f = rec.fails || (rec.fails = {count: 0, until: 0});
    if (f.until && nowMs >= f.until) { f.count = 0; f.until = 0; }
    f.count += 1;
    if (f.count >= MAX_TRIES) rec.fails = {count: 0, until: nowMs + LOCK_MS};
  }
  const lockedUntil = (rec, nowMs) => (rec && rec.fails && rec.fails.until && nowMs < rec.fails.until) ? rec.fails.until : 0;
  const ok = rec => { rec.fails = {count: 0, until: 0}; };

  // 'setup' = a new person, 'unlock' = just opened or 5 minutes without use, else null
  function needs(rec, stampMs, nowMs) {
    if (!rec) return 'setup';
    if (!stampMs || nowMs - stampMs > IDLE_MS) return 'unlock';
    return null;
  }

  // ---------- the scrambled backup file ----------
  async function seal(rec, state) {
    const mb = mbOf(rec), iv = random(12);
    const key = await subtle().importKey('raw', mb, 'AES-GCM', false, ['encrypt']);
    const data = await subtle().encrypt({name: 'AES-GCM', iv}, key, enc.encode(JSON.stringify(state)));
    const keys = [Object.assign({kind: 'pin'}, rec.pin)];
    rec.codes.filter(c => !c.used).forEach(c => keys.push({kind: 'code', salt: c.salt, iv: c.iv, ct: c.ct}));
    return {v: 1, iter: rec.iter, iv: b64(iv), data: b64(data), keys};
  }
  async function open(sealed, secret) {                         // the state, or null for anything wrong
    try {
      if (!sealed || !Array.isArray(sealed.keys)) return null;
      secret = String(secret == null ? '' : secret);
      for (const k of sealed.keys) {
        const mb = await unwrap(k, k.kind === 'pin' ? secret : secretOf(secret), sealed.iter);
        if (!mb) continue;
        const key = await subtle().importKey('raw', mb, 'AES-GCM', false, ['decrypt']);
        const plain = await subtle().decrypt({name: 'AES-GCM', iv: unb64(sealed.iv)}, key, unb64(sealed.data));
        return JSON.parse(dec.decode(plain));
      }
    } catch (e) { /* tampered or wrong */ }
    return null;
  }

  // v0.45 🔁 sync: a copy from this device's own key (no passcode asked), and linking to another device's key
  async function openWith(rec, sealed) {                        // the state, or null (another device's key)
    try {
      const key = await subtle().importKey('raw', mbOf(rec), 'AES-GCM', false, ['decrypt']);
      const plain = await subtle().decrypt({name: 'AES-GCM', iv: unb64(sealed.iv)}, key, unb64(sealed.data));
      return JSON.parse(dec.decode(plain));
    } catch (e) { return null; }
  }
  async function adopt(sealed, secret) {                        // {state, mb, pin, codes, iter} of the other device, or null
    try {
      secret = String(secret == null ? '' : secret);
      for (const k of sealed.keys) {
        const mb = await unwrap(k, k.kind === 'pin' ? secret : secretOf(secret), sealed.iter);
        if (!mb) continue;
        const key = await subtle().importKey('raw', mb, 'AES-GCM', false, ['decrypt']);
        const plain = await subtle().decrypt({name: 'AES-GCM', iv: unb64(sealed.iv)}, key, unb64(sealed.data));
        const strip = x => ({salt: x.salt, iv: x.iv, ct: x.ct});
        return {state: JSON.parse(dec.decode(plain)), mb: b64(mb), iter: sealed.iter,
                pin: strip(sealed.keys.find(x => x.kind === 'pin')),
                codes: sealed.keys.filter(x => x.kind === 'code').map(x => Object.assign(strip(x), {used: false}))};
      }
    } catch (e) { /* tampered or wrong */ }
    return null;
  }

  const Lock = {ITER, IDLE_MS, MAX_TRIES, LOCK_MS, makeCodes, secretOf, pinProblem, create, checkPin, findCode, useCode, codesLeft,
                setPin, newCodes, fail, lockedUntil, ok, needs, seal, open, openWith, adopt};
  if (typeof module !== 'undefined' && module.exports) module.exports = Lock;
  else root.Lock = Lock;
})(typeof window !== 'undefined' ? window : globalThis);
