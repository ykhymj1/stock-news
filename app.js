// ============================================
// StockRadar - 급등주 레이더 PWA
// ============================================

// ============================================
// 1. STATE & STORAGE
// ============================================
const STORE_KEY = 'stockradar_v2';
// API 키는 별도 저장 (버전 업그레이드해도 유지됨)
const API_KEYS_STORE = 'stockradar_api_keys_persistent';

const DEFAULTS = {
  market: 'kr',
  view: 'today',
  settings: {
    minImpact: 6,
    refreshMins: 10,
    popupEnabled: true,
    dartKey: '',
    workerUrl: 'https://ykh-stock-proxy.kyunghoyou.workers.dev',
    newsProxyUrl: 'https://ykh-news-proxy.kyunghoyou.workers.dev',
    geminiKey: '',           // Gemini API 키 (선택, 무료)
    useGemini: false,        // AI 분석 활성화
    macroAlerts: true,       // 거시 지표 알림 (FOMC, 환율 등)
    krWatchlist: [],         // 한국 관심종목 (종목코드)
    usWatchlist: [],         // 미국 관심종목
  },
  recommendations: {},  // { 'YYYY-MM-DD': { kr: [{...}], us: [{...}] } }
  tracking: [],         // [{ ticker, name, market, addedDate, addedPrice, currentPrice, prices: [...], reason }]
  alertsSeen: [],       // 이미 알림 표시한 추천 ID
};

let STATE = loadState();

// ============================================
// API 키 영구 저장 (다중 백업)
// localStorage + sessionStorage + 쿠키 (어떤 캐시 삭제에도 1개는 남도록)
// ============================================
function loadPersistentApiKeys() {
  // 1) localStorage 시도
  try {
    const saved = localStorage.getItem(API_KEYS_STORE);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && (parsed.dartKey || parsed.geminiKey || parsed.workerUrl)) {
        return parsed;
      }
    }
  } catch (e) {}

  // 2) 쿠키에서 백업 복원 시도 (1년 보존)
  try {
    const cookieMatch = document.cookie.match(/stockradar_keys=([^;]+)/);
    if (cookieMatch) {
      const decoded = decodeURIComponent(cookieMatch[1]);
      const parsed = JSON.parse(decoded);
      if (parsed && (parsed.dartKey || parsed.geminiKey)) {
        // 쿠키에서 복원 → localStorage에도 다시 저장
        try { localStorage.setItem(API_KEYS_STORE, decoded); } catch (e) {}
        console.log('🔐 쿠키 백업에서 API 키 복원됨');
        return parsed;
      }
    }
  } catch (e) {}

  return {};
}

function savePersistentApiKeys(keys) {
  const json = JSON.stringify(keys);

  // 1) localStorage
  try {
    localStorage.setItem(API_KEYS_STORE, json);
  } catch (e) {
    console.error('localStorage 저장 실패:', e);
  }

  // 2) 쿠키 백업 (1년, HttpOnly 아니므로 자바스크립트로 읽기 가능)
  try {
    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    const cookieValue = encodeURIComponent(json);
    // 4KB 제한 안에 들어가므로 안전
    if (cookieValue.length < 4000) {
      document.cookie = `stockradar_keys=${cookieValue}; expires=${oneYear.toUTCString()}; path=/; SameSite=Lax`;
    }
  } catch (e) {}

  // 3) sessionStorage (탭 닫으면 삭제되지만 새로고침에는 강함)
  try {
    sessionStorage.setItem(API_KEYS_STORE, json);
  } catch (e) {}
}

