/* HaNet's service worker (web app only, https://hanet-app.web.app).
 *
 * 1. Offline: keeps the app (every page and its scripts) from the build it
 *    belongs to, so HaNet opens without internet and shows what the phone
 *    kept last time (services/cache.ts). Pages come from this cache first,
 *    so a page always matches its scripts.
 * 2. Updates: a new build means a new sw.js. It installs in the background
 *    and waits; the app shows "Hay una versión nueva" (services/service-worker.ts)
 *    and, when the person accepts, this worker takes over and the page
 *    reloads. Until then the open app keeps its own files, even after the
 *    server stopped having them.
 * 3. Push: what the backend sends through Firebase Cloud Messaging
 *    (functions/classhall-notify.js, as data only) is shown here, and tapping
 *    it opens its screen in HaNet.
 *
 * `npm run web:build` (scripts/build-service-worker.js) fills in BUILD and
 * PRECACHE. Left as they are here (the development server), nothing is cached.
 */

const BUILD = 'dev';
const PRECACHE = [];

const APP_CACHE = `hanet-app-${BUILD}`;
// Fonts and images: their names carry their hash, so they never change.
const ASSETS_CACHE = 'hanet-assets-v1';
const ASSETS_LIMIT = 150;
const FALLBACK_PAGE = '/';

self.addEventListener('install', event => {
  if (!PRECACHE.length) return;
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // Pages are kept by their address without ".html", as the app asks for them.
    await Promise.all(PRECACHE.map(async url => {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      // A page that came through a redirect can't answer a navigation as it is.
      const kept = response.redirected
        ? new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers })
        : response;
      await cache.put(url, kept);
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('hanet-app-') && name !== APP_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// The fonts and images the page loaded before this worker took over: they
// come from the browser's own cache, so keeping them costs no download.
async function keepAssets(urls) {
  const cache = await caches.open(ASSETS_CACHE);
  await Promise.all(urls.slice(0, ASSETS_LIMIT).map(async value => {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/assets/')) return;
    if (await cache.match(url.pathname)) return;
    try {
      const response = await fetch(url.pathname);
      if (response.ok) await cache.put(url.pathname, response);
    } catch {
      // The next time the page asks for it, it is kept then.
    }
  }));
}

self.addEventListener('message', event => {
  if (event.data?.type === 'skip-waiting') void self.skipWaiting();
  if (event.data?.type === 'keep' && Array.isArray(event.data.urls)) event.waitUntil(keepAssets(event.data.urls));
});

function pagePath(url) {
  let path = url.pathname.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '');
  if (path.length > 1) path = path.replace(/\/$/, '');
  return path || '/';
}

async function page(request) {
  const cache = await caches.open(APP_CACHE);
  const kept = await cache.match(pagePath(new URL(request.url)));
  if (kept) return kept;
  try {
    return await fetch(request);
  } catch {
    // Offline on a page this build doesn't know: the Home, and the app finds its way.
    return (await cache.match(FALLBACK_PAGE)) || Response.error();
  }
}

async function appFile(request, key = request) {
  const kept = await caches.match(key, { cacheName: APP_CACHE });
  return kept || fetch(request);
}

async function asset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  // The error screens' drawings come with the build (scripts/build-service-worker.js).
  const kept = (await caches.match(request, { cacheName: APP_CACHE })) || (await cache.match(request));
  if (kept) return kept;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    // The oldest go first once there are too many.
    await Promise.all(keys.slice(0, Math.max(0, keys.length - ASSETS_LIMIT)).map(key => cache.delete(key)));
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !PRECACHE.length) return;
  const url = new URL(request.url);
  // Firebase, fonts from other sites and anything else outside HaNet go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(page(request));
  } else if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith(appFile(request));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(asset(request));
  } else if (PRECACHE.includes(url.pathname)) {
    // The manifest and the icons, whatever the query says.
    event.respondWith(appFile(request, url.pathname));
  }
});

// Only HaNet's own screens open from a notification.
function safeUrl(value) {
  return typeof value === 'string' && /^\/(?!\/)[A-Za-z0-9/_?=&%.-]*$/.test(value) ? value : '/';
}

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'HaNet';
  const body = data.body || payload.notification?.body || '';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/monochrome-512.png',
    lang: 'es-CL',
    data: { url: safeUrl(data.url) },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) {
      // The app moves to the screen without reloading (services/web-push.ts).
      open.postMessage({ type: 'open', url });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});
