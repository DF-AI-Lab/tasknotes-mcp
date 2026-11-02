/* TaskNotes 🛂 Passport = the lock now (one ID + one login for all DF apps, see docs/passport/PASSPORT.md).
   This file keeps the old LockUI names, so app.js hardly changes.
   - Lock screen, passcode, backup codes, fingerprint: Passport (docs/passport/)
   - 🔐 Secrets: opened by the passport's hidden key (your passcode every time)
   - Locks again after 5 minutes without use
   - ☁️ Google: the same sign-in as Passport, the Sheet lives in App data - DON'T DELETE / DF…… / Todo */
(function (root) {
  'use strict';
  const APP = 'tasknotes', IDLE_MS = 5 * 60 * 1000;
  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  let o = null, used = Date.now(), ready = null;

  const email = () => Passport.appAccount(APP) || '';
  const me = () => Passport.find(email());
  const first = n => String(n || '').trim().split(' ')[0];

  function inApp(p) {
    html.classList.remove('lockon');
    used = Date.now();
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
    o = Object.assign({name: () => '', setName: null, onEnter: null, demo: false}, opts);
    if (o.demo) { html.classList.remove('lockon'); o.onEnter && o.onEnter(); return; }
    ready = fetch('passport/theme.json').then(r => r.json()).then(theme => {
      PassportUI.start({app: APP, theme, mount: $('passport'), onUnlocked: p => inApp(p)});
    });
    // locks again after 5 minutes without a tap
    const touch = () => { if (!html.classList.contains('lockon')) used = Date.now(); };
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, touch, true));
    const idle = () => { if (!html.classList.contains('lockon') && Date.now() - used > IDLE_MS) api.lockNow(); };
    setInterval(idle, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') idle(); else touch(); });
  }

  const api = {
    start,
    lockNow() { Passport.setUnlocked(APP, false); over(() => PassportUI.route()); },
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
