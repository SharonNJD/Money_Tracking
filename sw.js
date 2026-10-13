// Offline support: precache the app shell, then serve from cache and refresh in the background.
// The deploy workflow stamps VERSION with the commit SHA so each release installs a fresh cache.
const VERSION = 'dev';
const CACHE = `money-tracker-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/charts.js',
  'js/dom.js',
  'js/icons.js',
  'js/logic.js',
  'js/router.js',
  'js/sheets.js',
  'js/store.js',
  'js/ui.js',
  'js/views/charts.js',
  'js/views/common.js',
  'js/views/history.js',
  'js/views/home.js',
  'js/views/settings.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('money-tracker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Calendar files go straight to the network so iOS hands them to the Calendar app.
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.ics')) return;
  event.respondWith(staleWhileRevalidate(event, request));
});

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const response = await network;
  if (response) return response;
  if (request.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
  return Response.error();
}
