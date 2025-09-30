/**
 * GA Tech AI & Vibe-Coding Community Platform
 * Service Worker v2.0.0
 * Modern PWA with offline support, background sync, and push notifications
 */

'use strict';

// Cache configuration
const CACHE_VERSION = 'v2.0.0';
const CACHE_NAMES = {
  static: `static-cache-${CACHE_VERSION}`,
  dynamic: `dynamic-cache-${CACHE_VERSION}`,
  images: `image-cache-${CACHE_VERSION}`,
  api: `api-cache-${CACHE_VERSION}`,
  posts: `posts-cache-${CACHE_VERSION}`,
  media: `media-cache-${CACHE_VERSION}`
};

// Maximum cache sizes
const CACHE_LIMITS = {
  dynamic: 50,
  images: 100,
  api: 30,
  posts: 200,
  media: 50
};

// Cache expiration times (in seconds)
const CACHE_EXPIRATION = {
  api: 300, // 5 minutes
  posts: 3600, // 1 hour
  images: 86400, // 24 hours
  media: 604800 // 7 days
};

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/main.css',
  '/css/themes/gatech-theme.css',
  '/js/app.js',
  '/js/pwa-install.js',
  '/js/components/post-list.js',
  '/js/components/comment-section.js',
  '/js/utils/api.js',
  '/js/utils/storage.js',
  '/images/logo.svg',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png',
  '/fonts/inter-var.woff2',
  '/manifest.json'
];

// API endpoints configuration
const API_CONFIG = {
  baseUrl: 'https://api.gatech-community.edu',
  endpoints: {
    posts: '/api/posts',
    comments: '/api/comments',
    users: '/api/users',
    notifications: '/api/notifications',
    communities: '/api/communities'
  }
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing version:', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAMES.static)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS)
          .catch(error => {
            console.error('[Service Worker] Failed to cache static assets:', error);
            // Continue installation even if some assets fail
            return Promise.resolve();
          });
      })
      .then(() => {
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating version:', CACHE_VERSION);

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              return !Object.values(CACHE_NAMES).includes(cacheName);
            })
            .map(cacheName => {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      }),
      // Claim all clients immediately
      self.clients.claim(),
      // Initialize IndexedDB for offline data
      initializeOfflineStorage()
    ])
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle different request types with appropriate strategies
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(event.request));
  } else if (url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|avif)$/i)) {
    event.respondWith(handleImageRequest(event.request));
  } else if (url.pathname.match(/\.(mp4|webm|ogg|mp3|wav)$/i)) {
    event.respondWith(handleMediaRequest(event.request));
  } else if (url.pathname.match(/\.(js|css|woff2?)$/i)) {
    event.respondWith(handleStaticRequest(event.request));
  } else {
    event.respondWith(handleNavigationRequest(event.request));
  }
});

// Handle API requests (Network first, cache fallback)
async function handleAPIRequest(request) {
  const cache = await caches.open(CACHE_NAMES.api);

  try {
    // Try network first
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Clone response before caching
      const responseToCache = networkResponse.clone();

      // Add timestamp to cached response
      const timestamp = Date.now();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-timestamp', timestamp.toString());

      const modifiedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      await cache.put(request, modifiedResponse);
      await trimCache(CACHE_NAMES.api, CACHE_LIMITS.api);
    }

    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network request failed, trying cache:', error);

    // Check cache
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Check if cache is expired
      const cacheTimestamp = cachedResponse.headers.get('sw-cache-timestamp');
      if (cacheTimestamp) {
        const age = (Date.now() - parseInt(cacheTimestamp)) / 1000;
        if (age > CACHE_EXPIRATION.api) {
          console.log('[Service Worker] Cache expired for:', request.url);
          // Return stale cache but trigger background update
          triggerBackgroundUpdate(request);
        }
      }
      return cachedResponse;
    }

    // Return offline fallback for API requests
    return new Response(JSON.stringify({
      error: 'offline',
      message: 'You are currently offline. Please check your connection.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle image requests (Cache first, network fallback)
async function handleImageRequest(request) {
  const cache = await caches.open(CACHE_NAMES.images);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Return cached version and update in background
    triggerBackgroundUpdate(request);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      await trimCache(CACHE_NAMES.images, CACHE_LIMITS.images);
    }

    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Failed to fetch image:', error);
    // Return placeholder image
    return caches.match('/images/placeholder.svg');
  }
}

// Handle media requests (Progressive streaming)
async function handleMediaRequest(request) {
  const cache = await caches.open(CACHE_NAMES.media);

  // Check if we have a cached version
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    // For media, use streaming response
    const networkResponse = await fetch(request);

    if (networkResponse.ok && networkResponse.headers.get('content-length') < 10485760) { // 10MB limit
      await cache.put(request, networkResponse.clone());
      await trimCache(CACHE_NAMES.media, CACHE_LIMITS.media);
    }

    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Failed to fetch media:', error);
    return new Response('Media unavailable offline', { status: 503 });
  }
}

