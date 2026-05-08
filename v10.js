// ============================================
// V10 ELITE 모듈 - StockRadar 정예 추천 시스템
// ============================================
// 백엔드 데이터: Worker /v10-recommend 엔드포인트
// 데이터 형식: { stage, us_market, recommendations[], avoidance[] }
// ============================================

// V10 데이터 캐시 (메모리)
let V10_CACHE = {
  data: null,
  fetchedAt: 0,
  ttl: 30 * 60 * 1000,  // 30분 캐시
};

// 백테스트 검증된 패턴별 승률
const V10_PATTERN_STATS = {
  'A': { winRate: 90.0, lossRate: 0.0, avgReturn: 7.47 },
  'B': { winRate: 71.8, lossRate: 6.4, avgReturn: 9.65 },
  'C': { winRate: 74.1, lossRate: 0.0, avgReturn: 5.89 },
  'AC': { winRate: 94.4, lossRate: 0.0, avgReturn: 14.66 },
  'AB': { winRate: 85.0, lossRate: 3.0, avgReturn: 10.5 },
  'BC': { winRate: 80.0, lossRate: 2.0, avgReturn: 9.0 },
  'ABC': { winRate: 92.9, lossRate: 0.0, avgReturn: 18.07 },
  'default': { winRate: 73.2, lossRate: 4.9, avgReturn: 8.81 },
};

// ============================================
// 데이터 가져오기 (Worker 호출)
// ============================================
async function fetchV10Recommendations(forceRefresh = false) {
  // 캐시 체크
  if (!forceRefresh && V10_CACHE.data && (Date.now() - V10_CACHE.fetchedAt) < V10_CACHE.ttl) {
    return V10_CACHE.data;
  }

  const newsProxyUrl = STATE.settings.newsProxyUrl || 'https://ykh-news-proxy.kyunghoyou.workers.dev';
  const url = `${newsProxyUrl}/v10-recommend`;

  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    V10_CACHE.data = data;
    V10_CACHE.fetchedAt = Date.now();
    return data;
  } catch (e) {
    console.error('[V10] fetch error:', e);
    return null;
  }
}

// ============================================
// 추천 매수가 계산 (종가 ±2%)
// ============================================
function calcBuyRange(closePrice) {
  if (!closePrice || closePrice <= 0) return null;
  return {
    low: Math.round(closePrice * 0.98),
    high: Math.round(closePrice * 1.02),
    close: closePrice,
  };
}

// ============================================
// 매수 가능 여부 판정 (현재가 기준)
// ============================================
function calcBuyStatus(currentPrice, closePrice) {
  if (!currentPrice || !closePrice) return { code: 'unknown', label: '-', cls: '' };

  const ratio = currentPrice / closePrice;

  if (ratio >= 0.98 && ratio <= 1.02) {
    return { code: 'ok', label: '매수 OK', cls: 'ok' };
  } else if (ratio > 1.02 && ratio <= 1.05) {
    return { code: 'watch', label: '관망', cls: 'watch' };
  } else if (ratio > 1.05) {
    return { code: 'danger', label: '추격 위험', cls: 'danger' };
  } else if (ratio < 0.98 && ratio >= 0.93) {
    return { code: 'below', label: '저점 매수 기회', cls: 'below' };
  } else {
    return { code: 'far', label: '대폭 하락', cls: 'below' };
  }
}

// ============================================
// 패턴 키 생성 (예: ['A','C'] -> 'AC')
// ============================================
function patternKey(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return 'default';
  return [...patterns].sort().join('');
}

// ============================================
// 미국 시장 분위기 클래스 결정
// ============================================
function getUsMoodClass(score) {
  if (score >= 5) return { cls: 'bullish', icon: '🟢', label: '강한 호재' };
  if (score >= 2) return { cls: 'bullish', icon: '🟢', label: '호재' };
  if (score >= -2) return { cls: 'neutral', icon: '⚪', label: '중립' };
  if (score >= -5) return { cls: 'bearish', icon: '🟠', label: '약세' };
  if (score >= -10) return { cls: 'bearish', icon: '🔴', label: '강한 약세' };
  return { cls: 'bearish', icon: '🔴', label: '폭락' };
}

