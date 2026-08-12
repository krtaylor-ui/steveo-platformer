// ============================================================
// sw.js — Service worker for the installable PWA (§3).
//
// Caches the app shell so local single-player (Sandbox / Speed Run / local
// saves) works offline once installed. Online multiplayer is untouched: API,
// Socket.IO and any cross-origin requests always go to the network, so they
// simply fail gracefully when offline (as before). The shell is cached
// on-demand ("cache what you fetch") so we don't have to enumerate all ~45 JS
// files or track the ?v=bN cache-busters — the versioned URLs the page loads
// are exactly what gets cached.
//
// Bump CACHE_VERSION on release to drop the old shell.
// ============================================================

const CACHE_VERSION = 'steveo-shell-v479';
const CORE = ['/', '/index.html', '/style.css', '/manifest.json', '/icon.svg',
  // App icons (player-head, build 52).
  '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon-180.png',
  // Pre-loaded starter worlds (seeded into local storage on first offline use).
  '/default-worlds/normal-default.json', '/default-worlds/platformer-default.json',
  '/default-worlds/speedrunner-default.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CORE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Should this request be served from / stored in the shell cache?
function isShellAsset(url, request) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;      // skip CDN (socket.io)
  if (url.pathname.startsWith('/api/')) return false;          // dynamic — network only
  if (url.pathname.startsWith('/socket.io/')) return false;    // realtime — network only
  return true;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (!isShellAsset(url, request)) return; // default: let the network handle it

  // Navigations (the HTML doc): network-first so a fresh deploy shows, with a
  // cache fallback (and finally the cached shell) when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Other shell assets (js/css/png/mp3/svg): stale-while-revalidate — instant
  // from cache, refreshed in the background for next load.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(resp => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then(c => c.put(request, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
