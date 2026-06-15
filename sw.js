// ──────────────────────────────────────────
// 科研备忘录 · Service Worker
// Offline-first caching strategy
// ──────────────────────────────────────────

const CACHE_NAME = 'research-memo-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-512.png'
];

// Install: pre-cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core assets');
      return cache.addAll(ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch: cache-first for local assets, network-first for external
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For same-origin requests: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Return cache, but also update in background
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, clone);
                });
              }
              return response;
            })
            .catch(() => cached);
          return cached;
        }
        // Not cached: fetch from network and cache
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
  } else {
    // External resources (Google Fonts, etc.): network-first with cache fallback
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
