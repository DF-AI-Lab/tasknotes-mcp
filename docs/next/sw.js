/* TaskNotes (new look, /next/) - the service worker: keeps the app files on the phone so it opens with no internet.
   Its own cache name (tnnext-), so it never touches the live app's cache. Bump VERSION with every change. */
const VERSION = '2.0';
const CACHE = 'tnnext-b' + VERSION;
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.json', 'passport/theme.json',
  '../store.js', '../vault.js', '../config.js', '../passport-lock.js', '../passport/config.js', '../passport/google.js', '../passport/passport.js',
  '../passport/ui.js', '../passport/passport.css', '../sync.js', '../gsheet.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', '../invite-qr.svg'];

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
    for (const name of await caches.keys()) if (name.startsWith('tnnext-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
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
