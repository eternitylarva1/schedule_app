/**
 * Schedule App Service Worker
 *
 * ⚠️ STATIC_ASSETS 列表必须与 index.html 保持同步。
 * 每次新增/删除/重命名 JS/CSS 文件或更新版本号后，必须同时更新此列表。
 *
 * 自动同步命令: python scripts/sync_sw_cache.py
 */

const CACHE_NAME = 'schedule-app-v27';
const STATIC_ASSETS = [
  // Root
  '/',
  '/index.html',

  // Core JS
  '/static/js/core/state-elements.js?v=20260629-01',
  '/static/js/core/utils.js?v=20260412-04',
  '/static/js/core/api-toast.js?v=20260622-01',
  '/static/js/core/drag.js?v=20260412-05',

  // Feature modules
  '/static/js/utils2.js?v=20260425-01',
  '/static/js/budget.js?v=20260629-01',
  '/static/js/note-ai.js?v=20260624-03',
  '/static/js/note-editor.js?v=20260629-01',
  '/static/js/notes-list.js?v=20260623-01',
  '/static/js/expense.js?v=20260622-02',
  '/static/js/notepad.js?v=20260622-02',
  '/static/js/settings.js?v=20260624-02',
  '/static/js/llm-queue.js?v=20260624-01',
  '/static/js/main.js?v=20260629-01',
  '/static/js/goals.js?v=20260624-02',
  '/static/js/selection.js?v=20260425-01',
  '/static/js/calendar-views.js?v=20260425-01',

  // CSS
  '/static/styles/main.css?v=20260629-01',

  // Other
  '/manifest.json',
  '/static/icon-192.png',
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