function loadState() {
  // 1) 영구 보관된 API 키 먼저 로드
  const persistentKeys = loadPersistentApiKeys();

  let baseState = JSON.parse(JSON.stringify(DEFAULTS));

  // 2) 현재 버전 데이터 로드
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      baseState = {
        ...baseState,
        ...parsed,
        settings: { ...baseState.settings, ...(parsed.settings || {}) }
      };
    } else {
      // 3) 이전 버전(v1)에서 자동 마이그레이션
      const oldData = localStorage.getItem('stockradar_v1');
      if (oldData) {
        try {
          const old = JSON.parse(oldData);
          baseState = {
            ...baseState,
            ...old,
            settings: { ...baseState.settings, ...(old.settings || {}) }
          };
          console.log('✅ v1 → v2 데이터 자동 마이그레이션 완료');
          // 이전 버전 키들에서 API 키 영구 저장소로 백업
          if (old.settings?.dartKey) persistentKeys.dartKey = old.settings.dartKey;
          if (old.settings?.geminiKey) persistentKeys.geminiKey = old.settings.geminiKey;
          if (old.settings?.workerUrl) persistentKeys.workerUrl = old.settings.workerUrl;
          if (old.settings?.newsProxyUrl) persistentKeys.newsProxyUrl = old.settings.newsProxyUrl;
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 4) 영구 저장된 API 키로 덮어쓰기 (가장 우선)
  if (persistentKeys.dartKey) baseState.settings.dartKey = persistentKeys.dartKey;
  if (persistentKeys.geminiKey) baseState.settings.geminiKey = persistentKeys.geminiKey;
  if (persistentKeys.workerUrl) baseState.settings.workerUrl = persistentKeys.workerUrl;
  if (persistentKeys.newsProxyUrl) baseState.settings.newsProxyUrl = persistentKeys.newsProxyUrl;
  if (persistentKeys.useGemini !== undefined) baseState.settings.useGemini = persistentKeys.useGemini;

  // 5) 영구 저장소 갱신 (마이그레이션된 키 저장)
  savePersistentApiKeys(persistentKeys);

  return baseState;
}

function saveState() {
  // 1) 일반 상태 저장
  localStorage.setItem(STORE_KEY, JSON.stringify(STATE));

  // 2) API 키는 별도로 영구 저장
  const persistentKeys = {
    dartKey: STATE.settings.dartKey || '',
    geminiKey: STATE.settings.geminiKey || '',
    workerUrl: STATE.settings.workerUrl || '',
    newsProxyUrl: STATE.settings.newsProxyUrl || '',
    useGemini: STATE.settings.useGemini || false,
  };
  savePersistentApiKeys(persistentKeys);
}

// ============================================
// 2. UTIL FUNCTIONS
// ============================================
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function fmtTime(s) {
  if (!s) return '-';
  const d = new Date(s);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function fmtNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '0%';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function timeAgo(dateStr) {
  const now = new Date();
  const then = new Date(dateStr);
  const diff = (now - then) / 1000;
  if (diff < 60) return `${Math.floor(diff)}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function showToast(msg, dur = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._tid);
  showToast._tid = setTimeout(() => t.classList.remove('show'), dur);
}

function showAlert(title, desc, icon = '🚀') {
  if (!STATE.settings.popupEnabled) return;
  const pop = document.getElementById('alertPop');
  document.getElementById('alertTtl').textContent = title;
  document.getElementById('alertDesc').textContent = desc;
  document.getElementById('alertIco').textContent = icon;
  pop.classList.add('show');
  clearTimeout(showAlert._tid);
  showAlert._tid = setTimeout(dismissAlert, 6000);
}

function dismissAlert() {
  document.getElementById('alertPop').classList.remove('show');
}

// ============================================
// 3. KEYWORD-BASED IMPACT ANALYSIS (FREE)
// ============================================
const KW_KR = {
  STRONG_POS: [
    '어닝 서프라이즈', '실적 호조', '신고가', '사상 최대', '역대 최대',
    '공급계약체결', '단일판매', '기술수출', '라이선스',
    'FDA 승인', '임상 성공', '특허', '흑자 전환',
    '인수합병', 'M&A', '지분 인수', '주식분할', '무상증자',
    '자사주 매입', '자사주 소각', '배당 확대',
    '정부 지원', '대규모 수주', '수주', '국책'
  ],
  WEAK_POS: ['상향', '확대', '증가', '성장', '신제품', '출시', '협력', '파트너십', '투자 유치', '회복', '개선', '호조', '강세'],
  STRONG_NEG: [
    '어닝 쇼크', '실적 충격', '적자 전환', '영업적자',
    '거래정지', '상장폐지', '감자', '부도', '법정관리',
    '임상 실패', 'FDA 거절', '리콜', '소송', '횡령', '배임', '분식회계',
    '감사의견 거절', '관리종목', '유상증자'
  ],
  WEAK_NEG: ['하향', '축소', '감소', '둔화', '지연', '우려', '리스크', '악화', '부진', '약세'],
};

const KW_EN = {
  STRONG_POS: [
    'earnings beat', 'beats estimates', 'record high', 'all-time high',
    'fda approval', 'fda approves', 'patent granted', 'breakthrough',
    'acquisition', 'merger', 'buyout', 'acquires',
    'dividend increase', 'buyback', 'stock split',
    'major contract', 'guidance raised', 'raises guidance',
    'partnership', 'approval', 'clearance'
  ],
  WEAK_POS: ['growth', 'expand', 'launch', 'upgrade', 'positive', 'strong', 'beats', 'exceeds'],
  STRONG_NEG: [
    'earnings miss', 'misses estimates', 'guidance cut', 'lowers guidance',
    'bankruptcy', 'delisting', 'halted', 'lawsuit', 'investigation', 'fraud',
    'fda rejection', 'recall', 'downgrade', 'going concern',
    'ceo resigns', 'cfo resigns', 'data breach'
  ],
  WEAK_NEG: ['decline', 'decrease', 'slowdown', 'delayed', 'concerns', 'risk', 'weak', 'miss'],
};

function analyzeImpact(text, lang = 'ko') {
  const t = text.toLowerCase();
  const kw = lang === 'ko' ? KW_KR : KW_EN;
  let score = 5;
  const matched = [];
  for (const k of kw.STRONG_POS) if (t.includes(k.toLowerCase())) { score += 3; matched.push(`+${k}`); }
  for (const k of kw.WEAK_POS) if (t.includes(k.toLowerCase())) { score += 1; matched.push(`+${k}`); }
  for (const k of kw.STRONG_NEG) if (t.includes(k.toLowerCase())) { score -= 3; matched.push(`-${k}`); }
  for (const k of kw.WEAK_NEG) if (t.includes(k.toLowerCase())) { score -= 1; matched.push(`-${k}`); }
  return { score: Math.max(1, Math.min(10, score)), matched: matched.slice(0, 5) };
}

function impactClass(score) {
  if (score >= 9) return 'impact-9';
  if (score >= 7) return 'impact-7';
  if (score >= 6) return 'impact-6';
  if (score === 5) return 'impact-5';
  return 'impact-low';
}

function impactEmoji(score) {
  if (score >= 8) return '🚀';
  if (score >= 7) return '📈';
  if (score >= 6) return '🟢';
  if (score === 5) return '⚪';
  if (score >= 3) return '🔴';
  return '💥';
}

// ============================================
// 4. DATA FETCHING (FREE SOURCES)
// ============================================

// CORS-friendly proxy (allorigins.win) - 카드 등록 없이 사용 가능
async function fetchProxy(url, timeoutMs = 12000) {
  // 새 RSS/뉴스 전용 Worker 사용 (기존 stock-proxy와 분리)
  const newsProxy = STATE.settings.newsProxyUrl || 'https://ykh-news-proxy.kyunghoyou.workers.dev';

  const proxies = [
    newsProxy.replace(/\/$/, '') + '/?url=' + encodeURIComponent(url),
    'https://corsproxy.io/?' + encodeURIComponent(url),
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  ];

  let lastErr = null;
  for (const proxy of proxies) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(proxy, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      // 빈 응답 또는 에러 JSON 응답 거부
      if (!txt || txt.length < 50) throw new Error('empty response');
      // 에러 JSON 응답 거부 (예: {"error": "host not allowed"})
      if (txt.startsWith('{"error"') || txt.startsWith('{ "error"')) {
        try {
          const errJson = JSON.parse(txt);
          throw new Error(errJson.error || 'proxy error');
        } catch (parseE) {
          throw new Error('error response');
        }
      }
      return txt;
    } catch (e) {
      clearTimeout(tid);
      lastErr = e;
      // 첫 시도 실패는 조용히, 나머지는 경고
      if (proxy !== proxies[0]) {
        console.warn(`프록시 실패 (${proxy.substring(0, 60)}...):`, e.message);
      }
    }
  }
  throw lastErr || new Error('all proxies failed');
}

// ---- 한국 뉴스: 다중 RSS 피드 (한국 시장 강화) ----
async function fetchKRNews() {
  const FEEDS = [
    { url: 'https://rss.hankyung.com/feed/economy.xml', src: '한경 경제' },
    { url: 'https://rss.hankyung.com/feed/realestate.xml', src: '한경 부동산' },
    { url: 'https://rss.hankyung.com/feed/it.xml', src: '한경 IT' },
    { url: 'https://www.mk.co.kr/rss/30100041/', src: '매경 증권' },
    { url: 'https://www.mk.co.kr/rss/50300009/', src: '매경 경제' },
    { url: 'https://www.mk.co.kr/rss/50000001/', src: '매경 헤드라인' },
    { url: 'https://www.mk.co.kr/rss/40300001/', src: '매경 기업' },
  ];
  const items = [];
  for (const feed of FEEDS) {
    try {
      const txt = await fetchProxy(feed.url);
      const xml = new DOMParser().parseFromString(txt, 'text/xml');
      const entries = xml.querySelectorAll('item');
      entries.forEach((e, idx) => {
        if (idx > 30) return;
        const title = e.querySelector('title')?.textContent || '';
        const link = e.querySelector('link')?.textContent || '';
        const pub = e.querySelector('pubDate')?.textContent || '';
        const desc = e.querySelector('description')?.textContent || '';
        if (!title) return;
        items.push({
          market: 'kr', source: feed.src,
          title, link, summary: desc.replace(/<[^>]*>/g, '').substring(0, 200),
          publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        });
      });
    } catch (e) {
      console.warn(`KR RSS fail (${feed.src}):`, e.message);
    }
  }
  return items;
}

// ---- 한국 공시: DART OpenAPI ----
async function fetchKRDisclosures() {
  const key = STATE.settings.dartKey;
  if (!key) return [];
  const today = todayStr().replace(/-/g, '');
  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}&bgn_de=${today}&end_de=${today}&page_count=100&sort=date&sort_mth=desc`;
  try {
    const txt = await fetchProxy(url);
    const j = JSON.parse(txt);
    if (j.status !== '000') {
      console.warn('DART:', j.message);
      return [];
    }
    return (j.list || []).map(it => ({
      market: 'kr', source: 'DART (공시)',
      title: `[${it.report_nm}] ${it.corp_name}`,
      link: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${it.rcept_no}`,
      corpName: it.corp_name,
      stockCode: it.stock_code,
      reportType: it.report_nm,
      publishedAt: parseDartDate(it.rcept_dt),
      type: 'disclosure',
    }));
  } catch (e) {
    console.warn('DART fail', e);
    return [];
  }
}

function parseDartDate(s) {
  // "20260505" -> ISO
  if (!s || s.length !== 8) return new Date().toISOString();
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T09:00:00+09:00`).toISOString();
}

// ---- 미국 공시: SEC EDGAR ----
async function fetchUSFilings() {
  const url = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&owner=include&count=40&output=atom';
  try {
    const txt = await fetchProxy(url);
    const xml = new DOMParser().parseFromString(txt, 'text/xml');
    const items = [];
    xml.querySelectorAll('entry').forEach(e => {
      const title = e.querySelector('title')?.textContent || '';
      const link = e.querySelector('link')?.getAttribute('href') || '';
      const updated = e.querySelector('updated')?.textContent || '';
      const summary = e.querySelector('summary')?.textContent || '';
      // "8-K - Apple Inc (0000320193) (Filer)"
      const m = title.match(/- (.+?) \(\d{10}\)/);
      const company = m ? m[1].trim() : title;
      items.push({
        market: 'us', source: 'SEC EDGAR',
        title, link, summary,
        company,
        publishedAt: updated || new Date().toISOString(),
        type: 'disclosure',
      });
    });
    return items;
  } catch (e) {
    console.warn('SEC fail', e);
    return [];
  }
}

// ---- 미국 뉴스: Yahoo Finance (기본 50+ 종목 모니터링) ----
async function fetchUSNews(tickers = null) {
  if (!tickers || tickers.length === 0) {
    tickers = window.US_WATCHLIST_DEFAULT || ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'TSLA', 'AMZN', 'META', 'AMD', 'NFLX', 'AVGO'];
  }
  const items = [];
  // 배치로 병렬 처리 (5개씩)
  const batches = [];
  for (let i = 0; i < tickers.length; i += 5) {
    batches.push(tickers.slice(i, i + 5));
  }
  for (const batch of batches) {
    await Promise.allSettled(batch.map(async tk => {
      try {
        const txt = await fetchProxy(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${tk}&region=US&lang=en-US`, 8000);
        const xml = new DOMParser().parseFromString(txt, 'text/xml');
        xml.querySelectorAll('item').forEach((e, idx) => {
          if (idx > 5) return;
          const title = e.querySelector('title')?.textContent || '';
          const link = e.querySelector('link')?.textContent || '';
          const pub = e.querySelector('pubDate')?.textContent || '';
          if (!title) return;
          items.push({
            market: 'us', source: 'Yahoo Finance',
            ticker: tk,
            title, link,
            publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
          });
        });
      } catch (e) {
        // 개별 종목 실패는 무시
      }
    }));
  }
  return items;
}

// ============================================
// 5b. FINANCIAL DATA (재무 정보)
// ============================================

async function fetchFinancials(ticker, market = 'kr') {
  const newsProxy = STATE.settings.newsProxyUrl;
  if (!newsProxy) return null;

  if (market === 'kr') {
    // Naver Finance API로 한국 종목 재무 정보
    try {
      const url = `https://m.stock.naver.com/api/stock/${ticker}/integration`;
      const proxy = newsProxy.replace(/\/$/, '') + '/?url=' + encodeURIComponent(url);
      const r = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      // 응답에서 필요한 필드 추출
      const stockEnd = j.stockEndType || 'KOSPI';
      const total = j.totalInfos || [];
      const findVal = (key) => {
        const item = total.find(it => it.key === key || it.code === key);
        return item ? item.value : null;
      };
      return {
        marketCap: findVal('marketValue'),  // 시가총액
        per: findVal('per') || findVal('PER'),
        pbr: findVal('pbr') || findVal('PBR'),
        eps: findVal('eps') || findVal('EPS'),
        bps: findVal('bps') || findVal('BPS'),
        dividendYield: findVal('dividendRatio') || findVal('dividend'),
        high52w: findVal('high52'),
        low52w: findVal('low52'),
        volume: findVal('volume'),
        market: stockEnd,
      };
    } catch (e) {
      console.warn('KR financials fail', ticker, e.message);
      return null;
    }
  } else {
    // Yahoo Finance API로 미국 종목 재무 정보
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`;
      const proxy = newsProxy.replace(/\/$/, '') + '/?url=' + encodeURIComponent(url);
      const r = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (!meta) return null;
      return {
        marketCap: null,
        per: null,
        currency: meta.currency,
        currentPrice: meta.regularMarketPrice,
        previousClose: meta.chartPreviousClose,
        high52w: meta.fiftyTwoWeekHigh,
        low52w: meta.fiftyTwoWeekLow,
        volume: meta.regularMarketVolume,
        avgVolume: meta.averageVolume,
        exchange: meta.exchangeName,
      };
    } catch (e) {
      console.warn('US financials fail', ticker, e.message);
      return null;
    }
  }
}

// 일봉 차트 데이터 가져오기 (3개월)
async function fetchChartData(ticker, market = 'kr', range = '3mo') {
  const newsProxy = STATE.settings.newsProxyUrl;
  if (!newsProxy) return null;

  const symbol = market === 'kr' ? ticker + '.KS' : ticker;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
    const proxy = newsProxy.replace(/\/$/, '') + '/?url=' + encodeURIComponent(url);
    const r = await fetch(proxy, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const result = j?.chart?.result?.[0];
    if (!result) return null;
    const ts = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const closes = quote.close || [];
    const highs = quote.high || [];
    const lows = quote.low || [];
    const opens = quote.open || [];
    const volumes = quote.volume || [];
    const data = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null) continue;
      data.push({
        ts: ts[i] * 1000,
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        o: opens[i], h: highs[i], l: lows[i], c: closes[i],
        v: volumes[i] || 0,
      });
    }
    return data;
  } catch (e) {
    console.warn('Chart data fail', ticker, e.message);
    return null;
  }
}

// ============================================
// 5c. MACRO INDICATORS (거시 지표)
// ============================================

let _macroCache = null;
let _macroCacheTime = 0;

async function fetchMacroIndicators() {
  // 5분 캐시
  if (_macroCache && (Date.now() - _macroCacheTime) < 5 * 60 * 1000) {
    return _macroCache;
  }
  const macro = {};
  const newsProxy = STATE.settings.newsProxyUrl;

  // 1) USD/KRW 환율
  try {
    const txt = await fetchProxy('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', 5000);
    const j = JSON.parse(txt);
    macro.usdKrw = j?.usd?.krw;
  } catch (e) {
    console.warn('FX fail', e.message);
  }

  // 2) 미국 주요 지수 (S&P 500, Nasdaq, Dow)
  if (newsProxy) {
    const indices = [
      { sym: '^GSPC', name: 'S&P 500' },
      { sym: '^IXIC', name: 'Nasdaq' },
      { sym: '^DJI', name: 'Dow' },
      { sym: '^KS11', name: 'KOSPI' },
      { sym: '^KQ11', name: 'KOSDAQ' },
    ];
    macro.indices = [];
    await Promise.allSettled(indices.map(async ({ sym, name }) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1d`;
        const proxy = newsProxy.replace(/\/$/, '') + '/?url=' + encodeURIComponent(url);
        const r = await fetch(proxy, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return;
        const j = await r.json();
        const meta = j?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice) {
          const change = ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100);
          macro.indices.push({
            symbol: sym, name,
            price: meta.regularMarketPrice,
            change,
          });
        }
      } catch (e) {}
    }));
  }

  _macroCache = macro;
  _macroCacheTime = Date.now();
  return macro;
}

// ============================================
// 5d. AI ANALYSIS (Gemini 무료, 선택)
// ============================================

async function analyzeWithGemini(text, lang = 'ko') {
  const key = STATE.settings.geminiKey;
  if (!key || !STATE.settings.useGemini) return null;
  try {
    const prompt = lang === 'ko'
      ? `다음 한국 주식 관련 뉴스/공시를 분석하세요. JSON 형식으로 응답:\n{"impact":1-10 점수,"reason":"한 문장 핵심 분석","positives":["긍정 요인"],"negatives":["부정 요인"]}\n\n뉴스: ${text}`
      : `Analyze this US stock news/filing. Respond in JSON:\n{"impact":1-10 score,"reason":"one sentence analysis (in Korean)","positives":["positives"],"negatives":["negatives"]}\n\nNews: ${text}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      console.warn('Gemini', r.status);
      return null;
    }
    const j = await r.json();
    const respText = j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // JSON 추출
    const m = respText.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (e) {}
    }
    return null;
  } catch (e) {
    console.warn('Gemini error', e.message);
    return null;
  }
}

// ============================================
// 5. STOCK PRICE FETCH (Kyungho's Cloudflare Worker style)
// ============================================
async function fetchPrice(ticker, market = 'kr') {
  const worker = STATE.settings.workerUrl;
  const isKR = market === 'kr';
  const tk = isKR ? `${ticker}.KS` : ticker;

  // 1) Try Cloudflare Worker (Yahoo v8 chart)
  if (worker) {
    try {
      const r = await fetch(`${worker}/?yh=${encodeURIComponent(tk)}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const j = await r.json();
        const m = j?.chart?.result?.[0]?.meta;
        if (m?.regularMarketPrice > 0) {
          return {
            price: m.regularMarketPrice,
            prev: m.chartPreviousClose || m.regularMarketPrice,
            currency: m.currency || (isKR ? 'KRW' : 'USD'),
          };
        }
      }
    } catch (e) {}
    // Naver for KR
    if (isKR) {
      try {
        const r = await fetch(`${worker}/?nv=${encodeURIComponent(ticker)}`, { signal: AbortSignal.timeout(6000) });
        if (r.ok) {
          const j = await r.json();
          const cur = parseFloat((j.closePrice || j.now || '').toString().replace(/,/g, ''));
          if (cur > 0) {
            let prev = cur;
            if (j.compareToPreviousPrice) {
              const sign = j.compareToPreviousPrice.code === '2' ? 1 : (j.compareToPreviousPrice.code === '5' ? -1 : 0);
              const diff = parseFloat((j.comparePreviousClosePrice || '0').toString().replace(/,/g, ''));
              prev = cur - (sign * diff);
            }
            return { price: cur, prev: prev || cur, currency: 'KRW' };
          }
        }
      } catch (e) {}
    }
  }

  // 2) Fallback: direct allorigins proxy
  try {
    const yUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${tk}?interval=1d&range=1d`;
    const txt = await fetchProxy(yUrl, 8000);
    const j = JSON.parse(txt);
    const m = j?.chart?.result?.[0]?.meta;
    if (m?.regularMarketPrice > 0) {
      return {
        price: m.regularMarketPrice,
        prev: m.chartPreviousClose || m.regularMarketPrice,
        currency: m.currency || (isKR ? 'KRW' : 'USD'),
      };
    }
  } catch (e) {}

  return null;
}

// ============================================
// 6. STOCK ANALYSIS & RECOMMENDATION
// ============================================

// 종목명 → 티커 매핑 (외부 파일에서 로드, kr_stocks.js / us_stocks.js)
// window.KR_STOCKS 와 window.US_STOCKS 사용
function getKRStocks() { return window.KR_STOCKS || {}; }
function getUSStocks() { return window.US_STOCKS || {}; }

// ETF 편입 정보 (대표 ETF)
const KR_ETF = {
  '005930': [['KODEX 200', 28.5], ['TIGER 200', 28.4], ['KODEX 코스피', 27.1], ['TIGER 반도체', 22.3]],
  '000660': [['KODEX 200', 6.8], ['TIGER 반도체', 18.1], ['KODEX 반도체', 18.5]],
  '035420': [['KODEX 200', 3.2], ['KODEX IT', 12.5], ['TIGER IT', 12.2]],
  '035720': [['KODEX 200', 1.5], ['KODEX IT', 6.5]],
  '207940': [['KODEX 200', 4.5], ['TIGER 헬스케어', 18.2]],
  '373220': [['KODEX 200', 4.2], ['KODEX 2차전지', 15.5]],
  '247540': [['KODEX 2차전지', 12.8], ['TIGER 2차전지', 12.5]],
  '086520': [['KODEX 2차전지', 8.5], ['TIGER 2차전지', 8.2]],
};
const US_ETF = {
  'AAPL': [['SPY', 7.1], ['QQQ', 8.5], ['VOO', 7.0], ['XLK', 22.5]],
  'MSFT': [['SPY', 6.8], ['QQQ', 8.2], ['VOO', 6.7], ['XLK', 21.8]],
  'NVDA': [['SPY', 6.2], ['QQQ', 7.8], ['VOO', 6.1], ['SOXX', 14.3], ['XLK', 18.5]],
  'TSLA': [['SPY', 1.8], ['QQQ', 3.2], ['IDRV', 12.5]],
  'GOOGL': [['SPY', 4.0], ['QQQ', 5.1], ['VOO', 3.9]],
  'AMZN': [['SPY', 3.2], ['QQQ', 4.5], ['XLY', 18.5]],
  'META': [['SPY', 2.5], ['QQQ', 3.8], ['XLC', 22.3]],
  'AMD': [['SPY', 0.5], ['QQQ', 1.2], ['SOXX', 8.5]],
};

function getETFs(ticker, market) {
  const map = market === 'kr' ? KR_ETF : US_ETF;
  return map[ticker] || [];
}

function extractTickerKR(text) {
  // 외부 stocks 데이터 사용
  const stocks = window.KR_STOCKS || {};
  const sortedNames = Object.keys(stocks).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (text.includes(name)) return { ticker: stocks[name], name };
  }
  // 6자리 숫자 직접 매칭
  const m = text.match(/\b(\d{6})\b/);
  if (m) {
    const codeToName = window.KR_CODE_TO_NAME || {};
    return { ticker: m[1], name: codeToName[m[1]] || '미상' };
  }
  return null;
}

// 한 텍스트에서 여러 한국 종목 모두 추출 (kr_stocks.js의 함수 사용)
function extractAllKRTickers(text) {
  // window.extractAllKRTickers는 kr_stocks.js에서 정의된 외부 함수
  // 자기 자신과 이름이 겹치므로 직접 stocks 객체에서 추출
  const stocks = window.KR_STOCKS || {};
  const found = [];
  const seen = new Set();
  // 1) 회사명 직접 매칭 (긴 이름 우선)
  const sortedNames = Object.keys(stocks).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (text.includes(name)) {
      const code = stocks[name];
      if (!seen.has(code)) {
        seen.add(code);
        found.push({ ticker: code, name });
      }
    }
  }
  // 2) 6자리 종목코드 직접 매칭
  const codeMatches = text.match(/\b(\d{6})\b/g);
  if (codeMatches) {
    const codeToName = window.KR_CODE_TO_NAME || {};
    for (const code of codeMatches) {
      if (!seen.has(code) && codeToName[code]) {
        seen.add(code);
        found.push({ ticker: code, name: codeToName[code] });
      }
    }
  }
  return found;
}

function extractTickerUS(text, knownTicker = null) {
  const stocks = window.US_STOCKS || {};
  const lower = text.toLowerCase();
  const sortedNames = Object.keys(stocks).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (lower.includes(name)) {
      return { ticker: stocks[name], name: name.charAt(0).toUpperCase() + name.slice(1) };
    }
  }
  // SEC 형식: "Apple Inc (0000320193)"
  const m = text.match(/- (.+?) \(\d{10}\)/);
  if (m) {
    const company = m[1].trim();
    const lc = company.toLowerCase();
    for (const name of sortedNames) {
      if (lc.includes(name)) {
        return { ticker: stocks[name], name: company };
      }
    }
    return { ticker: company.replace(/[^A-Z0-9]/gi, '').slice(0, 10).toUpperCase(), name: company };
  }
  if (knownTicker) return { ticker: knownTicker, name: knownTicker };
  return null;
}

// 종목별로 뉴스 그룹화 + 점수 합산 → TOP N
function aggregateByStock(items, market) {
  const stocks = {};
  for (const item of items) {
    const lang = market === 'kr' ? 'ko' : 'en';
    const text = `${item.title} ${item.summary || ''}`;
    const { score, matched } = analyzeImpact(text, lang);

    let infos = [];
    if (market === 'kr') {
      // DART 공시는 직접 매핑됨
      if (item.stockCode) {
        infos = [{ ticker: item.stockCode, name: item.corpName }];
      } else {
        // 한 뉴스에 여러 종목 언급되면 모두 추출
        infos = extractAllKRTickers(text);
        if (infos.length === 0) {
          const single = extractTickerKR(text);
          if (single) infos = [single];
        }
      }
    } else {
      const info = extractTickerUS(text, item.ticker);
      if (info) infos = [info];
    }

    for (const info of infos) {
      if (!info || !info.ticker) continue;
      const key = info.ticker;
      if (!stocks[key]) {
        stocks[key] = {
          ticker: key, name: info.name, market,
          totalScore: 0, items: [], maxImpact: 0, latestDate: null,
        };
      }
      // 같은 뉴스가 같은 종목에 중복 추가되지 않도록
      if (!stocks[key].items.find(it => it.link === item.link)) {
        stocks[key].items.push({ ...item, score, matched });
        stocks[key].totalScore += Math.max(0, score - 5);
        stocks[key].maxImpact = Math.max(stocks[key].maxImpact, score);
        if (!stocks[key].latestDate || item.publishedAt > stocks[key].latestDate) {
          stocks[key].latestDate = item.publishedAt;
        }
      }
    }
  }
  return Object.values(stocks)
    .filter(s => s.maxImpact >= STATE.settings.minImpact)
    .sort((a, b) => b.totalScore - a.totalScore);
}

// ============================================
// 7. ANALYZE NOW (메인 분석 함수)
// ============================================
let _analyzing = false;

async function analyzeNow() {
  if (_analyzing) {
    showToast('이미 분석 중입니다');
    return;
  }
  _analyzing = true;
  document.getElementById('topBadge').textContent = '분석중';
  document.getElementById('refreshBtn').style.transform = 'rotate(360deg)';
  document.getElementById('refreshBtn').style.transition = 'transform 1s';

  document.getElementById('topList').innerHTML = '<div class="loading"><div class="spinner"></div>뉴스/공시 수집중...</div>';
  document.getElementById('extraList').innerHTML = '';

  try {
    const market = STATE.market;
    let items = [];

    if (market === 'kr') {
      const [news, disclosures] = await Promise.all([fetchKRNews(), fetchKRDisclosures()]);
      items = [...disclosures, ...news];
    } else {
      const [filings, news] = await Promise.all([fetchUSFilings(), fetchUSNews()]);
      items = [...filings, ...news];
    }

    if (items.length === 0) {
      document.getElementById('topList').innerHTML = '<div class="empty"><div class="ico">📭</div><div class="title">데이터 없음</div><div class="desc">RSS/API 응답이 없습니다.<br/>잠시 후 다시 시도하거나 설정에서 API 키를 확인하세요.</div></div>';
      _analyzing = false;
      document.getElementById('topBadge').textContent = '대기';
      return;
    }

    showToast(`${items.length}개 항목 수집됨, 분석중...`);

    const stocks = aggregateByStock(items, market);

    // 추천 저장
    const today = todayStr();
    if (!STATE.recommendations[today]) STATE.recommendations[today] = { kr: [], us: [] };
    STATE.recommendations[today][market] = stocks.slice(0, 10).map(s => ({
      ticker: s.ticker, name: s.name, market: s.market,
      totalScore: s.totalScore, maxImpact: s.maxImpact,
      itemCount: s.items.length,
      latestDate: s.latestDate,
      topNews: s.items.slice(0, 3).map(it => ({
        title: it.title, link: it.link, source: it.source,
        score: it.score, matched: it.matched,
        publishedAt: it.publishedAt,
      })),
      analyzedAt: new Date().toISOString(),
    }));
    saveState();

    // 화면 그리기
    renderToday();

    // 새 추천 알림
    const top1 = stocks[0];
    if (top1 && !STATE.alertsSeen.includes(`${today}_${market}_${top1.ticker}`)) {
      STATE.alertsSeen.push(`${today}_${market}_${top1.ticker}`);
      saveState();
      const flag = market === 'kr' ? '🇰🇷' : '🇺🇸';
      showAlert(
        `${flag} 오늘의 1위: ${top1.name}`,
        `임팩트 ${top1.maxImpact}/10 · 뉴스 ${top1.items.length}건`,
        impactEmoji(top1.maxImpact)
      );
    }

    document.getElementById('topBadge').textContent = `${stocks.length}개 발견`;
    showToast(`✅ 분석 완료 (${stocks.length}개 종목)`);
  } catch (e) {
    console.error(e);
    document.getElementById('topList').innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="title">오류 발생</div><div class="desc">${e.message || e}</div></div>`;
    document.getElementById('topBadge').textContent = '오류';
  }
  _analyzing = false;
}

// ============================================
// 8. RENDER FUNCTIONS
// ============================================
function renderToday() {
  const today = todayStr();
  const market = STATE.market;
  document.getElementById('heroDate').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

  const recs = STATE.recommendations[today]?.[market] || [];
  document.getElementById('heroCount').textContent = recs.length;

  const top5 = recs.slice(0, 5);
  const extra = recs.slice(5, 10);

  if (top5.length === 0) {
    document.getElementById('topList').innerHTML = '<div class="empty"><div class="ico">📡</div><div class="title">아직 분석 안 됨</div><div class="desc">"지금 분석" 버튼을 눌러<br/>오늘의 추천을 받아보세요</div></div>';
    document.getElementById('extraList').innerHTML = '';
    return;
  }

  document.getElementById('topList').innerHTML = top5.map((s, i) => renderStockCard(s, i + 1, i === 0)).join('');
  document.getElementById('extraList').innerHTML = extra.length
    ? extra.map((s, i) => renderStockCard(s, i + 6, false)).join('')
    : '<div style="text-align:center;padding:8px;color:#94a3b8;font-size:12px;">추가 후보 없음</div>';

  // 기존 추적 종목 가격 동기화 표시
  refreshTrackedPrices();
}

function renderStockCard(stock, rank, isTop) {
  const flag = stock.market === 'kr' ? '🇰🇷' : '🇺🇸';
  const topNews = stock.topNews?.[0];
  const matched = topNews?.matched?.slice(0, 3).join(', ') || '키워드 매칭 없음';
  const tracked = STATE.tracking.find(t => t.ticker === stock.ticker && t.market === stock.market);

  let trackingHtml = '';
  if (tracked) {
    const cur = tracked.currentPrice || tracked.addedPrice;
    const pct = tracked.addedPrice ? ((cur - tracked.addedPrice) / tracked.addedPrice * 100) : 0;
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    trackingHtml = `
      <div class="tracking-bar">
        <span class="label">📊 추적중</span>
        <span class="value ${cls}">${fmtPct(pct)}</span>
        <span style="color:#cbd5e1;">·</span>
        <span class="label">${timeAgo(tracked.addedDate)}</span>
      </div>
    `;
  }

  return `
    <div class="stock-card ${isTop ? 'top' : ''}" onclick="openDetail('${stock.ticker}','${stock.market}')">
      <div class="stock-row">
        <div class="stock-info">
          <div class="stock-name">
            <span class="rank">${rank}</span>
            <span>${escapeHtml(stock.name)}</span>
            <span class="ticker">${stock.ticker}</span>
          </div>
          <div class="stock-meta">
            <span>${flag}</span>
            <span class="dot">·</span>
            <span class="impact-badge ${impactClass(stock.maxImpact)}">${impactEmoji(stock.maxImpact)} ${stock.maxImpact}/10</span>
            <span class="dot">·</span>
            <span>뉴스 ${stock.itemCount}건</span>
          </div>
        </div>
      </div>
      ${topNews ? `
      <div class="news-snippet">
        ${escapeHtml(topNews.title.substring(0, 80))}${topNews.title.length > 80 ? '...' : ''}
        <div class="src">
          🏷️ ${escapeHtml(matched)} · ${escapeHtml(topNews.source)} · ${timeAgo(topNews.publishedAt)}
        </div>
      </div>
      ` : ''}
      ${trackingHtml}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============================================
// 9. DETAIL MODAL
// ============================================
async function openDetail(ticker, market) {
  const today = todayStr();
  const stock = STATE.recommendations[today]?.[market]?.find(s => s.ticker === ticker);
  if (!stock) {
    showToast('종목 정보를 찾을 수 없습니다');
    return;
  }

  document.getElementById('modalTitle').innerHTML = `${escapeHtml(stock.name)} <span style="font-size:12px;color:#6b7280;font-family:'DM Mono',monospace;font-weight:500;">${stock.ticker}</span>`;
  document.getElementById('modalSubtitle').innerHTML = `${market === 'kr' ? '🇰🇷 한국' : '🇺🇸 미국'} · 임팩트 ${stock.maxImpact}/10 · 뉴스 ${stock.itemCount}건`;

  const tracked = STATE.tracking.find(t => t.ticker === ticker && t.market === market);
  const trackBtnLbl = tracked ? '✅ 추적중' : '📌 추적 시작';

  // 가격 정보
  document.getElementById('modalBody').innerHTML = `<div class="loading"><div class="spinner"></div>분석중...</div>`;
  document.getElementById('detailModal').classList.add('active');

  // 병렬로 모든 데이터 가져오기
  const [priceData, financials, chartData] = await Promise.all([
    fetchPrice(ticker, market),
    fetchFinancials(ticker, market),
    fetchChartData(ticker, market, '3mo'),
  ]);
  const etfs = getETFs(ticker, market);

  // 가격 정보 카드
  let priceHtml = '<div class="empty" style="padding:14px;"><div class="desc">시세 가져오기 실패</div></div>';
  let curPrice = null, prevPrice = null, currency = 'KRW';
  if (priceData) {
    curPrice = priceData.price;
    prevPrice = priceData.prev;
    currency = priceData.currency;
    const change = ((curPrice - prevPrice) / prevPrice * 100);
    const cls = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const sym = currency === 'KRW' ? '₩' : '$';
    priceHtml = `
      <div class="fin-grid">
        <div class="fin-cell">
          <div class="lbl">현재가</div>
          <div class="val">${sym}${fmtNum(curPrice, currency === 'KRW' ? 0 : 2)}</div>
        </div>
        <div class="fin-cell">
          <div class="lbl">전일 대비</div>
          <div class="val ${cls}">${fmtPct(change)}</div>
        </div>
      </div>
    `;
  }

  // 재무 정보 카드
  let finHtml = '';
  if (financials) {
    const sym = currency === 'KRW' ? '₩' : '$';
    const cells = [];
    if (financials.marketCap) cells.push(`<div class="fin-cell"><div class="lbl">시가총액</div><div class="val">${fmtMarketCap(financials.marketCap, currency)}</div></div>`);
    if (financials.per != null) cells.push(`<div class="fin-cell"><div class="lbl">PER</div><div class="val">${fmtNum(financials.per, 2)}</div></div>`);
    if (financials.pbr != null) cells.push(`<div class="fin-cell"><div class="lbl">PBR</div><div class="val">${fmtNum(financials.pbr, 2)}</div></div>`);
    if (financials.dividendYield != null) cells.push(`<div class="fin-cell"><div class="lbl">배당수익률</div><div class="val">${fmtNum(financials.dividendYield, 2)}%</div></div>`);
    if (financials.high52w) cells.push(`<div class="fin-cell"><div class="lbl">52주 최고</div><div class="val">${sym}${fmtNum(financials.high52w, currency === 'KRW' ? 0 : 2)}</div></div>`);
    if (financials.low52w) cells.push(`<div class="fin-cell"><div class="lbl">52주 최저</div><div class="val">${sym}${fmtNum(financials.low52w, currency === 'KRW' ? 0 : 2)}</div></div>`);
    if (financials.volume) cells.push(`<div class="fin-cell"><div class="lbl">거래량</div><div class="val">${fmtVolume(financials.volume)}</div></div>`);
    if (financials.exchange) cells.push(`<div class="fin-cell"><div class="lbl">거래소</div><div class="val" style="font-size:11px;">${financials.exchange}</div></div>`);
    if (cells.length > 0) {
      finHtml = `
        <div class="detail-section">
          <div class="detail-section-title">📊 재무 정보</div>
          <div class="fin-grid">${cells.join('')}</div>
        </div>
      `;
    }
  }

  // 차트 (3개월 일봉)
  let chartHtml = '';
  if (chartData && chartData.length > 5) {
    const W = 320, H = 100;
    const closes = chartData.map(d => d.c);
    const min = Math.min(...closes), max = Math.max(...closes), range = max - min || 1;
    const points = chartData.map((d, i) => {
      const x = (i / (chartData.length - 1)) * W;
      const y = H - ((d.c - min) / range) * (H - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const startC = chartData[0].c, endC = chartData[chartData.length - 1].c;
    const trend = ((endC - startC) / startC * 100);
    const lineColor = trend >= 0 ? '#dc2626' : '#2563eb';
    chartHtml = `
      <div class="detail-section">
        <div class="detail-section-title">📈 3개월 추이 ${trend >= 0 ? '📈' : '📉'} ${fmtPct(trend)}</div>
        <div style="background:#f8fafc;border-radius:10px;padding:10px;border:1px solid #f1f5f9;">
          <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100px;display:block;">
            <defs>
              <linearGradient id="chartGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="1.5"/>
            <polygon points="0,${H} ${points} ${W},${H}" fill="url(#chartGrad)"/>
          </svg>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#6b7280;margin-top:6px;font-family:'DM Mono',monospace;">
            <span>${chartData[0].date}</span>
            <span>${chartData[chartData.length - 1].date}</span>
          </div>
        </div>
      </div>
    `;
  }

  const newsHtml = stock.topNews.map(n => {
    const impactCls = n.score >= 7 ? 'positive' : n.score <= 4 ? 'negative' : '';
    return `
      <div class="news-item ${impactCls}">
        <div class="news-title">${escapeHtml(n.title)}</div>
        <div class="news-meta">
          <span class="impact-badge ${impactClass(n.score)}">${n.score}/10</span>
          <span>${escapeHtml(n.source)}</span>
          <span>·</span>
          <span>${timeAgo(n.publishedAt)}</span>
        </div>
        ${n.matched && n.matched.length ? `<div style="font-size:10px;color:#6b7280;margin-top:6px;">🏷️ ${escapeHtml(n.matched.join(', '))}</div>` : ''}
        ${n.link ? `<a href="${n.link}" target="_blank" rel="noopener" style="display:inline-block;margin-top:6px;font-size:10px;color:#2563eb;">원문 보기 →</a>` : ''}
      </div>
    `;
  }).join('');

  const etfHtml = etfs.length
    ? etfs.map(([name, pct]) => `<span class="etf-chip">${escapeHtml(name)} <span class="pct">${pct}%</span></span>`).join('')
    : '<div style="color:#94a3b8;font-size:12px;">ETF 편입 정보 없음</div>';

  // AI 분석 (Gemini가 켜져있으면)
  let aiAnalysisHtml = '';
  if (STATE.settings.useGemini && STATE.settings.geminiKey && stock.topNews[0]) {
    aiAnalysisHtml = `
      <div class="detail-section">
        <div class="detail-section-title">🤖 AI 정밀 분석 (Gemini)</div>
        <div id="aiAnalysisBox" class="analysis-text" style="font-size:12px;">분석중...</div>
      </div>
    `;
    // 비동기로 AI 분석 실행
    setTimeout(async () => {
      const newsText = stock.topNews.slice(0, 3).map(n => n.title).join('\n');
      const aiResult = await analyzeWithGemini(newsText, market === 'kr' ? 'ko' : 'en');
      const box = document.getElementById('aiAnalysisBox');
      if (box && aiResult) {
        let html = '';
        if (aiResult.impact) html += `📊 <strong>AI 임팩트:</strong> ${aiResult.impact}/10<br>`;
        if (aiResult.reason) html += `💡 <strong>분석:</strong> ${escapeHtml(aiResult.reason)}<br>`;
        if (aiResult.positives?.length) html += `📈 <strong>긍정:</strong> ${aiResult.positives.map(escapeHtml).join(', ')}<br>`;
        if (aiResult.negatives?.length) html += `📉 <strong>부정:</strong> ${aiResult.negatives.map(escapeHtml).join(', ')}`;
        box.innerHTML = html || '분석 결과 없음';
      } else if (box) {
        box.innerHTML = '<span style="color:#94a3b8;">AI 분석 실패 (API 키 확인 또는 네트워크)</span>';
      }
    }, 100);
  }

  // 추천 사유 (키워드 기반)
  const allMatched = new Set();
  stock.topNews.forEach(n => (n.matched || []).forEach(m => allMatched.add(m)));
  const positives = [...allMatched].filter(m => m.startsWith('+')).map(m => m.slice(1));
  const negatives = [...allMatched].filter(m => m.startsWith('-')).map(m => m.slice(1));

  let analysisText = '';
  if (positives.length) analysisText += `📈 <strong>긍정 신호:</strong> ${positives.join(', ')}\n\n`;
  if (negatives.length) analysisText += `📉 <strong>부정 신호:</strong> ${negatives.join(', ')}\n\n`;
  if (stock.maxImpact >= 8) {
    analysisText += `💡 <strong>요약:</strong> 매우 강한 긍정 시그널. 단기 모멘텀 가능성 높음.`;
  } else if (stock.maxImpact >= 6) {
    analysisText += `💡 <strong>요약:</strong> 긍정적 신호 감지됨. 추가 확인 후 판단 권장.`;
  } else {
    analysisText += `💡 <strong>요약:</strong> 중립적이거나 약한 신호. 신중한 접근 필요.`;
  }

  document.getElementById('modalBody').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">💰 시세</div>
      ${priceHtml}
    </div>

    ${chartHtml}

    ${finHtml}

    <div class="detail-section">
      <div class="detail-section-title">🔍 키워드 분석</div>
      <div class="analysis-text">${analysisText.replace(/\n/g, '<br>')}</div>
    </div>

    ${aiAnalysisHtml}

    <div class="detail-section">
      <div class="detail-section-title">🏷️ ETF 편입 정보</div>
      <div>${etfHtml}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📰 관련 뉴스 (${stock.topNews.length}건)</div>
      ${newsHtml}
    </div>

    <div class="action-row" style="padding:0;margin-top:8px;">
      <button class="action-btn primary" onclick="toggleTrack('${ticker}','${market}','${escapeHtml(stock.name)}')" id="trackBtn">
        ${trackBtnLbl}
      </button>
      <button class="action-btn secondary" onclick="closeModal('detailModal')">닫기</button>
    </div>
  `;
}

// 헬퍼 함수
function fmtMarketCap(v, currency = 'KRW') {
  const n = Number(v);
  if (isNaN(n)) return '-';
  if (currency === 'KRW') {
    if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조원`;
    if (n >= 1e8) return `${(n / 1e8).toFixed(0)}억원`;
    return `${(n / 1e4).toFixed(0)}만원`;
  } else {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n.toLocaleString()}`;
  }
}

function fmtVolume(v) {
  const n = Number(v);
  if (isNaN(n)) return '-';
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억주`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(0)}만주`;
  return n.toLocaleString();
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// ============================================
// 10. TRACKING (추적 기능)
// ============================================
async function toggleTrack(ticker, market, name) {
  const idx = STATE.tracking.findIndex(t => t.ticker === ticker && t.market === market);
  if (idx >= 0) {
    if (!confirm(`${name} 추적을 중단하시겠어요?`)) return;
    STATE.tracking.splice(idx, 1);
    saveState();
    showToast('추적 중단됨');
    document.getElementById('trackBtn').innerHTML = '📌 추적 시작';
    return;
  }
  // 가격 가져오기
  showToast('시세 가져오는 중...');
  const priceData = await fetchPrice(ticker, market);
  if (!priceData) {
    showToast('❌ 시세를 가져올 수 없습니다');
    return;
  }
  STATE.tracking.push({
    ticker, name, market,
    addedDate: new Date().toISOString(),
    addedPrice: priceData.price,
    currentPrice: priceData.price,
    currency: priceData.currency,
    prices: [{ ts: new Date().toISOString(), price: priceData.price }],
  });
  saveState();
  showToast(`✅ ${name} 추적 시작`);
  document.getElementById('trackBtn').innerHTML = '✅ 추적중';
}

async function refreshTrackedPrices() {
  // 백그라운드로 추적 종목 가격 갱신 (최대 동시 5개)
  const promises = STATE.tracking.map(t => fetchPrice(t.ticker, t.market).then(p => ({ t, p })));
  const results = await Promise.allSettled(promises);
  let updated = 0;
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.p) {
      const { t, p } = r.value;
      t.currentPrice = p.price;
      t.prices = t.prices || [];
      // 같은 시간대 중복 제거 (10분 이내)
      const last = t.prices[t.prices.length - 1];
      if (!last || (new Date() - new Date(last.ts)) > 10 * 60 * 1000) {
        t.prices.push({ ts: new Date().toISOString(), price: p.price });
        if (t.prices.length > 200) t.prices = t.prices.slice(-200);
      }
      updated++;
    }
  });
  if (updated) saveState();
}