// ============================================
// 운영 가이드 (미국 시장 점수 기반)
// ============================================
function getOperationGuide(usScore) {
  if (usScore >= 8) return '적극 매수';
  if (usScore >= 3) return '정상 매수';
  if (usScore >= -3) return '일반 운영';
  if (usScore >= -8) return '패턴 B 신중';
  return '매수 보류';
}

// ============================================
// 60일 가격 위치 계산 (저점에서 몇 % 위치)
// ============================================
function calcPositionPercent(fromLow60, fromHigh60) {
  if (typeof fromLow60 !== 'number' || typeof fromHigh60 !== 'number') return null;
  // fromLow60 (양수): 저점에서 N% 위에 있음
  // fromHigh60 (음수): 고점에서 N% 아래
  // 저점=0%, 고점=100%
  const range = fromLow60 + Math.abs(fromHigh60);
  if (range <= 0) return 50;
  return Math.max(0, Math.min(100, (fromLow60 / range) * 100));
}

function getPositionDotColor(percent) {
  if (percent < 30) return 'green';   // 저점 근처 - 좋음
  if (percent < 70) return 'blue';    // 중간
  if (percent < 90) return 'yellow';  // 고점 근처 - 신중
  return 'red';                        // 신고가 - 위험
}

// ============================================
// 시간대 자동 인식 (1차 vs 2차)
// ============================================
function getCurrentStage() {
  const hour = new Date().getHours();
  // 5시~14시: 2차 (미국 마감 후)
  // 15시~24시, 0시~4시: 1차 (한국 마감 후)
  if (hour >= 5 && hour < 14) {
    return { stage: '2', label: '2차 추천 (08:00 · 미국 반영)' };
  } else {
    return { stage: '1', label: '1차 추천 (21:00 · 한국 마감 후)' };
  }
}

// ============================================
// 메인 렌더 함수 - V10 섹션 그리기
// ============================================
async function renderV10() {
  const data = await fetchV10Recommendations();

  // 데이터 없음
  if (!data || !data.recommendations || data.recommendations.length === 0) {
    showV10Empty();
    return;
  }

  // 현재 시장 (한국/미국)
  const market = STATE.market || 'kr';

  // 한국 시장만 V10 지원 (미국은 추후)
  if (market !== 'kr') {
    showV10NotAvailable();
    return;
  }

  // Stage 정보
  const stageInfo = getCurrentStage();
  document.getElementById('v10Stage').textContent = stageInfo.label;

  // 1순위 패턴 기반 승률
  const top1 = data.recommendations[0];
  const stats = V10_PATTERN_STATS[patternKey(top1.patterns)] || V10_PATTERN_STATS['default'];
  document.getElementById('v10WinRate').textContent = `${stats.winRate.toFixed(1)}% 승률`;

  // 미국 시장 영향
  renderV10UsMarket(data.us_market);

  // 1순위 큰 카드
  renderV10TopCard(top1);

  // 2~5순위
  renderV10Rest(data.recommendations.slice(1, 5));

  // 매수 회피
  renderV10Avoidance(data.avoidance);

  // 빈 상태 숨기기
  document.getElementById('v10Empty').style.display = 'none';
}

// ============================================
// 미국 시장 영향 렌더
// ============================================
function renderV10UsMarket(usMarket) {
  if (!usMarket || !usMarket.available) {
    document.getElementById('v10UsMarket').style.display = 'none';
    return;
  }

  const banner = document.getElementById('v10UsMarket');
  banner.style.display = 'block';

  const score = usMarket.score || 0;
  const mood = getUsMoodClass(score);

  // 클래스 갱신
  banner.classList.remove('bullish', 'bearish', 'neutral');
  banner.classList.add(mood.cls);

  document.getElementById('v10UsMoodIcon').textContent = mood.icon;
  document.getElementById('v10UsMoodText').textContent =
    `미국 시장 ${mood.label} (점수 ${score >= 0 ? '+' : ''}${score.toFixed(1)})`;
  document.getElementById('v10UsGuide').textContent = getOperationGuide(score);

  // 4지표
  const symbols = usMarket.symbols || {};
  setUsItem('v10UsSpx', symbols.SPX);
  setUsItem('v10UsNdx', symbols.NDX);
  setUsItem('v10UsDji', symbols['.DJI'] || symbols.DJI);

  // VIX (특별 포맷)
  const vix = symbols['.VIX'] || symbols.VIX;
  const vixEl = document.getElementById('v10UsVix');
  if (vix && vix.price > 0) {
    let vixIcon = '🟢';
    if (vix.price >= 30) vixIcon = '🔴';
    else if (vix.price >= 20) vixIcon = '🟠';
    else if (vix.price >= 15) vixIcon = '🟡';
    vixEl.textContent = `${vix.price.toFixed(1)} ${vixIcon}`;
    vixEl.className = 'v10-us-change flat';
  } else {
    vixEl.textContent = '-';
    vixEl.className = 'v10-us-change flat';
  }
}