// Handle static assets (Cache first)
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAMES.static);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Failed to fetch static asset:', error);
    return new Response('Asset unavailable', { status: 503 });
  }
}

// Handle navigation requests (Network first, offline page fallback)
async function handleNavigationRequest(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.dynamic);
      await cache.put(request, networkResponse.clone());
      await trimCache(CACHE_NAMES.dynamic, CACHE_LIMITS.dynamic);
    }

    return networkResponse;
  } catch (error) {
    console.log('[Service Worker] Network request failed, checking cache:', error);

    // Try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/offline.html');
    }

    return new Response('Offline', { status: 503 });
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event.tag);

  if (event.tag === 'sync-posts') {
    event.waitUntil(syncOfflinePosts());
  } else if (event.tag === 'sync-comments') {
    event.waitUntil(syncOfflineComments());
  } else if (event.tag === 'sync-votes') {
    event.waitUntil(syncOfflineVotes());
  } else if (event.tag.startsWith('sync-upload-')) {
    event.waitUntil(syncFileUpload(event.tag));
  }
});

// Periodic background sync for fresh content
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-feed') {
    event.waitUntil(updateFeedCache());
  } else if (event.tag === 'update-notifications') {
    event.waitUntil(updateNotifications());
  }
});

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');

  let data = {
    title: 'GA Tech Community',
    body: 'You have a new notification',
    icon: '/images/icons/icon-192x192.png',
    badge: '/images/icons/badge-72x72.png',
    tag: 'default',
    requireInteraction: false,
    silent: false,
    data: {}
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // Notification options
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    requireInteraction: data.requireInteraction,
    silent: data.silent,
    data: data.data,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    actions: data.actions || [
      { action: 'view', title: 'View', icon: '/images/icons/view.png' },
      { action: 'dismiss', title: 'Dismiss', icon: '/images/icons/dismiss.png' }
    ],
    image: data.image
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => updateBadge(data.data.unreadCount))
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event.action);
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || '/';

  if (event.action === 'view') {
    targetUrl = data.url || '/notifications';
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// Message handling for client communication
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      cacheUrls(event.data.urls)
        .then(() => event.ports[0].postMessage({ success: true }))
        .catch(error => event.ports[0].postMessage({ success: false, error: error.message }))
    );
  } else if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      clearAllCaches()
        .then(() => event.ports[0].postMessage({ success: true }))
        .catch(error => event.ports[0].postMessage({ success: false, error: error.message }))
    );
  } else if (event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      getCacheSize()
        .then(size => event.ports[0].postMessage({ size }))
    );
  }
});

// Utility functions

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
    console.log(`[Service Worker] Trimmed ${keysToDelete.length} items from ${cacheName}`);
  }
}

async function triggerBackgroundUpdate(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cacheName = getCacheNameForRequest(request);
      const cache = await caches.open(cacheName);
      await cache.put(request, response);
    }
  } catch (error) {
    console.log('[Service Worker] Background update failed:', error);
  }
}

function getCacheNameForRequest(request) {
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return CACHE_NAMES.api;
  if (url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|avif)$/i)) return CACHE_NAMES.images;
  if (url.pathname.match(/\.(mp4|webm|ogg|mp3|wav)$/i)) return CACHE_NAMES.media;
  if (url.pathname.match(/\.(js|css|woff2?)$/i)) return CACHE_NAMES.static;

  return CACHE_NAMES.dynamic;
}

