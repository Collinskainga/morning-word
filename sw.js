/**
 * Morning Word — Service Worker
 * Handles: offline caching, push notifications, background sync
 */

const APP_VERSION   = 'v1.0.0';
const CACHE_NAME    = `morning-word-${APP_VERSION}`;
const PUSH_TAG      = 'morning-word-daily';

/* ─── Assets to cache on install ──────────────────────────────── */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap',
];

/* ═══════════════════════════════════════════════════════════════
   LIFECYCLE — INSTALL
   Cache all critical assets immediately
═══════════════════════════════════════════════════════════════ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())   // activate immediately
  );
});

/* ═══════════════════════════════════════════════════════════════
   LIFECYCLE — ACTIVATE
   Remove old caches from previous versions
═══════════════════════════════════════════════════════════════ */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())  // take control of all open tabs
  );
});

/* ═══════════════════════════════════════════════════════════════
   FETCH — NETWORK-FIRST WITH CACHE FALLBACK
   Strategy:
     • Anthropic API calls  → network only (never cache AI responses)
     • Google Fonts         → cache first (they rarely change)
     • Everything else      → network first, fall back to cache
═══════════════════════════════════════════════════════════════ */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Never cache Anthropic API calls
  if (url.hostname === 'api.anthropic.com') return;

  // Cache-first for Google Fonts (performance)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Network-first for everything else
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort: return the cached index for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/* ═══════════════════════════════════════════════════════════════
   PUSH NOTIFICATIONS
   Called by your backend server at the user's chosen hour.

   Expected push payload (JSON string):
   {
     "title": "Morning Word",
     "body": "\"For I know the plans I have for you...\" — Jeremiah 29:11",
     "verse": "For I know the plans I have for you...",
     "reference": "Jeremiah 29:11 (NIV)",
     "reflection": "...",
     "prayer": "..."
   }
═══════════════════════════════════════════════════════════════ */
self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'Morning Word',
      body: 'Your daily verse is ready. Tap to read.',
    };
  }

  const title = payload.title || 'Morning Word';
  const options = {
    body:    payload.body || 'Your daily verse is ready. Tap to read.',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-96.png',
    tag:     PUSH_TAG,               // replaces any previous notification
    renotify: false,                 // don't buzz again if tag matches
    silent:  false,
    vibrate: [100, 50, 100],
    data: {
      url:        '/?screen=devotional',
      verse:      payload.verse      || '',
      reference:  payload.reference  || '',
      reflection: payload.reflection || '',
      prayer:     payload.prayer     || '',
      timestamp:  Date.now(),
    },
    actions: [
      { action: 'read',   title: 'Read verse' },
      { action: 'later',  title: 'Remind me later' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CLICK
   Tapping the notification → open the devotional screen
   "Later" action  → schedule a reminder in 30 minutes
═══════════════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'later') {
    // Re-show the notification after 30 minutes
    event.waitUntil(
      new Promise(resolve => {
        setTimeout(() => {
          self.registration.showNotification('Morning Word — reminder', {
            body: 'Still time to read your morning verse.',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-96.png',
            tag: PUSH_TAG + '-reminder',
            data: event.notification.data,
          });
          resolve();
        }, 30 * 60 * 1000);
      })
    );
    return;
  }

  // Default — open the app at the devotional screen
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/?screen=devotional';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // If the app is already open, focus it and navigate
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              screen: 'devotional',
              data: event.notification.data,
            });
            return;
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION CLOSE
   Fired when the user swipes the notification away.
   Useful for analytics — log dismissals to your backend here.
═══════════════════════════════════════════════════════════════ */
self.addEventListener('notificationclose', event => {
  // Optional: POST to your analytics endpoint
  // fetch('/api/analytics/notification-dismissed', { method: 'POST', ... });
  console.log('[SW] Notification dismissed:', event.notification.tag);
});

/* ═══════════════════════════════════════════════════════════════
   MESSAGE CHANNEL
   Receive messages from the main app (index.html)
   e.g. to update cached data or trigger a sync
═══════════════════════════════════════════════════════════════ */
self.addEventListener('message', event => {
  if (!event.data) return;

  switch (event.data.type) {

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_VERSE':
      // Called by app.js after fetching a verse — cache it for offline
      caches.open(CACHE_NAME).then(cache => {
        const response = new Response(JSON.stringify(event.data.verse), {
          headers: { 'Content-Type': 'application/json' }
        });
        cache.put('/cached-verse', response);
      });
      break;

    case 'GET_VERSION':
      event.ports[0].postMessage({ version: APP_VERSION });
      break;
  }
});

/* ═══════════════════════════════════════════════════════════════
   BACKGROUND SYNC  (optional — for future use)
   If a verse fetch fails offline, retry when connectivity returns
═══════════════════════════════════════════════════════════════ */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-verse') {
    event.waitUntil(
      // Notify the open client to retry loading
      clients.matchAll({ type: 'window' }).then(windowClients => {
        windowClients.forEach(client => {
          client.postMessage({ type: 'RETRY_VERSE_FETCH' });
        });
      })
    );
  }
});
