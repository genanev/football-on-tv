// Offline use: keeps a copy of the app itself (the page, its icons) on the phone, so it opens
// without a signal. The listings (data.json) aren't cached here: index.html keeps the last good
// copy itself and says how old it is.
//
// Network first, always: online, every file comes fresh from the server (so a change merged to
// main shows on the next open, as before), and the copy is refreshed on the way. Only when the
// network fails is the saved copy used.

const CACHE = 'telly-fixtures-v1';
const SHELL = [
  './', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  ...['mytv', 'football', 'motorsport', 'golf', 'cricket', 'rugby', 'darts', 'snooker', 'specials'].map(n => `sport-icons/${n}.svg`),
  'sport-icons/tennis.png', 'sport-icons/skiing.png',
];

self.addEventListener('install', (ev) => {
  // One missing file mustn't stop the rest being saved
  ev.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  // Only this site's own files; the listings (*.json, fetched with ?t= so they're never reused) go
  // straight to the network
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.json')) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Every page address (?demo too) is the same app: save and find it as the start page
    const key = req.mode === 'navigate' ? new URL('./', location.href).href : req;
    try {
      const res = await fetch(req);
      if (res.ok) ev.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      const hit = await cache.match(key, { ignoreSearch: true });
      if (hit) return hit;
      throw e;
    }
  })());
});
