// ============================================
// StockRadar - 급등주 레이더 PWA
// ============================================

// ============================================
// 1. STATE & STORAGE
// ============================================
const STORE_KEY = 'stockradar_v1';
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
  },
  recommendations: {},  // { 'YYYY-MM-DD': { kr: [{...}], us: [{...}] } }
  tracking: [],         // [{ ticker, name, market, addedDate, addedPrice, currentPrice, prices: [...], reason }]
  alertsSeen: [],       // 이미 알림 표시한 추천 ID
};

let STATE = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULTS, ...parsed, settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) } };
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(STATE));
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
  // 1순위: 본인 ykh-news-proxy
  // 2순위: 외부 무료 프록시 (폴백)
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
      if (txt && txt.length > 50 && !txt.startsWith('{"error"')) return txt;
      throw new Error('empty/error response');
    } catch (e) {
      clearTimeout(tid);
      lastErr = e;
      console.warn(`프록시 실패 (${proxy.substring(0, 60)}...):`, e.message);
    }
  }
  throw lastErr || new Error('all proxies failed');
}

// ---- 한국 뉴스: 네이버 금융 (allorigins 프록시) ----
async function fetchKRNews() {
  const items = [];
  try {
    // 한경 RSS (경제)
    const txt = await fetchProxy('https://rss.hankyung.com/feed/economy.xml');
    const parser = new DOMParser();
    const xml = parser.parseFromString(txt, 'text/xml');
    const entries = xml.querySelectorAll('item');
    entries.forEach(e => {
      const title = e.querySelector('title')?.textContent || '';
      const link = e.querySelector('link')?.textContent || '';
      const pub = e.querySelector('pubDate')?.textContent || '';
      items.push({
        market: 'kr', source: '한경',
        title, link, pubDate: pub,
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      });
    });
  } catch (e) {
    console.warn('한경 RSS fail', e);
  }
  try {
    // 매경 증권
    const txt = await fetchProxy('https://www.mk.co.kr/rss/30100041/');
    const xml = new DOMParser().parseFromString(txt, 'text/xml');
    xml.querySelectorAll('item').forEach(e => {
      const title = e.querySelector('title')?.textContent || '';
      const link = e.querySelector('link')?.textContent || '';
      const pub = e.querySelector('pubDate')?.textContent || '';
      items.push({
        market: 'kr', source: '매경',
        title, link, pubDate: pub,
        publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      });
    });
  } catch (e) {
    console.warn('매경 RSS fail', e);
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

// ---- 미국 뉴스: Yahoo Finance ----
async function fetchUSNews(tickers = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'TSLA', 'AMZN', 'META', 'AMD', 'NFLX', 'AVGO']) {
  const items = [];
  for (const tk of tickers) {
    try {
      const txt = await fetchProxy(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${tk}&region=US&lang=en-US`);
      const xml = new DOMParser().parseFromString(txt, 'text/xml');
      xml.querySelectorAll('item').forEach((e, idx) => {
        if (idx > 5) return;
        const title = e.querySelector('title')?.textContent || '';
        const link = e.querySelector('link')?.textContent || '';
        const pub = e.querySelector('pubDate')?.textContent || '';
        items.push({
          market: 'us', source: 'Yahoo Finance',
          ticker: tk,
          title, link,
          publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
        });
      });
    } catch (e) {
      console.warn('Yahoo news fail', tk, e);
    }
  }
  return items;
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

// 종목명 → 티커 매핑 (한국 주요 종목)
const KR_NAME_TO_CODE = {
  '삼성전자': '005930', 'SK하이닉스': '000660', 'LG에너지솔루션': '373220',
  '삼성바이오로직스': '207940', '현대차': '005380', '기아': '000270',
  'NAVER': '035420', '네이버': '035420', '카카오': '035720',
  '셀트리온': '068270', 'POSCO홀딩스': '005490', 'LG화학': '051910',
  '현대모비스': '012330', '삼성SDI': '006400', 'KB금융': '105560',
  '신한지주': '055550', '하나금융지주': '086790', '에코프로': '086520',
  '에코프로비엠': '247540', '한화에어로스페이스': '012450', '두산에너빌리티': '034020',
  'HMM': '011200', '포스코퓨처엠': '003670', '삼성생명': '032830',
  '카카오뱅크': '323410', '한미반도체': '042700', 'LG전자': '066570',
  'SK이노베이션': '096770', '아모레퍼시픽': '090430', '크래프톤': '259960',
};

// 미국 회사명 추출 → 티커 매핑 (간단 케이스)
const US_NAME_TO_TICKER = {
  'apple': 'AAPL', 'microsoft': 'MSFT', 'nvidia': 'NVDA',
  'tesla': 'TSLA', 'amazon': 'AMZN', 'alphabet': 'GOOGL', 'google': 'GOOGL',
  'meta': 'META', 'facebook': 'META', 'netflix': 'NFLX',
  'amd': 'AMD', 'intel': 'INTC', 'broadcom': 'AVGO',
  'palantir': 'PLTR', 'oracle': 'ORCL', 'salesforce': 'CRM',
};

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
  // 한국어 회사명에서 종목코드 추출
  for (const [name, code] of Object.entries(KR_NAME_TO_CODE)) {
    if (text.includes(name)) return { ticker: code, name };
  }
  // 6자리 숫자 직접 매칭
  const m = text.match(/\b(\d{6})\b/);
  if (m) return { ticker: m[1], name: '미상' };
  return null;
}

function extractTickerUS(text, knownTicker = null) {
  if (knownTicker) {
    // 회사명을 위에서 매핑 시도
    for (const [name, ticker] of Object.entries(US_NAME_TO_TICKER)) {
      if (text.toLowerCase().includes(name)) return { ticker, name: name.charAt(0).toUpperCase() + name.slice(1) };
    }
    return { ticker: knownTicker, name: knownTicker };
  }
  for (const [name, ticker] of Object.entries(US_NAME_TO_TICKER)) {
    if (text.toLowerCase().includes(name)) return { ticker, name: name.charAt(0).toUpperCase() + name.slice(1) };
  }
  // SEC 형식: "Apple Inc"
  const m = text.match(/- (.+?) \(\d{10}\)/);
  if (m) return { ticker: m[1].slice(0, 6).toUpperCase().replace(/\s/g, ''), name: m[1] };
  return null;
}

// 종목별로 뉴스 그룹화 + 점수 합산 → TOP N
function aggregateByStock(items, market) {
  const stocks = {};
  for (const item of items) {
    const lang = market === 'kr' ? 'ko' : 'en';
    const text = `${item.title} ${item.summary || ''}`;
    const { score, matched } = analyzeImpact(text, lang);

    let info;
    if (market === 'kr') {
      // DART 공시는 직접 매핑됨
      if (item.stockCode) {
        info = { ticker: item.stockCode, name: item.corpName };
      } else {
        info = extractTickerKR(item.title);
      }
    } else {
      info = extractTickerUS(text, item.ticker);
    }

    if (!info || !info.ticker) continue;

    const key = info.ticker;
    if (!stocks[key]) {
      stocks[key] = {
        ticker: key, name: info.name, market,
        totalScore: 0, items: [], maxImpact: 0, latestDate: null,
      };
    }
    stocks[key].items.push({ ...item, score, matched });
    stocks[key].totalScore += Math.max(0, score - 5);  // 5점 이상만 누적
    stocks[key].maxImpact = Math.max(stocks[key].maxImpact, score);
    if (!stocks[key].latestDate || item.publishedAt > stocks[key].latestDate) {
      stocks[key].latestDate = item.publishedAt;
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
  document.getElementById('modalBody').innerHTML = `
    <div class="loading"><div class="spinner"></div>시세 로딩중...</div>
  `;

  document.getElementById('detailModal').classList.add('active');

  // 가격 가져오기
  const priceData = await fetchPrice(ticker, market);
  const etfs = getETFs(ticker, market);

  let priceHtml = '<div class="empty" style="padding:14px;"><div class="desc">시세 가져오기 실패</div></div>';
  if (priceData) {
    const change = ((priceData.price - priceData.prev) / priceData.prev * 100);
    const cls = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    const sym = priceData.currency === 'KRW' ? '₩' : '$';
    priceHtml = `
      <div class="fin-grid">
        <div class="fin-cell">
          <div class="lbl">현재가</div>
          <div class="val">${sym}${fmtNum(priceData.price, priceData.currency === 'KRW' ? 0 : 2)}</div>
        </div>
        <div class="fin-cell">
          <div class="lbl">전일 대비</div>
          <div class="val ${cls}">${fmtPct(change)}</div>
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

  // 추천 사유 분석 (키워드 기반 텍스트)
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

    <div class="detail-section">
      <div class="detail-section-title">🤖 AI 분석</div>
      <div class="analysis-text">${analysisText.replace(/\n/g, '<br>')}</div>
    </div>

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
}

function saveSettings() {
  STATE.settings.minImpact = parseInt(document.getElementById('minImpact').value) || 6;
  STATE.settings.refreshMins = parseInt(document.getElementById('refreshMins').value) || 0;
  STATE.settings.popupEnabled = document.getElementById('popupEnabled').checked;
  STATE.settings.dartKey = document.getElementById('dartKey').value.trim();
  STATE.settings.workerUrl = document.getElementById('workerUrl').value.trim();
  STATE.settings.newsProxyUrl = document.getElementById('newsProxyUrl').value.trim();
  saveState();
  setupAutoRefresh();
  showToast('설정 저장됨');
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
  if (!confirm('모든 추천/추적 기록을 삭제합니다. 정말 진행하시겠어요?')) return;
  if (!confirm('정말 삭제? 이 작업은 되돌릴 수 없습니다.')) return;
  STATE.recommendations = {};
  STATE.tracking = [];
  STATE.alertsSeen = [];
  saveState();
  renderToday();
  renderTracking();
  renderHistory();
  showToast('초기화 완료');
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

function openMarketStatus() {
  showToast('시장 현황 기능은 v1.1에서 추가 예정');
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