async function initializeOfflineStorage() {
  // Initialize IndexedDB for offline data
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('GTCommunityOffline', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object stores
      if (!db.objectStoreNames.contains('posts')) {
        db.createObjectStore('posts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('comments')) {
        db.createObjectStore('comments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingActions')) {
        db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function syncOfflinePosts() {
  const db = await initializeOfflineStorage();
  const transaction = db.transaction(['pendingActions'], 'readwrite');
  const store = transaction.objectStore('pendingActions');

  const actions = await store.getAll();
  const postActions = actions.filter(action => action.type === 'post');

  for (const action of postActions) {
    try {
      const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.posts, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${action.token}`
        },
        body: JSON.stringify(action.data)
      });

      if (response.ok) {
        await store.delete(action.id);
        // Notify client of successful sync
        await notifyClients('post-synced', { id: action.id });
      }
    } catch (error) {
      console.error('[Service Worker] Failed to sync post:', error);
    }
  }
}

async function syncOfflineComments() {
  const db = await initializeOfflineStorage();
  const transaction = db.transaction(['pendingActions'], 'readwrite');
  const store = transaction.objectStore('pendingActions');

  const actions = await store.getAll();
  const commentActions = actions.filter(action => action.type === 'comment');

  for (const action of commentActions) {
    try {
      const response = await fetch(API_CONFIG.baseUrl + API_CONFIG.endpoints.comments, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${action.token}`
        },
        body: JSON.stringify(action.data)
      });

      if (response.ok) {
        await store.delete(action.id);
        await notifyClients('comment-synced', { id: action.id });
      }
    } catch (error) {
      console.error('[Service Worker] Failed to sync comment:', error);
    }
  }
}

async function syncOfflineVotes() {
  const db = await initializeOfflineStorage();
  const transaction = db.transaction(['pendingActions'], 'readwrite');
  const store = transaction.objectStore('pendingActions');

  const actions = await store.getAll();
  const voteActions = actions.filter(action => action.type === 'vote');

  for (const action of voteActions) {
    try {
      const endpoint = action.data.targetType === 'post'
        ? `${API_CONFIG.endpoints.posts}/${action.data.targetId}/vote`
        : `${API_CONFIG.endpoints.comments}/${action.data.targetId}/vote`;

      const response = await fetch(API_CONFIG.baseUrl + endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${action.token}`
        },
        body: JSON.stringify({ vote: action.data.vote })
      });

      if (response.ok) {
        await store.delete(action.id);
        await notifyClients('vote-synced', { id: action.id });
      }
    } catch (error) {
      console.error('[Service Worker] Failed to sync vote:', error);
    }
  }
}

async function syncFileUpload(tag) {
  const uploadId = tag.replace('sync-upload-', '');
  // Implement file upload sync logic here
  console.log('[Service Worker] Syncing file upload:', uploadId);
}

async function updateFeedCache() {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.posts}?limit=20`);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.posts);
      await cache.put('/api/posts?limit=20', response);
      console.log('[Service Worker] Feed cache updated');
    }
  } catch (error) {
    console.error('[Service Worker] Failed to update feed cache:', error);
  }
}

async function updateNotifications() {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.notifications}`);
    if (response.ok) {
      const notifications = await response.json();
      const unreadCount = notifications.filter(n => !n.read).length;
      await updateBadge(unreadCount);
    }
  } catch (error) {
    console.error('[Service Worker] Failed to update notifications:', error);
  }
}

async function updateBadge(count) {
  if ('setAppBadge' in navigator) {
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    } catch (error) {
      console.error('[Service Worker] Failed to update badge:', error);
    }
  }
}

async function notifyClients(type, data) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type, data });
  });
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAMES.dynamic);
  return cache.addAll(urls);
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(cacheNames.map(name => caches.delete(name)));
}

async function getCacheSize() {
  if ('estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }
  return 0;
}

// Web Share Target handling
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  const title = formData.get('title') || '';
  const text = formData.get('text') || '';
  const url = formData.get('url') || '';
  const files = formData.getAll('media');

  // Store shared data for the app to process
  const sharedData = {
    title,
    text,
    url,
    files: files.length > 0 ? files : null,
    timestamp: Date.now()
  };

  // Store in IndexedDB for the app to retrieve
  const db = await initializeOfflineStorage();
  const transaction = db.transaction(['pendingActions'], 'readwrite');
  const store = transaction.objectStore('pendingActions');
  await store.add({ type: 'shared-content', data: sharedData });

  // Redirect to create page
  return Response.redirect('/create?shared=true', 303);
}

// File System Access API support
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/open' && event.request.method === 'POST') {
    event.respondWith(handleFileOpen(event.request));
  }
});

async function handleFileOpen(request) {
  // Handle file opening through File System Access API
  return Response.redirect('/editor?file=new', 303);
}

console.log('[Service Worker] Loaded successfully. Version:', CACHE_VERSION);