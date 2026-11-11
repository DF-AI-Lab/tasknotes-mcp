/* The new look moved to the main address. This removes the old /next/ copy from phones. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const n of await caches.keys()) if (n.startsWith('tnnext-')) await caches.delete(n);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({type: 'window'})) c.navigate('../');
})()));
