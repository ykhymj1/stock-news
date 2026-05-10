// StockRadar Service Worker v24 (V22 v6.11 - 검색 평가 추가)
const CACHE = 'stockradar-v24';
const FILES = [
  './index.html', './app.js', './v22.js', './kr_stocks.js', './us_stocks.js', './stock_info.js', './manifest.json',
  './favicon.ico',
  './icon-192.png', './icon-512.png', './icon-180.png',
  './icon-32.png', './icon-16.png',
];

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
  if (e.request.url.includes('allorigins') || e.request.url.includes('api.') || e.request.url.includes('rss') ||
      e.request.url.includes('finance.yahoo') || e.request.url.includes('/v22-') ||
      e.request.url.includes('workers.dev')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
