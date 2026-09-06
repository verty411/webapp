// Exists only so browsers consider this installable as an app. Deliberately does
// no caching — every request (Google APIs, the video, the app itself) should
// always go to the network, never a stale copy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
