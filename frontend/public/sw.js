const CACHE_PREFIX = 'shield-';
const CACHE_NAME = `${CACHE_PREFIX}__SHIELD_BUILD_ID__`;
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/shield-logo.svg',
  '/kalundborg-logo.svg'
];

async function matchCurrentThenAny(request) {
  const currentCache = await caches.open(CACHE_NAME);
  return (await currentCache.match(request)) || caches.match(request);
}

async function precacheCurrentBuild() {
  const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Asset manifest returned ${response.status}`);
  }

  const manifest = await response.json();
  const buildAssets = Object.values(manifest.files || {})
    .filter((asset) => asset.startsWith('/static/') && !asset.endsWith('.map'));
  const assets = [...new Set([...SHELL_ASSETS, ...buildAssets])];
  const cache = await caches.open(CACHE_NAME);

  // addAll rejects the install if a required build asset is missing. The
  // previous worker then stays active instead of exposing a partial release.
  await cache.addAll(assets);
}

// Install event - cache the current application shell and all build chunks.
self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheCurrentBuild()
      .then(() => self.skipWaiting())
  );
});

// Navigations must be network-first. A cache-first index.html can reference a
// hashed JavaScript bundle which no longer exists after a deployment.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.startsWith('/api/') || ['/health', '/readyz', '/sw.js'].includes(requestUrl.pathname)) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            return caches.open(CACHE_NAME)
              .then((cache) => cache.put('/', copy))
              .then(() => response);
          }
          return response;
        })
        .catch(() => matchCurrentThenAny('/'))
    );
    return;
  }

  if (requestUrl.pathname.startsWith('/static/')) {
    // Static assets are content-hashed. Search both the current and retained
    // previous cache so an already-open tab can still load its lazy chunks.
    event.respondWith(
      caches.match(event.request)
        .then((cached) => cached || fetch(event.request).then((response) => {
          if (!response.ok) return response;
          const copy = response.clone();
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, copy))
            .then(() => response);
        }))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok || !SHELL_ASSETS.includes(requestUrl.pathname)) {
          return response;
        }

        const copy = response.clone();
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, copy))
          .then(() => response);
      })
      .catch(() => matchCurrentThenAny(event.request))
  );
});

// Keep one previous release for tabs that were already open during deployment.
// Older application caches are removed so storage cannot grow without bounds.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const previousCache = cacheNames
        .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
        .slice(-1)[0];

      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName.startsWith(CACHE_PREFIX) &&
            cacheName !== CACHE_NAME &&
            cacheName !== previousCache
          ) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    console.log('Background sync triggered');
    // Handle background sync tasks here
  }
});

// Push notifications (for future use)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New update available',
    icon: '/shield-logo.svg',
    badge: '/shield-logo.svg',
    tag: 'shield-notification',
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/shield-logo.svg'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('S.H.I.E.L.D.', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
