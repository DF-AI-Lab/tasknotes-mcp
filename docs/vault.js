/* TaskNotes 🔐 Secrets - scrambling (WebCrypto only, works in the browser and node 22).
   The key comes from this phone's lock key (HKDF), so only your PIN opens it. Each secret is {title, text}
   scrambled with AES-GCM into one string "v1.<iv>.<data>". That string is all the Sheet (and Claude) ever sees. */
(function (root) {
  'use strict';
  const subtle = () => globalThis.crypto.subtle, enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = bytes => { let s = ''; bytes = new Uint8Array(bytes); for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); };
  const unb64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));

  async function keyFrom(bytes) {
    const base = await subtle().importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
    return subtle().deriveKey({name: 'HKDF', hash: 'SHA-256', salt: enc.encode('tasknotes'), info: enc.encode('secrets-v1')}, base,
      {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  async function seal(key, obj) {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle().encrypt({name: 'AES-GCM', iv}, key, enc.encode(JSON.stringify({title: String(obj.title || ''), text: String(obj.text || '')})));
    return 'v1.' + b64(iv) + '.' + b64(ct);
  }
  async function open(key, data) {                       // {title, text}, or null (wrong key / another phone / broken)
    try {
      const [v, iv, ct] = String(data || '').split('.');
      if (v !== 'v1') return null;
      const o = JSON.parse(dec.decode(await subtle().decrypt({name: 'AES-GCM', iv: unb64(iv)}, key, unb64(ct))));
      return {title: String(o.title || ''), text: String(o.text || '')};
    } catch (e) { return null; }
  }
  const demoKey = () => keyFrom(enc.encode('tasknotes-demo-only-not-a-secret'));
  const DEMO_PIN = '135790';

  const Vault = {keyFrom, seal, open, demoKey, DEMO_PIN, IDLE_MS: 60000};
  if (typeof module !== 'undefined' && module.exports) module.exports = Vault;
  else root.Vault = Vault;
})(typeof window !== 'undefined' ? window : globalThis);