function setUsItem(elemId, data) {
  const el = document.getElementById(elemId);
  if (!data || data.change_pct == null) {
    el.textContent = '-';
    el.className = 'v10-us-change flat';
    return;
  }
  const pct = data.change_pct;
  el.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  if (pct > 0.05) {
    el.className = 'v10-us-change up';
  } else if (pct < -0.05) {
    el.className = 'v10-us-change down';
  } else {
    el.className = 'v10-us-change flat';
  }
}

// ============================================
// 1순위 큰 카드 렌더
// ============================================
function renderV10TopCard(item) {
  const card = document.getElementById('v10TopCard');
  card.style.display = 'block';

  const stats = V10_PATTERN_STATS[patternKey(item.patterns)] || V10_PATTERN_STATS['default'];
  const buyRange = calcBuyRange(item.close || item.currentPrice);
  const currentPrice = item.currentPrice || item.close;
  const buyStatus = calcBuyStatus(currentPrice, item.close);

  // 60일 위치
  const posPercent = calcPositionPercent(item.from_low60, item.from_high60);
  const posColor = posPercent != null ? getPositionDotColor(posPercent) : 'blue';

  // 패턴 배지 (정렬: A > B > C)
  const patternBadges = (item.patterns || []).sort()
    .map(p => `<span class="v10-pattern-tag">패턴 ${p}</span>`).join('');

  // 자사주매입 배지
  const buybackBadge = item.has_buyback
    ? '<span class="v10-buyback-badge">⭐ 자사주매입</span>'
    : '';

  // 매수가 박스
  let buyBoxHtml = '';
  if (buyRange) {
    buyBoxHtml = `
      <div class="v10-buy-box">
        <div class="v10-buy-header">
          <div class="v10-buy-title">
            🎯 추천 매수가 (종가 ±2%)
          </div>
        </div>
        <div class="v10-buy-range">
          <span class="v10-buy-low">${buyRange.low.toLocaleString()}</span>
          <span class="v10-buy-tilde">~</span>
          <span class="v10-buy-high">${buyRange.high.toLocaleString()}</span>
          <span class="v10-buy-unit">원</span>
        </div>
        <div class="v10-buy-footer">
          <span class="v10-buy-current-label">현재가</span>
          <span class="v10-buy-current">${(currentPrice || 0).toLocaleString()}원</span>
          <span class="v10-buy-status ${buyStatus.cls}">${buyStatus.label}</span>
        </div>
      </div>
    `;
  }

  // 60일 위치 박스
  let positionHtml = '';
  if (posPercent != null) {
    positionHtml = `
      <div class="v10-position-box">
        <div class="v10-position-title">60일 가격 위치</div>
        <div class="v10-position-bar">
          <div class="v10-position-dot ${posColor}" style="left:${posPercent}%;"></div>
        </div>
        <div class="v10-position-labels">
          <span>저점 +${(item.from_low60 || 0).toFixed(1)}%</span>
          <span>고점 ${(item.from_high60 || 0).toFixed(1)}%</span>
        </div>
      </div>
    `;
  }

  // 등락률 색상
  const chgPct = item.changePct || 0;
  let chgColor = '';
  if (chgPct > 0) chgColor = 'opacity:0.85;';
  else if (chgPct < 0) chgColor = 'opacity:0.85;';

  card.innerHTML = `
    <div class="v10-top-header">
      <div class="v10-top-header-left">
        <span class="v10-rank-badge">1순위</span>
        ${buybackBadge}
      </div>
      <div class="v10-top-tag">V10</div>
    </div>
    <div class="v10-top-name">${escapeHtml(item.name || item.ticker)}</div>
    <div class="v10-top-meta">
      ${item.ticker} · ${item.market || 'KOSPI'} · ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%
    </div>

    <div class="v10-pattern-row">${patternBadges}</div>

    <div class="v10-stats-box">
      <div class="v10-stat success">
        <div class="v10-stat-label">예상 성공률</div>
        <div class="v10-stat-value">
          <span class="v10-stat-num">${stats.winRate.toFixed(1)}</span>
          <span class="v10-stat-pct">%</span>
        </div>
      </div>
      <div class="v10-stat fail">
        <div class="v10-stat-label">실패률 (-10%)</div>
        <div class="v10-stat-value">
          <span class="v10-stat-num">${stats.lossRate.toFixed(1)}</span>
          <span class="v10-stat-pct">%</span>
        </div>
      </div>
    </div>

    ${buyBoxHtml}

    <div class="v10-score-row">
      <div>
        <div class="v10-score-label">V10 점수</div>
        <div class="v10-score-value">${Math.round(item.v10_score || 0)}</div>
      </div>
      <div class="v10-flow-right">
        <div class="v10-flow-label">외국인 5일</div>
        <div class="v10-flow-value">${formatFlow(item.kis_f5)}</div>
        <div class="v10-flow-label" style="margin-top:3px;">기관 5일</div>
        <div class="v10-flow-value">${formatFlow(item.kis_i5)}</div>
      </div>
    </div>

    ${positionHtml}

    <button class="v10-detail-btn" onclick="openV10Detail('${item.ticker}')">자세히 보기 →</button>
  `;
}

