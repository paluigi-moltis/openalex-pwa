// ============================================
// OpenAlex Research Manager — Service Worker
// Caching strategy: network-first with local
// cache fallback (offline support).
// ============================================

const CACHE_NAME = 'openalex-pwa-v2';

// App shell assets to pre-cache on install
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/api.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './img/icon-192.png',
  './img/icon-512.png'
];

// CDN resources cache (Bootstrap, Dexie, icons)
const CDN_CACHE = 'openalex-pwa-cdn-v2';

// OpenAlex API — always go to the network, never cache
const API_PATTERN = /api\.openalex\.org/;

// Install: pre-cache app shell
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CDN_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for all assets, local cache fallback when offline
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept OpenAlex API calls — always hit the network
  if (API_PATTERN.test(url.hostname)) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-first: fresh content when online, cached copy when offline
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Cache successful responses for offline use
        if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaque') {
          const clone = networkResponse.clone();
          const cacheName = url.origin === self.location.origin ? CACHE_NAME : CDN_CACHE;
          caches.open(cacheName).then(cache => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Navigations fall back to the cached app shell
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'Content-Type': 'text/plain' }
          });
        })
      )
  );
});
