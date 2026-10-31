/* TaskNotes - the service worker: keeps the app files on the phone so it opens with no internet.
   Bump VERSION with every app version. */
const VERSION = '0.2.0';
const CACHE = 'tasknotes-' + VERSION;
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'store.js', 'lock.js', 'vault.js', 'lockui.js', 'sync.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

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
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // fonts and the Worker go their own way
  if (req.mode === 'navigate') {                                             // the page: newest if online, else the kept one
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
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
