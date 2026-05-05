// StockRadar Service Worker v2
const CACHE = 'stockradar-v2';
const FILES = ['./index.html', './app.js', './kr_stocks.js', './us_stocks.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API/RSS 요청은 캐시 안 함 (항상 최신)
  if (e.request.url.includes('allorigins') || e.request.url.includes('api.') || e.request.url.includes('rss') || e.request.url.includes('finance.yahoo')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