async function updateAllPrices() {
  if (STATE.tracking.length === 0) {
    showToast('추적 종목이 없습니다');
    return;
  }
  showToast(`${STATE.tracking.length}개 종목 갱신중...`);
  await refreshTrackedPrices();
  renderTracking();
  showToast('✅ 갱신 완료');
}

function renderTracking() {
  const list = document.getElementById('trackingList');
  if (STATE.tracking.length === 0) {
    list.innerHTML = '<div class="empty"><div class="ico">📈</div><div class="title">추적 종목 없음</div><div class="desc">오늘의 추천에서 종목을 선택하고<br/>"추적 시작"을 누르세요</div></div>';
    return;
  }

  // 시장별로 정렬
  const sorted = [...STATE.tracking].sort((a, b) => new Date(b.addedDate) - new Date(a.addedDate));

  list.innerHTML = sorted.map(t => {
    const cur = t.currentPrice || t.addedPrice;
    const pct = t.addedPrice ? ((cur - t.addedPrice) / t.addedPrice * 100) : 0;
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const flag = t.market === 'kr' ? '🇰🇷' : '🇺🇸';
    const sym = t.currency === 'KRW' ? '₩' : '$';

    // Sparkline 그리기
    const prices = (t.prices || []).map(p => p.price);
    let sparkHtml = '';
    if (prices.length > 1) {
      const min = Math.min(...prices, t.addedPrice);
      const max = Math.max(...prices, t.addedPrice);
      const range = max - min || 1;
      sparkHtml = `<div class="sparkline">${prices.map(p => {
        const h = ((p - min) / range) * 100;
        const c = p >= t.addedPrice ? '#dc2626' : '#2563eb';
        return `<div class="sparkline-bar" style="height:${Math.max(2, h)}%;background:${c};opacity:0.7;"></div>`;
      }).join('')}</div>`;
    }

    return `
      <div class="tracking-card">
        <div class="tracking-header">
          <div class="tracking-info">
            <div class="tracking-name">${flag} ${escapeHtml(t.name)}</div>
            <div class="tracking-since">${t.ticker} · 추천 ${fmtDate(t.addedDate)} (${timeAgo(t.addedDate)})</div>
          </div>
          <div class="tracking-perf">
            <div class="big ${cls}">${fmtPct(pct)}</div>
            <div class="small mono">${sym}${fmtNum(cur, t.currency === 'KRW' ? 0 : 2)}</div>
          </div>
        </div>
        ${sparkHtml}
        <div class="tracking-actions">
          <button class="btn-detail" onclick="showTrackingDetail('${t.ticker}','${t.market}')">상세 차트</button>
          <button class="btn-delete" onclick="deleteTracking('${t.ticker}','${t.market}')">삭제</button>
        </div>
      </div>
    `;
  }).join('');
}

