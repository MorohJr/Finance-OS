// Kill-switch for the old Finance OS service worker: clears its caches (never IndexedDB),
// unregisters itself and sends open windows to Largo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) {
      c.navigate('https://morohjr.github.io/Largo/');
    }
  })());
});
