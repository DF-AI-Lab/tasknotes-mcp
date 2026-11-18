/* TaskNotes - the service worker: keeps the app files on the phone so it opens with no internet.
   Bump VERSION with every change. */
const VERSION = '2.2';
const CACHE = 'tasknotes-' + VERSION;
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.json', 'passport/theme.json',
  'store.js', 'vault.js', 'config.js', 'passport-lock.js', 'passport/config.js', 'passport/google.js', 'passport/passport.js',
  'passport/ui.js', 'passport/passport.css', 'sync.js', 'gsheet.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'invite-qr.svg'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async f => {
      const r = await fetch(new Request(f, {cache: 'reload'}));
      if (!r.ok) throw new Error(f + ' ' + r.status);
      await cache.put(f, r);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('tasknotes-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate' && url.pathname !== scope && url.pathname !== scope + 'index.html') return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req, {cache: 'no-cache'});
        if (r.ok) { const c = await caches.open(CACHE); c.put('./', r.clone()); }
        return r;
      } catch (err) {
        return (await caches.match('./', {ignoreSearch: true})) || (await caches.match('index.html', {ignoreSearch: true})) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => (await caches.match(req, {ignoreSearch: true})) || fetch(req))());
});

// ⏰ an alarm from the TaskNotes Worker: show it, even when the app is closed
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {title: 'TaskNotes', body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || '⏰ TaskNotes', {
    body: d.body || '', tag: d.tag || 'tasknotes', renotify: true, requireInteraction: true,
    icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [400, 150, 400, 150, 400], data: {url: d.url || './'}}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const open = all.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.focus();
    return self.clients.openWindow(url);
  })());
});
