// Minimal service worker so the panel is installable as "MMD CRM" on phones.
// It deliberately caches nothing: leads must always come live from the API,
// so every request goes straight to the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
