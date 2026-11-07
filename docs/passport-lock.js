/* TaskNotes 🛂 Passport = the lock now (one ID + one login for all DF apps, see docs/passport/PASSPORT.md).
   This file keeps the old LockUI names, so app.js hardly changes.
   - Lock screen, passcode, backup codes, fingerprint: Passport (docs/passport/)
   - 🔐 Secrets: opened by the passport's hidden key (your passcode every time)
   - Stays open: once your passport is on this phone it opens straight in, no passcode, even after closing.
     Only 🔒 Lock now (Settings) or Sign out make it ask again.
   - Google's sign-in (1 hour) is kept across closing the app too, so reopening doesn't pop Google up again. 🔐 Secrets keeps its own passcode + 1 min timer.
   - ☁️ Google: the same sign-in as Passport, the Sheet lives in App data - DON'T DELETE / DF…… / Todo */
(function (root) {
  'use strict';
  const APP = 'tasknotes', LOCKED = 'tasknotes-locked';
  const GT = 'passport-google-token', GT_KEEP = 'tasknotes-google-token';
  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  let o = null, ready = null;
  // locked = only after 🔒 Lock now or Sign out. Otherwise the app opens straight in.
  const stay = on => { try { on ? localStorage.removeItem(LOCKED) : localStorage.setItem(LOCKED, '1'); } catch {} };
  const staying = () => { try { return localStorage.getItem(LOCKED) !== '1'; } catch { return true; } };

  // ☁️ keep Google's 1-hour sign-in when the app is closed (the passport keeps it for this tab only)
  function keepGoogle() {
    try { const t = sessionStorage.getItem(GT); if (t) localStorage.setItem(GT_KEEP, t); } catch {}
  }
  try {
    const t = JSON.parse(localStorage.getItem(GT_KEEP) || 'null');
    if (t && t.exp > Date.now() + 60000 && !sessionStorage.getItem(GT)) sessionStorage.setItem(GT, JSON.stringify(t));
  } catch {}
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keepGoogle(); });
  root.addEventListener('pagehide', keepGoogle);
  setInterval(keepGoogle, 30000);

  const email = () => Passport.appAccount(APP) || '';
  const me = () => Passport.find(email());
  const first = n => String(n || '').trim().split(' ')[0];

  function inApp(p) {
    html.classList.remove('lockon');
    stay(true);
    if (p && !o.name() && o.setName) o.setName(first(p.name));
    // ☁️ same Google account as the passport: switch the Sheet sync on (it finds/makes the Sheet in the Todo folder)
    if (root.GSheet && !root.GSheet.on() && p) root.GSheet.setConfig({on: true, email: p.email});
    o.onEnter && o.onEnter();
  }
  // show a Passport screen over the app
  function over(fn) {
    html.classList.add('lockon');
    ready.then(fn);
  }

  function start(opts) {
    o = Object.assign({name: () => '', setName: null, onEnter: null, onSignOut: null, demo: false}, opts);
    if (o.demo) { html.classList.remove('lockon'); o.onEnter && o.onEnter(); return; }
    // signed in before (and not locked or signed out since) = open straight in, no passcode
    if (staying() && Passport.find(email())) Passport.setUnlocked(APP, true);
    // Passport's own "Lock now" button counts too
    $('passport').addEventListener('click', e => { if (e.target.closest && e.target.closest('#lock')) stay(false); }, true);
    ready = fetch('passport/theme.json').then(r => r.json()).then(theme => {
      PassportUI.start({app: APP, theme, mount: $('passport'), onUnlocked: p => inApp(p), onSignOut: () => { stay(false); try { localStorage.removeItem(GT_KEEP); } catch {} o.onSignOut && o.onSignOut(); }});
    });
  }

  const api = {
    start,
    lockNow() { stay(false); Passport.setUnlocked(APP, false); over(() => PassportUI.route()); },
    fingerOn() { const p = me(); return !!(p && p.fingerprints && p.fingerprints[APP]); },
    canFinger: () => !!(root.PublicKeyCredential && root.navigator.credentials),
    async fingerAdd() { try { await Passport.enrollFingerprint(email(), APP, 'TaskNotes'); return true; } catch (e) { return false; } },
    fingerOff() { Passport.removeFingerprint(email(), APP); },
    codesLeft() { const p = me(); return p ? Passport.backupLeft(p) : 0; },
    passportId() { const p = me(); return p ? p.id : ''; },
    // Passport's own settings: passcode, backup codes, fingerprint, Drive ("Back to TaskNotes" returns)
    settings() { over(() => PassportUI.settings()); },
    changePin() { api.settings(); },
    newCodes() { api.settings(); },
    // 🔐 Secrets: the passcode every time. Wrong tries count with the main lock. Returns {key} or {err}
    async vault(pin) {
      const e = email();
      if (!e) return {err: 'Sign in first.'};
      const r = await Passport.checkPasscode(e, pin);
      if (!r.ok) return {err: r.lockedMs ? 'Too many tries. Try again in ' + Math.ceil(r.lockedMs / 60000) + ' min.' : 'Wrong passcode. ' + r.triesLeft + ' tries left.'};
      return {key: await root.Vault.keyFrom(Passport.key(e))};
    },
  };
  root.LockUI = api;
})(window);
