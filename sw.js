// Kill-switch for the old Finance OS service worker (scope /Finance-OS/): deletes only this old scope's caches
// (never IndexedDB, never the other apps' caches on this origin), unregisters itself and sends open
// windows to Largo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    for (const k of await caches.keys()) if (k.includes(scope)) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      c.navigate('https://morohjr.github.io/Largo/');
    }
  })());
});
