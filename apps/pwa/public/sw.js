// Simple Service Worker for Offline Support
// Caches app shell and WASM files for offline functionality

const CACHE_NAME = 'basalt-pwa-v1';
const WASM_CACHE = 'basalt-wasm-v1';

// Assets to cache on install
const CACHE_ASSETS = [
  '/',
  '/manifest.json',
];

// Install event - cache app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(CACHE_ASSETS);
    }).then(() => {
      console.log('[SW] Service worker installed');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== WASM_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // WASM files - cache first
  if (request.url.endsWith('.wasm')) {
    event.respondWith(
      caches.open(WASM_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            console.log('[SW] Serving WASM from cache:', request.url);
            return response;
          }
          return fetch(request).then((fetchResponse) => {
            cache.put(request, fetchResponse.clone());
            console.log('[SW] Cached WASM file:', request.url);
            return fetchResponse;
          });
        });
      })
    );
    return;
  }

  // All other requests - Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Cache the fetched response
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(request).then((response) => {
          if (response) {
            console.log('[SW] Serving from cache (offline):', request.url);
            return response;
          }

          // For navigation requests, return cached index.html
          if (request.mode === 'navigate') {
            return caches.match('/').then((cached) => {
              if (cached) {
                console.log('[SW] Serving index from cache (offline navigation)');
                return cached;
              }
              return new Response('Offline', {
                status: 503,
                statusText: 'Service Unavailable',
              });
            });
          }

          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});
