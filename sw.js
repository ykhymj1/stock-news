// StockRadar Service Worker v38 (V22 최적 보유 기간 표시 추가)
// 변경: V22 화면에 백테스트 검증된 최적 보유 기간 표시
const CACHE = 'stockradar-v38';
const FILES = [
  './index.html', './app.js', './v22.js', './kr_stocks.js', './kr_stocks_extra.js', './us_stocks.js', './stock_info.js', './manifest.json',
  './favicon.ico',
  './icon-192.png', './icon-512.png', './icon-180.png',
  './icon-32.png', './icon-16.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}));
  // 새 SW가 즉시 활성화되도록 (대기 단계 건너뜀)
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      // 옛 캐시 모두 정리
      caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
      // 모든 열린 탭/PWA 즉시 새 SW가 제어
      self.clients.claim(),
    ])
  );
});

// 페이지에서 보낸 SKIP_WAITING 메시지로 즉시 활성화 (수동 트리거)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  
  // 1) API/외부 동적 데이터는 캐시 안 함 (항상 네트워크)
  if (url.includes('allorigins') || url.includes('api.') || url.includes('rss') ||
      url.includes('finance.yahoo') || url.includes('/v22-') ||
      url.includes('/recent-alerts') || url.includes('/stock-search') ||
      url.includes('workers.dev')) {
    return;  // SW가 가로채지 않고 브라우저 기본 동작
  }
  
  // 2) 우리 앱 파일(JS/HTML/CSS) - 네트워크 우선 + 오프라인 폴백
  //    → 새 버전이 GitHub에 올라가면 PWA도 즉시 최신 코드 받음
  const isOurFile = (
    url.includes('.js') || url.includes('.html') || url.includes('.css') ||
    url.endsWith('/') || url.includes('manifest.json')
  );
  
  if (isOurFile) {
    e.respondWith(
      fetch(e.request)
        .then(networkResponse => {
          // 성공 시 캐시 갱신 (오프라인 폴백용)
          if (networkResponse && networkResponse.status === 200) {
            const cloned = networkResponse.clone();
            caches.open(CACHE).then(c => c.put(e.request, cloned)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  
  // 3) 이미지·아이콘 등 정적 자산 - 캐시 우선 (드물게 바뀜)
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});