function deleteTracking(ticker, market) {
  const idx = STATE.tracking.findIndex(t => t.ticker === ticker && t.market === market);
  if (idx < 0) return;
  const t = STATE.tracking[idx];
  if (!confirm(`${t.name} 추적을 삭제하시겠어요?`)) return;
  STATE.tracking.splice(idx, 1);
  saveState();
  renderTracking();
  showToast('삭제됨');
}

function confirmDeleteAll() {
  if (STATE.tracking.length === 0) return;
  if (!confirm(`전체 ${STATE.tracking.length}개 추적 종목을 삭제하시겠어요?`)) return;
  STATE.tracking = [];
  saveState();
  renderTracking();
  showToast('전체 삭제됨');
}

function showTrackingDetail(ticker, market) {
  const t = STATE.tracking.find(x => x.ticker === ticker && x.market === market);
  if (!t) return;
  const prices = t.prices || [];
  const cur = t.currentPrice || t.addedPrice;
  const pct = t.addedPrice ? ((cur - t.addedPrice) / t.addedPrice * 100) : 0;
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const sym = t.currency === 'KRW' ? '₩' : '$';

  // 더 큰 sparkline 그리기 (200x60 SVG)
  let svgChart = '';
  if (prices.length >= 2) {
    const W = 320, H = 80;
    const allPrices = [...prices.map(p => p.price), t.addedPrice];
    const min = Math.min(...allPrices), max = Math.max(...allPrices), range = max - min || 1;
    const points = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * W;
      const y = H - ((p.price - min) / range) * H;
      return `${x},${y}`;
    }).join(' ');
    const baselineY = H - ((t.addedPrice - min) / range) * H;
    svgChart = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100px;display:block;">
        <line x1="0" y1="${baselineY}" x2="${W}" y2="${baselineY}" stroke="#cbd5e1" stroke-dasharray="2 4"/>
        <polyline points="${points}" fill="none" stroke="${pct >= 0 ? '#dc2626' : '#2563eb'}" stroke-width="2"/>
        ${prices.map((p, i) => {
          const x = (i / (prices.length - 1)) * W;
          const y = H - ((p.price - min) / range) * H;
          return `<circle cx="${x}" cy="${y}" r="2" fill="${pct >= 0 ? '#dc2626' : '#2563eb'}"/>`;
        }).join('')}
      </svg>
    `;
  } else {
    svgChart = '<div class="empty" style="padding:20px;"><div class="desc">데이터 포인트가 부족합니다.<br/>"전체 시세 갱신"을 여러 번 눌러 데이터를 쌓아주세요.</div></div>';
  }

  document.getElementById('modalTitle').innerHTML = `${escapeHtml(t.name)} <span style="font-size:12px;color:#6b7280;font-family:'DM Mono',monospace;font-weight:500;">${t.ticker}</span>`;
  document.getElementById('modalSubtitle').innerHTML = `${t.market === 'kr' ? '🇰🇷 한국' : '🇺🇸 미국'} · 추천일 ${fmtDate(t.addedDate)}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">📊 추적 결과</div>
      <div class="fin-grid">
        <div class="fin-cell">
          <div class="lbl">추천 시점 가격</div>
          <div class="val">${sym}${fmtNum(t.addedPrice, t.currency === 'KRW' ? 0 : 2)}</div>
        </div>
        <div class="fin-cell">
          <div class="lbl">현재 가격</div>
          <div class="val">${sym}${fmtNum(cur, t.currency === 'KRW' ? 0 : 2)}</div>
        </div>
        <div class="fin-cell">
          <div class="lbl">수익률</div>
          <div class="val ${cls}">${fmtPct(pct)}</div>
        </div>
        <div class="fin-cell">
          <div class="lbl">추적 기간</div>
          <div class="val">${timeAgo(t.addedDate)}</div>
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📈 가격 추이 (${prices.length}개 데이터)</div>
      ${svgChart}
    </div>

    <div class="action-row" style="padding:0;margin-top:8px;">
      <button class="action-btn secondary" onclick="updateOnePrice('${ticker}','${market}')">↻ 시세 갱신</button>
      <button class="action-btn secondary" onclick="closeModal('detailModal')">닫기</button>
    </div>
  `;
  document.getElementById('detailModal').classList.add('active');
}

async function updateOnePrice(ticker, market) {
  const t = STATE.tracking.find(x => x.ticker === ticker && x.market === market);
  if (!t) return;
  showToast('갱신중...');
  const p = await fetchPrice(ticker, market);
  if (p) {
    t.currentPrice = p.price;
    t.prices = t.prices || [];
    t.prices.push({ ts: new Date().toISOString(), price: p.price });
    if (t.prices.length > 200) t.prices = t.prices.slice(-200);
    saveState();
    showTrackingDetail(ticker, market);
    showToast('✅ 갱신됨');
  } else {
    showToast('❌ 갱신 실패');
  }
}

// ============================================
// 11. HISTORY VIEW
// ============================================
function renderHistory() {
  const list = document.getElementById('historyList');
  const dates = Object.keys(STATE.recommendations).sort((a, b) => b.localeCompare(a));

  if (dates.length === 0) {
    list.innerHTML = '<div class="empty"><div class="ico">📅</div><div class="title">추천 기록 없음</div><div class="desc">"오늘" 탭에서<br/>분석을 시작하세요</div></div>';
    return;
  }

  list.innerHTML = dates.map(date => {
    const dayData = STATE.recommendations[date];
    const krRecs = dayData.kr || [];
    const usRecs = dayData.us || [];
    const all = [...krRecs.map(r => ({ ...r, _market: 'kr' })), ...usRecs.map(r => ({ ...r, _market: 'us' }))];
    if (all.length === 0) return '';

    const dt = new Date(date);
    const dayLabel = dt.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

    return `
      <div class="history-day">
        <div class="history-day-header">
          <div class="date">${dayLabel}</div>
          <div class="count">🇰🇷 ${krRecs.length} · 🇺🇸 ${usRecs.length}</div>
        </div>
        ${all.slice(0, 10).map((s, i) => {
          const tracked = STATE.tracking.find(t => t.ticker === s.ticker && t.market === s._market);
          const flag = s._market === 'kr' ? '🇰🇷' : '🇺🇸';
          let perfHtml = `<span class="impact-badge ${impactClass(s.maxImpact)}">${s.maxImpact}/10</span>`;
          if (tracked) {
            const pct = tracked.addedPrice ? ((tracked.currentPrice - tracked.addedPrice) / tracked.addedPrice * 100) : 0;
            const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
            perfHtml = `<div class="pct ${cls}">${fmtPct(pct)}</div>`;
          }
          return `
            <div class="history-stock" onclick="openHistoryDetail('${date}','${s._market}','${s.ticker}')">
              <div class="history-stock-info">
                <div class="history-stock-name">${flag} ${escapeHtml(s.name)}</div>
                <div class="history-stock-meta">${s.ticker} · 뉴스 ${s.itemCount}건</div>
              </div>
              <div class="history-perf">${perfHtml}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}

function openHistoryDetail(date, market, ticker) {
  const stock = STATE.recommendations[date]?.[market]?.find(s => s.ticker === ticker);
  if (!stock) return;
  // 임시로 today에 옮겨서 openDetail 재사용
  const oldToday = STATE.recommendations[todayStr()];
  if (!STATE.recommendations[todayStr()]) STATE.recommendations[todayStr()] = { kr: [], us: [] };
  const exists = STATE.recommendations[todayStr()][market].find(s => s.ticker === ticker);
  if (!exists) {
    STATE.recommendations[todayStr()][market].push(stock);
    openDetail(ticker, market);
    // 원복
    setTimeout(() => {
      const idx = STATE.recommendations[todayStr()][market].findIndex(s => s.ticker === ticker);
      if (idx >= 0 && !oldToday?.[market]?.find(s => s.ticker === ticker)) {
        STATE.recommendations[todayStr()][market].splice(idx, 1);
      }
    }, 500);
  } else {
    openDetail(ticker, market);
  }
}

// ============================================
// 12. SETTINGS
// ============================================
function loadSettings() {
  document.getElementById('minImpact').value = STATE.settings.minImpact;
  document.getElementById('refreshMins').value = STATE.settings.refreshMins;
  document.getElementById('popupEnabled').checked = STATE.settings.popupEnabled;
  document.getElementById('dartKey').value = STATE.settings.dartKey || '';
  document.getElementById('workerUrl').value = STATE.settings.workerUrl || '';
  document.getElementById('newsProxyUrl').value = STATE.settings.newsProxyUrl || '';
  if (document.getElementById('geminiKey')) document.getElementById('geminiKey').value = STATE.settings.geminiKey || '';
  if (document.getElementById('useGemini')) document.getElementById('useGemini').checked = STATE.settings.useGemini || false;
  if (document.getElementById('macroAlerts')) document.getElementById('macroAlerts').checked = STATE.settings.macroAlerts !== false;
  updateKeyStatus();
}

function updateKeyStatus() {
  // DART 키 상태 표시
  const dartStatus = document.getElementById('dartKeyStatus');
  if (dartStatus) {
    const k = STATE.settings.dartKey;
    dartStatus.textContent = k ? `· ✅ 저장됨 (${k.substring(0, 6)}...${k.substring(k.length - 4)})` : '';
  }
  // Gemini 키 상태 표시
  const gemStatus = document.getElementById('geminiKeyStatus');
  if (gemStatus) {
    const k = STATE.settings.geminiKey;
    gemStatus.textContent = k ? `· ✅ 저장됨 (${k.substring(0, 6)}...${k.substring(k.length - 4)})` : '';
  }
}

let _saveDebounce = null;
function saveSettings(showToastMsg = true) {
  STATE.settings.minImpact = parseInt(document.getElementById('minImpact').value) || 6;
  STATE.settings.refreshMins = parseInt(document.getElementById('refreshMins').value) || 0;
  STATE.settings.popupEnabled = document.getElementById('popupEnabled').checked;
  STATE.settings.dartKey = document.getElementById('dartKey').value.trim();
  STATE.settings.workerUrl = document.getElementById('workerUrl').value.trim();
  STATE.settings.newsProxyUrl = document.getElementById('newsProxyUrl').value.trim();
  if (document.getElementById('geminiKey')) STATE.settings.geminiKey = document.getElementById('geminiKey').value.trim();
  if (document.getElementById('useGemini')) STATE.settings.useGemini = document.getElementById('useGemini').checked;
  if (document.getElementById('macroAlerts')) STATE.settings.macroAlerts = document.getElementById('macroAlerts').checked;
  saveState();  // → 일반 + API 키 영구 저장 둘 다 됨
  setupAutoRefresh();
  updateKeyStatus();

  // 디바운싱 (입력 중 너무 자주 토스트 뜨지 않게)
  if (showToastMsg) {
    if (_saveDebounce) clearTimeout(_saveDebounce);
    _saveDebounce = setTimeout(() => showToast('💾 저장됨'), 300);
  }
}

function exportData() {
  const data = JSON.stringify(STATE, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stockradar_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 백업 파일 다운로드');
}

// API 키만 따로 백업 (텍스트로)
function backupApiKeys() {
  const keys = {
    dartKey: STATE.settings.dartKey,
    geminiKey: STATE.settings.geminiKey,
    workerUrl: STATE.settings.workerUrl,
    newsProxyUrl: STATE.settings.newsProxyUrl,
    backupDate: new Date().toISOString(),
  };
  const text = `# StockRadar API 키 백업
# 백업일: ${new Date().toLocaleString('ko-KR')}
# 이 파일을 안전한 곳에 보관하세요

DART API 키:
${keys.dartKey || '(없음)'}

Gemini API 키:
${keys.geminiKey || '(없음)'}

Cloudflare Worker URL (시세):
${keys.workerUrl || '(없음)'}

News Proxy URL:
${keys.newsProxyUrl || '(없음)'}

# JSON 형식 (앱에서 가져오기 용):
${JSON.stringify(keys, null, 2)}
`;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stockradar_API키백업_${todayStr()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('🔐 API 키 백업 다운로드');
}

function importData() {
  document.getElementById('importFile').click();
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.recommendations || !data.tracking) throw new Error('잘못된 형식');
      if (!confirm(`${Object.keys(data.recommendations).length}일치 추천 기록과 ${data.tracking.length}개 추적을 가져옵니다. 기존 데이터는 덮어씌워집니다. 계속?`)) return;
      STATE = { ...STATE, ...data };
      saveState();
      renderToday();
      renderTracking();
      renderHistory();
      showToast('✅ 가져오기 완료');
    } catch (err) {
      showToast('❌ 가져오기 실패: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function confirmResetAll() {
  if (!confirm('모든 추천/추적 기록을 삭제합니다.\n\n⚠️ API 키와 Worker URL은 안전하게 보존됩니다.\n\n진행하시겠어요?')) return;
  if (!confirm('정말 삭제? 이 작업은 되돌릴 수 없습니다.')) return;
  // API 키는 영구 저장소에 따로 있으므로 STATE만 초기화하면 자동 복원됨
  STATE.recommendations = {};
  STATE.tracking = [];
  STATE.alertsSeen = [];
  saveState();
  renderToday();
  renderTracking();
  renderHistory();
  showToast('초기화 완료 (API 키는 유지됨)');
}

// ============================================
// 13. NAVIGATION
// ============================================
function switchView(view) {
  STATE.view = view;
  saveState();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));

  if (view === 'today') renderToday();
  else if (view === 'tracking') {
    refreshTrackedPrices().then(renderTracking);
    renderTracking();
  }
  else if (view === 'history') renderHistory();
  else if (view === 'settings') loadSettings();
}

function switchMarket(market) {
  STATE.market = market;
  saveState();
  document.querySelectorAll('.mkt-tab').forEach(t => t.classList.toggle('active', t.dataset.market === market));
  renderToday();
}

function refreshData() {
  if (STATE.view === 'today') analyzeNow();
  else if (STATE.view === 'tracking') updateAllPrices();
  else if (STATE.view === 'history') renderHistory();
}

async function openMarketStatus() {
  document.getElementById('modalTitle').innerHTML = '📊 시장 현황';
  document.getElementById('modalSubtitle').innerHTML = '실시간 거시 지표';
  document.getElementById('modalBody').innerHTML = '<div class="loading"><div class="spinner"></div>거시 지표 로딩중...</div>';
  document.getElementById('detailModal').classList.add('active');

  const macro = await fetchMacroIndicators();

  let indicesHtml = '';
  if (macro.indices && macro.indices.length > 0) {
    indicesHtml = `
      <div class="detail-section">
        <div class="detail-section-title">📈 주요 지수</div>
        <div class="fin-grid">
          ${macro.indices.map(idx => {
            const cls = idx.change > 0 ? 'up' : idx.change < 0 ? 'down' : 'flat';
            return `
              <div class="fin-cell">
                <div class="lbl">${escapeHtml(idx.name)}</div>
                <div class="val">${fmtNum(idx.price, 2)}</div>
                <div style="font-size:11px;font-family:'DM Mono',monospace;font-weight:600;" class="${cls}">${fmtPct(idx.change)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  let fxHtml = '';
  if (macro.usdKrw) {
    fxHtml = `
      <div class="detail-section">
        <div class="detail-section-title">💱 환율</div>
        <div class="fin-cell" style="margin-bottom:8px;">
          <div class="lbl">USD/KRW</div>
          <div class="val">₩${fmtNum(macro.usdKrw, 2)}</div>
        </div>
      </div>
    `;
  }

  document.getElementById('modalBody').innerHTML = `
    ${indicesHtml}
    ${fxHtml}
    <div class="detail-section">
      <div class="detail-section-title">📅 다음 주요 일정</div>
      <div style="font-size:12px;color:#475569;line-height:1.7;background:#f8fafc;padding:12px;border-radius:10px;">
        💡 거시 일정 자동 수집은 v1.1에서 추가 예정입니다.<br>
        주요 일정 수동 확인:<br>
        - <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" style="color:#2563eb;">FOMC 일정</a><br>
        - <a href="https://www.bok.or.kr/portal/main/contents.do?menuNo=200459" target="_blank" style="color:#2563eb;">한은 금통위</a><br>
        - <a href="https://kr.investing.com/economic-calendar/" target="_blank" style="color:#2563eb;">투자 캘린더</a>
      </div>
    </div>
    <div class="action-row" style="padding:0;margin-top:8px;">
      <button class="action-btn secondary" onclick="closeModal('detailModal')">닫기</button>
    </div>
  `;
}

// ============================================
// 14. AUTO REFRESH
// ============================================
let _refreshTimer = null;
function setupAutoRefresh() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  const mins = STATE.settings.refreshMins || 0;
  if (mins <= 0) return;
  _refreshTimer = setInterval(() => {
    if (STATE.view === 'today' && !_analyzing) analyzeNow();
    if (STATE.view === 'tracking') updateAllPrices();
  }, mins * 60 * 1000);
}

// ============================================
// 15. INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Settings 로드
  loadSettings();
  // Market 복원
  document.querySelectorAll('.mkt-tab').forEach(t => t.classList.toggle('active', t.dataset.market === STATE.market));
  // View 복원
  switchView(STATE.view || 'today');
  // 자동 갱신
  setupAutoRefresh();
  // PWA Service Worker 등록
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
