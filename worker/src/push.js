// TaskNotes Worker - ⏰ phone alarms by Web Push (no libraries: Web Crypto only).
//   vapidKeys(secret)   the Worker's push key pair, worked out from TOKEN_SECRET (so no new secret is needed).
//                       Changing TOKEN_SECRET changes the key; the app notices and signs up again.
//   sendPush(sub, data) encrypts `data` for one phone (RFC 8291, aes128gcm) and sends it, signed (RFC 8292, VAPID).
const te = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach(x => { o.set(x, i); i += x.length; }); return o; };
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// ---------- P-256 maths (only to turn the private number into its public point) ----------
const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const A = P - 3n;
const G = [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n];
const mod = (a, m = P) => ((a % m) + m) % m;
function inv(a) { let [x, y, u, v] = [mod(a), P, 1n, 0n]; while (x !== 1n) { const q = y / x; [x, y] = [y - q * x, x]; [u, v] = [v - q * u, u]; } return mod(u); }
function add(p, q) {
  if (!p) return q; if (!q) return p;
  if (p[0] === q[0] && mod(p[1] + q[1]) === 0n) return null;
  const l = p[0] === q[0] ? mod((3n * p[0] * p[0] + A) * inv(2n * p[1])) : mod((q[1] - p[1]) * inv(q[0] - p[0]));
  const x = mod(l * l - p[0] - q[0]);
  return [x, mod(l * (p[0] - x) - p[1])];
}
function mul(k, pt) { let r = null; while (k > 0n) { if (k & 1n) r = add(r, pt); pt = add(pt, pt); k >>= 1n; } return r; }
const big = u8 => BigInt('0x' + [...u8].map(b => b.toString(16).padStart(2, '0')).join(''));
const bytes32 = n => Uint8Array.from(n.toString(16).padStart(64, '0').match(/../g), h => parseInt(h, 16));

const keyCache = new Map();
export async function vapidKeys(secret) {
  if (!secret) throw new Error('TOKEN_SECRET is not set, so alarms cannot be signed.');
  if (keyCache.has(secret)) return keyCache.get(secret);
  const d = mod(big(await hmac(te.encode(secret), te.encode('tasknotes vapid key v1'))), N - 1n) + 1n;
  const [x, y] = mul(d, G);
  const jwk = {kty: 'EC', crv: 'P-256', d: b64u(bytes32(d)), x: b64u(bytes32(x)), y: b64u(bytes32(y)), ext: true};
  const out = {publicKey: b64u(cat(new Uint8Array([4]), bytes32(x), bytes32(y))), jwk,
    privateKey: await crypto.subtle.importKey('jwk', jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign'])};
  keyCache.set(secret, out);
  return out;
}

// the signed "this push is from TaskNotes" ticket (VAPID JWT, ES256)
export async function vapidHeader(endpoint, keys, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64u(te.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const body = b64u(te.encode(JSON.stringify({aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: 'https://df-ai-lab.github.io/tasknotes-mcp/'})));
  const sig = await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, keys.privateKey, te.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

// lock the message so only that phone can read it (RFC 8291)
export async function encrypt(payload, p256dh, auth, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const uaPub = unb64u(p256dh), secret = unb64u(auth);
  const eph = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: ua}, eph.privateKey, 256));
  const ikm = await hmac(await hmac(secret, shared), cat(te.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, key, cat(te.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}

// send one alarm. Returns the push service's status (201 = sent, 404/410 = that phone has gone)
export async function sendPush(sub, data, secret, fetcher = fetch) {
  const keys = await vapidKeys(secret);
  const body = await encrypt(JSON.stringify(data), sub.p256dh, sub.auth);
  const r = await fetcher(sub.endpoint, {method: 'POST', body, headers: {
    Authorization: await vapidHeader(sub.endpoint, keys), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
    TTL: '3600', Urgency: 'high', Topic: String(data.tag || 'tasknotes').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'tasknotes'}});
  return r.status;
}