// ============================================
// 외국인/기관 매매량 포맷
// ============================================
function formatFlow(qty) {
  if (qty == null) return '-';
  const sign = qty >= 0 ? '+' : '';
  return sign + qty.toLocaleString();
}

// ============================================
// 2~5순위 리스트 렌더
// ============================================
function renderV10Rest(items) {
  const container = document.getElementById('v10Rest');
  const list = document.getElementById('v10RestList');

  if (!items || items.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = items.map((item, idx) => {
    const rank = idx + 2;
    const stats = V10_PATTERN_STATS[patternKey(item.patterns)] || V10_PATTERN_STATS['default'];
    const buyRange = calcBuyRange(item.close || item.currentPrice);
    const rankClass = rank === 2 ? 'gold' : 'silver';

    const buybackTag = item.has_buyback ? ' · ⭐ 자사주' : '';
    const patternStr = (item.patterns || []).sort().map(p => `패턴 ${p}`).join('+');

    const buyText = buyRange
      ? `<span class="v10-rest-buy-icon">🎯</span> ${buyRange.low.toLocaleString()}~${buyRange.high.toLocaleString()}원`
      : '-';

    const positionText = (item.from_low60 != null && item.from_high60 != null)
      ? `+${(item.from_low60).toFixed(1)}%/${(item.from_high60).toFixed(1)}%`
      : '';

    return `
      <div class="v10-rest-item" onclick="openV10Detail('${item.ticker}')">
        <div class="v10-rest-row">
          <div class="v10-rest-rank ${rankClass}">${rank}</div>
          <div class="v10-rest-info">
            <div class="v10-rest-name">${escapeHtml(item.name || item.ticker)}</div>
            <div class="v10-rest-meta">${item.ticker} · ${patternStr} · 승률 ${stats.winRate.toFixed(1)}%${buybackTag}</div>
          </div>
          <div class="v10-rest-score-box">
            <div class="v10-rest-score">${Math.round(item.v10_score || 0)}</div>
            <div class="v10-rest-score-label">V10</div>
          </div>
        </div>
        <div class="v10-rest-bottom">
          <div class="v10-rest-buy">${buyText}</div>
          <div class="v10-rest-position">${positionText}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// 매수 회피 배너 렌더
// ============================================
function renderV10Avoidance(avoidance) {
  const banner = document.getElementById('v10AvoidBanner');

  if (!avoidance || avoidance.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  document.getElementById('v10AvoidCount').textContent =
    `${avoidance.length}개 종목 (외국인 폭매도 등)`;
}

// ============================================
// 빈 상태 표시
// ============================================
function showV10Empty() {
  document.getElementById('v10TopCard').style.display = 'none';
  document.getElementById('v10Rest').style.display = 'none';
  document.getElementById('v10UsMarket').style.display = 'none';
  document.getElementById('v10AvoidBanner').style.display = 'none';
  document.getElementById('v10Empty').style.display = 'block';
  document.getElementById('v10Stage').textContent = '데이터 없음';
  document.getElementById('v10WinRate').textContent = '-';
}

function showV10NotAvailable() {
  document.getElementById('v10TopCard').style.display = 'none';
  document.getElementById('v10Rest').style.display = 'none';
  document.getElementById('v10UsMarket').style.display = 'none';
  document.getElementById('v10AvoidBanner').style.display = 'none';

  const empty = document.getElementById('v10Empty');
  empty.style.display = 'block';
  empty.querySelector('.v10-empty-icon').textContent = '🇺🇸';
  empty.querySelector('.v10-empty-title').textContent = '미국 V10 준비 중';
  empty.querySelector('.v10-empty-desc').innerHTML = '백테스트 진행 중입니다.<br/>곧 추가될 예정이에요!';
}

// ============================================
// 새로고침 (외부에서 호출)
// ============================================
async function refreshV10() {
  showToast('V10 추천 새로고침 중...');
  V10_CACHE.data = null;
  await renderV10();
  showToast('✅ V10 추천 갱신 완료');
}

// ============================================
// 종목 상세 보기
// ============================================
function openV10Detail(ticker) {
  if (typeof openDetail === 'function') {
    openDetail(ticker, 'kr');
  }
}

// ============================================
// 매수 회피 종목 모달 열기
// ============================================
function openV10Avoidance() {
  if (!V10_CACHE.data || !V10_CACHE.data.avoidance) return;

  const avoidance = V10_CACHE.data.avoidance;
  const groupBy = {};
  avoidance.forEach(a => {
    const key = a.reason || '기타';
    if (!groupBy[key]) groupBy[key] = [];
    groupBy[key].push(a);
  });

  let html = '<div style="padding:14px 18px 32px;">';
  html += '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;margin-bottom:14px;">';
  html += '<div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:4px;">⚠️ 매수 회피 안내</div>';
  html += `<div style="font-size:11px;color:#b91c1c;line-height:1.5;">총 ${avoidance.length}개 종목이 위험 시그널에 걸렸습니다. 보유 중이라면 매도 검토하세요.</div>`;
  html += '</div>';

  Object.keys(groupBy).forEach(reason => {
    const list = groupBy[reason];
    html += `<div style="margin-bottom:14px;">`;
    html += `<div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:8px;">${reason} (${list.length}개)</div>`;
    list.forEach(item => {
      html += `
        <div style="background:#fff;border:1px solid #fee2e2;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;"
             onclick="openDetail('${item.ticker}', 'kr')">
          <div>
            <div style="font-size:13px;font-weight:700;color:#111827;">${escapeHtml(item.name)}</div>
            <div style="font-size:10px;color:#94a3b8;font-family:'DM Mono',monospace;margin-top:2px;">${item.ticker}</div>
          </div>
          <span style="font-size:10px;color:#b91c1c;font-weight:600;">${item.severity || '주의'}</span>
        </div>
      `;
    });
    html += '</div>';
  });

  html += '</div>';

  // 모달 열기
  document.getElementById('modalTitle').textContent = '🛡️ 매수 회피 시그널';
  document.getElementById('modalSubtitle').innerHTML = `${avoidance.length}개 종목 · V10 자동 검출`;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('active');
}

// ============================================
// HTML escape
// ============================================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============================================
// Toast helper (호환용)
// ============================================
function _v10Toast(msg) {
  if (typeof showToast === 'function') {
    showToast(msg);
  }
}

// ============================================
// 자동 새로고침 - 시간대 기반
// ============================================
let _v10AutoRefreshTimer = null;
function setupV10AutoRefresh() {
  if (_v10AutoRefreshTimer) clearInterval(_v10AutoRefreshTimer);
  // 30분마다 새로고침
  _v10AutoRefreshTimer = setInterval(() => {
    if (STATE.view === 'today' && STATE.market === 'kr') {
      renderV10();
    }
  }, 30 * 60 * 1000);
}

// ============================================
// 초기화 - DOMContentLoaded 후 호출
// ============================================
function initV10() {
  renderV10();
  setupV10AutoRefresh();

  // 시장 탭 변경 시 V10도 갱신
  const origSwitchMarket = window.switchMarket;
  if (typeof origSwitchMarket === 'function') {
    window.switchMarket = function(market) {
      origSwitchMarket(market);
      renderV10();
    };
  }
}
