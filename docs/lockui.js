/* DF AI Lab shared lock screen (PIN pad version). Uses lock.js.
   Same rules as Where's My Money? Lite: a 6-number PIN, 10 backup codes, a fingerprint (passkey) on this phone,
   5 wrong tries = locked for 15 minutes, locks again after 5 minutes without use.
   NOTE: a screen lock. It keeps out a person holding the phone, not someone with developer tools.
   Any app can use it:
     LockUI.start({app: 'TaskNotes', prefix: 'tn', demo: false, name: () => 'Darren', setName: n => ..., onEnter: () => ...})
   The page needs: #lock, #lockhi, #lockmsg, #lockbody, and html.lockon hiding the app. */
(function (root) {
  'use strict';
  const L = root.Lock;
  let o = null, rec = null, busy = false;
  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  const K = () => ({rec: o.prefix + '_lock_v1', stamp: o.prefix + '_unlock'});

  // ---------- the record and the "unlocked at" stamp ----------
  function load() { try { const t = root.localStorage.getItem(K().rec); const r = t && JSON.parse(t); return r && r.v === 1 ? r : null; } catch (e) { return null; } }
  function save() { try { root.localStorage.setItem(K().rec, JSON.stringify(rec)); } catch (e) { /* private window */ } }
  function stamp() { try { return Number(root.sessionStorage.getItem(K().stamp)) || 0; } catch (e) { return 0; } }
  function setStamp(on) { try { if (on) root.sessionStorage.setItem(K().stamp, String(Date.now())); else root.sessionStorage.removeItem(K().stamp); } catch (e) { /* ignore */ } }

  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const canFinger = () => !!(root.PublicKeyCredential && root.navigator.credentials);
  const hasFinger = () => !!(rec && rec.passkeys && rec.passkeys.length && canFinger());
  const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
  const tooMany = () => 'Too many tries. Try again at ' + hhmm(L.lockedUntil(rec, Date.now())) + '.';

  function head(title, msg, err) {
    $('lockhi').textContent = title;
    const m = $('lockmsg'); m.textContent = msg || ''; m.classList.toggle('err', !!err);
  }
  const say = (t, err) => { const m = $('lockmsg'); m.textContent = t; m.classList.toggle('err', !!err); };
  const hi = () => { const n = o.name(); return n ? 'Hi ' + n + ' 👋' : o.app; };
  function show() { html.classList.add('lockon'); }
  function body(...els) { const b = $('lockbody'); b.innerHTML = ''; els.forEach(e => e && b.appendChild(e)); }
  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'on') Object.entries(v).forEach(([ev, fn]) => e.addEventListener(ev, fn)); else e.setAttribute(k, v); });
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- the PIN pad ----------
  let padKeys = null;
  function pad(onSix, withFinger) {
    let pin = '';
    const dots = el('div', {class: 'dots', 'aria-label': 'PIN'});
    for (let i = 0; i < 6; i++) dots.appendChild(el('i'));
    const draw = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const grid = el('div', {class: 'pad'});
    const press = k => {
      if (busy) return;
      if (k === 'finger') return askFinger();
      if (k === 'del') { pin = pin.slice(0, -1); return draw(); }
      if (pin.length >= 6) return;
      pin += k; draw();
      if (pin.length === 6) {
        const p = pin;
        setTimeout(async () => { const good = await onSix(p); if (!good) { pin = ''; draw(); dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); } }, 120);
      }
    };
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', withFinger ? 'finger' : '', '0', 'del'].forEach(k => {
      const b = el('button', {type: 'button', 'aria-label': k === 'finger' ? 'Use fingerprint' : k === 'del' ? 'Delete' : k}, k === 'finger' ? '👆' : k === 'del' ? '⌫' : k);
      if (!k) { b.disabled = true; b.textContent = ''; }
      if (k === 'finger' || k === 'del') b.classList.add('ic');
      b.addEventListener('click', () => press(k));
      grid.appendChild(b);
    });
    padKeys = e => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
    return [dots, grid];
  }
  document.addEventListener('keydown', e => { if (padKeys && html.classList.contains('lockon') && !(e.target instanceof HTMLInputElement)) padKeys(e); });

  // ---------- steps ----------
  function stepSetup() {                       // a new person: name, then PIN twice
    show();
    head('Welcome to ' + o.app, 'First, what should I call you?');
    const inp = el('input', {class: 'inp', id: 'myname', placeholder: 'Your first name', maxlength: '20', autocomplete: 'given-name', value: o.name()});
    const go = el('button', {class: 'btn p', type: 'submit'}, 'Next');
    const f = el('form', {class: 'field'}); f.append(inp, go);
    f.addEventListener('submit', e => { e.preventDefault(); o.setName(inp.value); stepNewPin(''); });
    body(f);
    setTimeout(() => inp.focus(), 50);
  }
  function stepNewPin(first, fromForgot) {
    show();
    head(first ? 'Type it again' : 'Pick a 6-digit PIN', first ? 'Just to be sure' : 'You will use it to open ' + o.app);
    const [dots, grid] = pad(async pin => {
      if (!first) { stepNewPin(pin, fromForgot); return true; }
      const bad = L.pinProblem(first, pin);
      if (bad) { stepNewPin('', fromForgot); say(bad, true); return false; }
      busy = true;
      try {
        if (fromForgot) { await L.setPin(rec, pin); L.ok(rec); save(); enter(); }
        else { const codes = L.makeCodes(); rec = await L.create(pin, codes); save(); stepCodes(codes, true); }
      } finally { busy = false; }
      return true;
    }, false);
    body(dots, grid);
  }
  function stepCodes(codes, first) {
    show();
    head('🔑 Your backup codes', 'If you forget your PIN, each code opens ' + o.app + ' once. Keep them somewhere safe.');
    const ul = el('ul', {class: 'codes'});
    codes.forEach(c => ul.appendChild(el('li', {}, c)));
    const copy = el('button', {class: 'btn', type: 'button'}, '📋 Copy all 10');
    copy.addEventListener('click', async () => {
      const text = o.app + ' backup codes (each works once)\n' + codes.join('\n');
      try { await navigator.clipboard.writeText(text); } catch (e) {
        const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (x) { /* no */ } t.remove();
      }
      copy.textContent = '✅ Copied';
    });
    const done = el('button', {class: 'btn p', type: 'button'}, "I've saved them");
    done.addEventListener('click', () => { if (first && canFinger()) stepOfferFinger(); else enter(); });
    body(ul, copy, done);
  }
  function stepOfferFinger() {
    head('👆 Use your fingerprint?', 'Open ' + o.app + ' with your finger instead of typing your PIN.');
    const yes = el('button', {class: 'btn p', type: 'button'}, 'Yes, set it up');
    const no = el('button', {class: 'link', type: 'button'}, 'Not now');
    yes.addEventListener('click', async () => { const ok = await addFinger(); if (ok) enter(); else say('Cancelled. You can turn it on later in Settings.', true); });
    no.addEventListener('click', enter);
    body(yes, no);
  }
  function stepUnlock() {
    show();
    rec = load() || rec;
    head(hi(), 'Enter your 6-digit PIN');
    const [dots, grid] = pad(async pin => {
      if (L.lockedUntil(rec, Date.now())) { say(tooMany(), true); return false; }
      busy = true;
      say('Checking…');
      try {
        if (await L.checkPin(rec, pin)) { L.ok(rec); save(); enter(); return true; }
        L.fail(rec, Date.now()); save();
        say(L.lockedUntil(rec, Date.now()) ? tooMany() : 'Wrong PIN. ' + (L.MAX_TRIES - rec.fails.count) + ' tries left.', true);
        return false;
      } finally { busy = false; }
    }, hasFinger());
    const forgot = el('button', {class: 'link', type: 'button'}, 'Forgot PIN?');
    forgot.addEventListener('click', stepForgot);
    const fp = hasFinger() ? el('button', {class: 'link', type: 'button'}, 'Use fingerprint') : null;
    if (fp) fp.addEventListener('click', askFinger);
    body(dots, grid, fp, forgot);
    if (L.lockedUntil(rec, Date.now())) say(tooMany(), true);
    else if (hasFinger()) askFinger();
  }
  function stepForgot() {
    head('Forgot your PIN?', 'Type one of your backup codes. Each one works once.');
    const inp = el('input', {class: 'inp', placeholder: 'abcd-efgh', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false'});
    const go = el('button', {class: 'btn p', type: 'submit'}, 'Use this code');
    const back = el('button', {class: 'link', type: 'button'}, '← Back to PIN');
    back.addEventListener('click', stepUnlock);
    const f = el('form', {class: 'field'}); f.append(inp, go);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (busy) return;
      if (L.lockedUntil(rec, Date.now())) { say(tooMany(), true); return; }
      busy = true; go.disabled = true; say('Checking…');
      try {
        const i = await L.findCode(rec, inp.value);
        if (i < 0) { L.fail(rec, Date.now()); save(); say(L.lockedUntil(rec, Date.now()) ? tooMany() : 'That code is not right, or it was used already.', true); return; }
        rec.codes[i].used = true; save();
        busy = false;
        stepNewPin('', true);
      } finally { busy = false; go.disabled = false; }
    });
    body(f, back);
    setTimeout(() => inp.focus(), 50);
  }

  // ---------- fingerprint: a passkey on this phone ----------
  async function askFinger() {
    if (!hasFinger()) return;
    try {
      const challenge = root.crypto.getRandomValues(new Uint8Array(32));
      const cred = await root.navigator.credentials.get({publicKey: {challenge, userVerification: 'required', timeout: 60000,
        allowCredentials: rec.passkeys.map(p => ({type: 'public-key', id: unb64url(p.id)}))}});
      const info = JSON.parse(new TextDecoder().decode(cred.response.clientDataJSON));
      const flags = new Uint8Array(cred.response.authenticatorData)[32];
      if (info.type === 'webauthn.get' && info.challenge === b64url(challenge) && (flags & 0x04)) { L.ok(rec); save(); enter(); }
    } catch (e) { /* cancelled: use the PIN */ }
  }
  async function addFinger() {
    try {
      const cred = await root.navigator.credentials.create({publicKey: {
        challenge: root.crypto.getRandomValues(new Uint8Array(32)),
        rp: {name: o.app},
        user: {id: root.crypto.getRandomValues(new Uint8Array(16)), name: 'me', displayName: o.name() || 'Me'},
        pubKeyCredParams: [{type: 'public-key', alg: -7}, {type: 'public-key', alg: -257}],
        excludeCredentials: (rec.passkeys || []).map(p => ({type: 'public-key', id: unb64url(p.id)})),
        authenticatorSelection: {authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred'},
        timeout: 60000}});
      rec.passkeys = (rec.passkeys || []).concat([{id: b64url(cred.rawId), at: new Date().toISOString()}]);
      save();
      return true;
    } catch (e) { return e && e.name === 'InvalidStateError'; }
  }

  // ---------- in and out ----------
  function enter() {
    setStamp(true);
    padKeys = null;
    const lk = $('lock');
    lk.classList.add('fade');
    setTimeout(() => { lk.classList.remove('fade'); html.classList.remove('lockon'); o.onEnter && o.onEnter(); }, 300);
  }
  function check() {
    if (o.demo) { html.classList.remove('lockon'); o.onEnter && o.onEnter(); return; }
    if (html.classList.contains('lockon') && $('lockbody').childElementCount) return;   // already showing a step
    rec = load();
    const n = L.needs(rec, stamp(), Date.now());
    if (n === 'setup') stepSetup();
    else if (n === 'unlock') stepUnlock();
    else { html.classList.remove('lockon'); o.onEnter && o.onEnter(); }
  }

  function start(opts) {
    o = Object.assign({app: 'App', prefix: 'app', demo: false, name: () => '', setName: () => {}, onEnter: null}, opts);
    check();
    if (o.demo) return;
    const touch = () => { if (html.classList.contains('lockon')) return; if (L.needs(load(), stamp(), Date.now())) { $('lockbody').innerHTML = ''; check(); } else setStamp(true); };
    const soft = () => { if (Date.now() - stamp() > 5000) touch(); };
    document.addEventListener('pointerdown', touch, true);
    document.addEventListener('keydown', touch, true);
    ['scroll', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, soft, {capture: true, passive: true}));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (!html.classList.contains('lockon') && !L.needs(load(), stamp(), Date.now())) setStamp(true); }
      else if (!html.classList.contains('lockon') && L.needs(load(), stamp(), Date.now())) { $('lockbody').innerHTML = ''; check(); }
    });
    setInterval(() => { if (!html.classList.contains('lockon') && L.needs(load(), stamp(), Date.now())) { $('lockbody').innerHTML = ''; check(); } }, 30000);
  }

  // for the Settings screen
  const api = {
    start,
    lockNow() { setStamp(false); $('lockbody').innerHTML = ''; rec = load(); stepUnlock(); },
    fingerOn() { rec = load(); return !!(rec && rec.passkeys && rec.passkeys.length); },
    canFinger,
    async fingerAdd() { rec = load(); return rec ? addFinger() : false; },
    fingerOff() { rec = load(); if (rec) { rec.passkeys = []; save(); } },
    async newCodes() { rec = load(); if (!rec) return; const codes = L.makeCodes(); await L.newCodes(rec, codes); save(); show(); stepCodes(codes, false); },
    codesLeft() { rec = load(); return rec ? L.codesLeft(rec) : 0; },
    async changePin() { rec = load(); if (!rec) return; show(); stepNewPin('', true); }
  };
  root.LockUI = api;
})(window);
