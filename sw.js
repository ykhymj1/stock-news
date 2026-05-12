// StockRadar Service Worker v31 (V22++++++ - 뉴스 표시 강화)
const CACHE = 'stockradar-v31';
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
  
  // v22.js는 항상 네트워크 우선 (자주 업데이트되는 파일)
  if (e.request.url.includes('v22.js') || e.request.url.includes('sw.js')) {
    e.respondWith(
      fetch(e.request).then(networkResponse => {
        // 성공하면 캐시 업데이트
        const cloned = networkResponse.clone();
        caches.open(CACHE).then(c => c.put(e.request, cloned)).catch(() => {});
        return networkResponse;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
