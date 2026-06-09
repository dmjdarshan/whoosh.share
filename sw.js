// Whoosh.share Service Worker
// TEMPORARILY DISABLED FOR DEVELOPMENT
// Caches app shell for offline use

const CACHE_NAME = 'whoosh-v5-disabled';
const CACHING_DISABLED = true; // Set to false to re-enable caching
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/src/main.js',
  '/src/ui.js',
  '/src/discovery.js',
  '/src/connection.js',
  '/src/transfer.js'
];

// Install event — cache app shell
self.addEventListener('install', (event) => {
  if (CACHING_DISABLED) {
    console.log('[SW] Caching disabled - skipping');
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW] Deleting cache:', cacheName);
          return caches.delete(cacheName); // Delete ALL caches when disabled
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event — serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // If caching is disabled, always fetch from network
  if (CACHING_DISABLED) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-first for WASM files (they may be large and updated)
  if (event.request.url.includes('.wasm')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the WASM file for offline use
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cache the new resource
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return response;
      });
    })
  );
});


