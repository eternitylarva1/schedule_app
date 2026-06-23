const CACHE_NAME = 'schedule-app-v25';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/style.css?v=20260623-01',
  '/static/js/core/state-elements.js?v=20260623-01',
  '/static/js/core/utils.js?v=20260412-04',
  '/static/js/core/api-toast.js?v=20260412-04',
  '/static/js/core/drag.js?v=20260412-05',
  '/static/js/utils2.js?v=20260425-01',
  '/static/js/budget.js?v=20260426-08',
  '/static/js/notepad.js?v=20260426-06',
  '/static/js/settings.js?v=20260429-01',
  '/static/js/main.js?v=20260520-02',
  '/static/js/goals.js?v=20260623-01',
  '/static/js/selection.js?v=20260425-01',
  '/static/js/calendar-views.js?v=20260425-01',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API requests - network only (always get fresh data)
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: '离线状态，无法获取最新数据' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Static assets - cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cache, but also update it in background
          fetch(event.request).then((response) => {
            if (response.ok) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }

        // No cache, fetch from network
        return fetch(event.request).then((response) => {
          // Cache successful responses
          if (response.ok && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        }).catch(() => {
          // Offline fallback for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
