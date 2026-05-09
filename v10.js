// ============================================
// V10 ELITE 모듈 v2 - 매수가/예상수익/V10 전용 상세 모달
// ============================================

let V10_CACHE = {
  data: null,
  fetchedAt: 0,
  ttl: 30 * 60 * 1000,
};

const V10_PATTERN_STATS = {
  'A':   { winRate: 90.0, lossRate: 0.0, avgReturn: 7.47 },
  'B':   { winRate: 71.8, lossRate: 6.4, avgReturn: 9.65 },
  'C':   { winRate: 74.1, lossRate: 0.0, avgReturn: 5.89 },
  'AC':  { winRate: 94.4, lossRate: 0.0, avgReturn: 14.66 },
  'AB':  { winRate: 85.0, lossRate: 3.0, avgReturn: 10.5 },
  'BC':  { winRate: 80.0, lossRate: 2.0, avgReturn: 9.0 },
  'ABC': { winRate: 92.9, lossRate: 0.0, avgReturn: 18.07 },
  'default': { winRate: 73.2, lossRate: 4.9, avgReturn: 8.81 },
};

// ============================================
async function fetchV10Recommendations(forceRefresh = false) {
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

function calcBuyRange(closePrice) {
  if (!closePrice || closePrice <= 0) return null;
  return {
    low: Math.round(closePrice * 0.98),
    high: Math.round(closePrice * 1.02),
    close: closePrice,
  };
}

function calcBuyStatus(currentPrice, closePrice) {
  if (!currentPrice || !closePrice) return { code: 'unknown', label: '-', cls: '' };
  const ratio = currentPrice / closePrice;
  if (ratio >= 0.98 && ratio <= 1.02) return { code: 'ok', label: '매수 OK', cls: 'ok' };
  if (ratio > 1.02 && ratio <= 1.05) return { code: 'watch', label: '관망', cls: 'watch' };
  if (ratio > 1.05) return { code: 'danger', label: '추격 위험', cls: 'danger' };
  if (ratio < 0.98 && ratio >= 0.93) return { code: 'below', label: '저점 매수 기회', cls: 'below' };
  return { code: 'far', label: '대폭 하락', cls: 'below' };
}

function patternKey(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return 'default';
  return [...patterns].sort().join('');
}

function getStats(item) {
  // 백엔드에서 보낸 통계 우선, 없으면 패턴 키로 매핑
  if (item.pattern_stats) {
    return {
      winRate: item.pattern_stats.win_rate || 0,
      lossRate: item.pattern_stats.loss_rate || 0,
      avgReturn: item.pattern_stats.avg_return || 0,
      sample: item.pattern_stats.sample || 0,
    };
  }
  return V10_PATTERN_STATS[patternKey(item.patterns)] || V10_PATTERN_STATS['default'];
}

function getUsMoodClass(score) {
  if (score >= 5) return { cls: 'bullish', icon: '🟢', label: '강한 호재' };
  if (score >= 2) return { cls: 'bullish', icon: '🟢', label: '호재' };
  if (score >= -2) return { cls: 'neutral', icon: '⚪', label: '중립' };
  if (score >= -5) return { cls: 'bearish', icon: '🟠', label: '약세' };
  if (score >= -10) return { cls: 'bearish', icon: '🔴', label: '강한 약세' };
  return { cls: 'bearish', icon: '🔴', label: '폭락' };
}

function getOperationGuide(usScore) {
  if (usScore >= 8) return '적극 매수';
  if (usScore >= 3) return '정상 매수';
  if (usScore >= -3) return '일반 운영';
  if (usScore >= -8) return '패턴 B 신중';
  return '매수 보류';
}

function calcPositionPercent(fromLow60, fromHigh60) {
  if (typeof fromLow60 !== 'number' || typeof fromHigh60 !== 'number') return null;
  const range = fromLow60 + Math.abs(fromHigh60);
  if (range <= 0) return 50;
  return Math.max(0, Math.min(100, (fromLow60 / range) * 100));
}

function getPositionDotColor(percent) {
  if (percent < 30) return 'green';
  if (percent < 70) return 'blue';
  if (percent < 90) return 'yellow';
  return 'red';
}

function getCurrentStage() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 14) {
    return { stage: '2', label: '2차 추천 (08:00 · 미국 반영)' };
  } else {
    return { stage: '1', label: '1차 추천 (21:00 · 한국 마감 후)' };
  }
}

// ============================================
// 메인 렌더
// ============================================
async function renderV10() {
  const data = await fetchV10Recommendations();

  if (!data || !data.recommendations || data.recommendations.length === 0) {
    showV10Empty();
    return;
  }

  const market = STATE.market || 'kr';
  if (market !== 'kr') {
    showV10NotAvailable();
    return;
  }

  const stageInfo = getCurrentStage();
  document.getElementById('v10Stage').textContent = stageInfo.label;

  const top1 = data.recommendations[0];
  const stats = getStats(top1);
  document.getElementById('v10WinRate').textContent = `${stats.winRate.toFixed(1)}% 승률`;

  renderV10UsMarket(data.us_market);
  renderV10TopCard(top1);
  renderV10Rest(data.recommendations.slice(1, 5));
  renderV10Avoidance(data.avoidance);

  document.getElementById('v10Empty').style.display = 'none';
}

function renderV10UsMarket(usMarket) {
  if (!usMarket || !usMarket.available) {
    document.getElementById('v10UsMarket').style.display = 'none';
    return;
  }

  const banner = document.getElementById('v10UsMarket');
  banner.style.display = 'block';

  const score = usMarket.score || 0;
  const mood = getUsMoodClass(score);

  banner.classList.remove('bullish', 'bearish', 'neutral');
  banner.classList.add(mood.cls);

  document.getElementById('v10UsMoodIcon').textContent = mood.icon;
  document.getElementById('v10UsMoodText').textContent =
    `미국 시장 ${mood.label} (점수 ${score >= 0 ? '+' : ''}${score.toFixed(1)})`;
  document.getElementById('v10UsGuide').textContent = getOperationGuide(score);

  const symbols = usMarket.symbols || {};
  setUsItem('v10UsSpx', symbols.SPX);
  setUsItem('v10UsNdx', symbols.NDX);
  setUsItem('v10UsDji', symbols['.DJI'] || symbols.DJI);

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
  if (pct > 0.05) el.className = 'v10-us-change up';
  else if (pct < -0.05) el.className = 'v10-us-change down';
  else el.className = 'v10-us-change flat';
}

// ============================================
// 1순위 카드 (매수가 + 예상 매도가 추가)
// ============================================
function renderV10TopCard(item) {
  const card = document.getElementById('v10TopCard');
  card.style.display = 'block';

  const stats = getStats(item);
  const close = item.close || item.currentPrice || 0;
  const currentPrice = item.currentPrice || close;
  const buyLow = item.buy_low || (close > 0 ? Math.round(close * 0.98) : 0);
  const buyHigh = item.buy_high || (close > 0 ? Math.round(close * 1.02) : 0);
  const expectedSell = item.expected_sell_price || (close > 0 ? Math.round(close * (1 + stats.avgReturn / 100)) : 0);
  const stopLoss = item.stop_loss || (close > 0 ? Math.round(close * 0.95) : 0);
  const buyStatus = calcBuyStatus(currentPrice, close);

  const posPercent = calcPositionPercent(item.from_low60, item.from_high60);
  const posColor = posPercent != null ? getPositionDotColor(posPercent) : 'blue';

  const patternBadges = (item.patterns || []).sort()
    .map(p => `<span class="v10-pattern-tag">패턴 ${p}</span>`).join('');
  const buybackBadge = item.has_buyback
    ? '<span class="v10-buyback-badge">⭐ 자사주매입</span>' : '';

  // 매수가/매도가 박스
  let priceBoxHtml = '';
  if (close > 0) {
    priceBoxHtml = `
      <div class="v10-buy-box">
        <div class="v10-buy-header">
          <div class="v10-buy-title">🎯 추천 매수가 (종가 ±2%)</div>
        </div>
        <div class="v10-buy-range">
          <span class="v10-buy-low">${buyLow.toLocaleString()}</span>
          <span class="v10-buy-tilde">~</span>
          <span class="v10-buy-high">${buyHigh.toLocaleString()}</span>
          <span class="v10-buy-unit">원</span>
        </div>
        <div class="v10-buy-footer">
          <span class="v10-buy-current-label">현재가</span>
          <span class="v10-buy-current">${(currentPrice || 0).toLocaleString()}원</span>
          <span class="v10-buy-status ${buyStatus.cls}">${buyStatus.label}</span>
        </div>
      </div>

      <div class="v10-sell-box">
        <div class="v10-sell-header">
          <div class="v10-sell-title">📈 예상 매도가 (10일 후)</div>
        </div>
        <div class="v10-sell-range">
          <span class="v10-sell-price">${expectedSell.toLocaleString()}</span>
          <span class="v10-sell-unit">원</span>
          <span class="v10-sell-return">+${stats.avgReturn.toFixed(2)}%</span>
        </div>
        <div class="v10-sell-footer">
          <span class="v10-stop-loss-label">손절가</span>
          <span class="v10-stop-loss">${stopLoss.toLocaleString()}원 (-5%)</span>
        </div>
      </div>
    `;
  }

  // 60일 위치
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

  const chgPct = item.changePct || 0;

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

    ${priceBoxHtml}

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

    <button class="v10-detail-btn" onclick="openV10ItemDetail('${item.ticker}')">자세히 보기 →</button>
  `;
}

function formatFlow(qty) {
  if (qty == null) return '-';
  const sign = qty >= 0 ? '+' : '';
  return sign + qty.toLocaleString();
}

// ============================================
// 2~5순위 (매수가/매도가 추가)
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
    const stats = getStats(item);
    const close = item.close || 0;
    const buyLow = item.buy_low || (close > 0 ? Math.round(close * 0.98) : 0);
    const buyHigh = item.buy_high || (close > 0 ? Math.round(close * 1.02) : 0);
    const expectedSell = item.expected_sell_price || 0;
    const rankClass = rank === 2 ? 'gold' : 'silver';
    const buybackTag = item.has_buyback ? ' · ⭐ 자사주' : '';
    const patternStr = (item.patterns || []).sort().map(p => `패턴 ${p}`).join('+');

    const buyText = (close > 0)
      ? `<span class="v10-rest-buy-icon">🎯</span> ${buyLow.toLocaleString()}~${buyHigh.toLocaleString()}원`
      : '시세 정보 없음';

    const sellText = (expectedSell > 0)
      ? `<span style="color:#16a34a;">📈 ${expectedSell.toLocaleString()}원 (+${stats.avgReturn.toFixed(1)}%)</span>`
      : '';

    const positionText = (item.from_low60 != null && item.from_high60 != null)
      ? `+${(item.from_low60).toFixed(1)}%/${(item.from_high60).toFixed(1)}%`
      : '';

    return `
      <div class="v10-rest-item" onclick="openV10ItemDetail('${item.ticker}')">
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
        ${sellText ? `<div style="padding-left:38px;font-size:10px;margin-top:2px;font-family:'DM Mono',monospace;">${sellText}</div>` : ''}
      </div>
    `;
  }).join('');
}

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

async function refreshV10() {
  if (typeof showToast === 'function') showToast('V10 추천 새로고침 중...');
  V10_CACHE.data = null;
  await renderV10();
  if (typeof showToast === 'function') showToast('✅ V10 추천 갱신 완료');
}

// ============================================
// V10 전용 상세 모달 (NEW!)
// ============================================
function openV10ItemDetail(ticker) {
  if (!V10_CACHE.data) return;

  // 추천 종목에서 찾기
  const item = V10_CACHE.data.recommendations.find(r => r.ticker === ticker);
  if (!item) {
    // 회피 종목에서 찾기
    const avoid = V10_CACHE.data.avoidance.find(a => a.ticker === ticker);
    if (avoid) {
      openV10AvoidDetail(avoid);
      return;
    }
    if (typeof showToast === 'function') showToast('종목 정보 없음');
    return;
  }

  showV10DetailModal(item);
}

function showV10DetailModal(item) {
  const stats = getStats(item);
  const close = item.close || 0;
  const buyLow = item.buy_low || (close > 0 ? Math.round(close * 0.98) : 0);
  const buyHigh = item.buy_high || (close > 0 ? Math.round(close * 1.02) : 0);
  const expectedSell = item.expected_sell_price || 0;
  const stopLoss = item.stop_loss || (close > 0 ? Math.round(close * 0.95) : 0);
  const patterns = (item.patterns || []).sort();
  const patternKey = patterns.join('+') || '기타';

  // 시나리오별 수익/손실 시뮬레이션 (1000만원 기준)
  const investment = 10000000;
  const expectedProfit = close > 0 ? Math.round(investment * stats.avgReturn / 100) : 0;
  const maxLoss = close > 0 ? Math.round(investment * -10 / 100) : 0;
  const stopLossLoss = close > 0 ? Math.round(investment * -5 / 100) : 0;

  let html = `<div style="padding:14px 18px 32px;">`;

  // 종목 헤더
  html += `
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:14px;padding:16px;color:#fff;margin-bottom:14px;">
      <div style="font-size:11px;opacity:0.85;letter-spacing:1px;">${item.market || 'KOSPI'} · ${item.ticker}</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px;">${escapeHtml(item.name || '')}</div>
      <div style="display:flex;align-items:end;justify-content:space-between;margin-top:12px;">
        <div>
          <div style="font-size:11px;opacity:0.85;">현재가</div>
          <div style="font-size:24px;font-weight:700;font-family:'DM Mono',monospace;">${close.toLocaleString()}원</div>
          <div style="font-size:12px;opacity:0.9;font-family:'DM Mono',monospace;">${item.changePct >= 0 ? '+' : ''}${(item.changePct || 0).toFixed(2)}% 오늘</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;opacity:0.85;">V10 점수</div>
          <div style="font-size:32px;font-weight:700;font-family:'DM Mono',monospace;">${Math.round(item.v10_score || 0)}</div>
        </div>
      </div>
    </div>
  `;

  // 패턴 + 통계
  html += `
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:12px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:#92400e;letter-spacing:1px;margin-bottom:6px;">📊 백테스트 검증 (패턴 ${patternKey})</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
        <div style="background:#fff;border-radius:8px;padding:8px 4px;">
          <div style="font-size:9px;color:#92400e;letter-spacing:0.5px;">예상 성공률</div>
          <div style="font-size:18px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;">${stats.winRate.toFixed(1)}%</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:8px 4px;">
          <div style="font-size:9px;color:#92400e;letter-spacing:0.5px;">실패률</div>
          <div style="font-size:18px;font-weight:700;color:#dc2626;font-family:'DM Mono',monospace;">${stats.lossRate.toFixed(1)}%</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:8px 4px;">
          <div style="font-size:9px;color:#92400e;letter-spacing:0.5px;">평균 수익률</div>
          <div style="font-size:18px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;">+${stats.avgReturn.toFixed(2)}%</div>
        </div>
      </div>
    </div>
  `;

  // 매수/매도 가이드
  if (close > 0) {
    html += `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:10px;">💰 매매 가이드</div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <div>
            <div style="font-size:12px;color:#64748b;">🎯 매수가 (종가 ±2%)</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:1px;">분할매수 권장</div>
          </div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;">${buyLow.toLocaleString()}~${buyHigh.toLocaleString()}원</div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <div>
            <div style="font-size:12px;color:#16a34a;">📈 예상 매도가 (10일 후)</div>
            <div style="font-size:9px;color:#16a34a;margin-top:1px;">+${stats.avgReturn.toFixed(2)}%</div>
          </div>
          <div style="font-size:14px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;">${expectedSell.toLocaleString()}원</div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;">
          <div>
            <div style="font-size:12px;color:#dc2626;">🛑 손절가</div>
            <div style="font-size:9px;color:#dc2626;margin-top:1px;">-5% 도달 시 매도</div>
          </div>
          <div style="font-size:14px;font-weight:700;color:#dc2626;font-family:'DM Mono',monospace;">${stopLoss.toLocaleString()}원</div>
        </div>
      </div>
    `;

    // 시나리오 시뮬레이션 (1000만원 투자 시)
    html += `
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:8px;">💵 1,000만원 투자 시 시나리오</div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span style="font-size:12px;color:#16a34a;">✅ 평균 시나리오 (${stats.winRate.toFixed(0)}%)</span>
          <span style="font-size:13px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;">+${expectedProfit.toLocaleString()}원</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span style="font-size:12px;color:#dc2626;">🛑 손절 시 (5%)</span>
          <span style="font-size:13px;font-weight:700;color:#dc2626;font-family:'DM Mono',monospace;">${stopLossLoss.toLocaleString()}원</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span style="font-size:12px;color:#dc2626;">⚠️ 최대 손실 시 (10%)</span>
          <span style="font-size:13px;font-weight:700;color:#dc2626;font-family:'DM Mono',monospace;">${maxLoss.toLocaleString()}원</span>
        </div>
      </div>
    `;
  }

  // 외국인/기관 매매
  html += `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:10px;">📊 수급 정보</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f8fafc;border-radius:8px;padding:8px;">
          <div style="font-size:10px;color:#64748b;">외국인 5일</div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:${(item.kis_f5 || 0) >= 0 ? '#dc2626' : '#2563eb'};">${formatFlow(item.kis_f5)}주</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:8px;">
          <div style="font-size:10px;color:#64748b;">기관 5일</div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:${(item.kis_i5 || 0) >= 0 ? '#dc2626' : '#2563eb'};">${formatFlow(item.kis_i5)}주</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:8px;">
          <div style="font-size:10px;color:#64748b;">외국인 20일</div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;color:${(item.kis_f20 || 0) >= 0 ? '#dc2626' : '#2563eb'};">${formatFlow(item.kis_f20)}주</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:8px;">
          <div style="font-size:10px;color:#64748b;">외국인 매수일</div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;">${item.foreign_buy_days || 0}/10일</div>
        </div>
      </div>
    </div>
  `;

  // 자사주매입 등 특이사항
  if (item.has_buyback) {
    html += `
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#92400e;">⭐ 자사주매입 공시 보유</div>
        <div style="font-size:10px;color:#92400e;margin-top:2px;">기업이 자사 주식을 매입 - 강한 긍정 시그널</div>
      </div>
    `;
  }

  // 60일 위치
  const posPercent = calcPositionPercent(item.from_low60, item.from_high60);
  if (posPercent != null) {
    const posColor = getPositionDotColor(posPercent);
    html += `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:10px;">📈 60일 가격 위치</div>
        <div style="position:relative;height:8px;background:#f1f5f9;border-radius:4px;margin:12px 0;">
          <div style="position:absolute;top:50%;left:${posPercent}%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:${
            posColor === 'green' ? '#16a34a' :
            posColor === 'blue' ? '#2563eb' :
            posColor === 'yellow' ? '#fbbf24' : '#dc2626'
          };border:2px solid #fff;box-shadow:0 0 0 1px #e5e7eb;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;font-family:'DM Mono',monospace;">
          <span>저점 +${(item.from_low60 || 0).toFixed(1)}%</span>
          <span>현재</span>
          <span>고점 ${(item.from_high60 || 0).toFixed(1)}%</span>
        </div>
        <div style="margin-top:8px;font-size:10px;color:#64748b;text-align:center;">
          ${posPercent < 30 ? '🟢 저점 근처 - 좋은 진입 위치' :
            posPercent < 70 ? '🔵 중간 - 안정적 위치' :
            posPercent < 90 ? '🟡 고점 근처 - 신중' : '🔴 신고가 - 추격 위험'}
        </div>
      </div>
    `;
  }

  html += `
    <div style="font-size:10px;color:#94a3b8;text-align:center;line-height:1.5;margin-top:14px;">
      ⚠️ 이 정보는 백테스트 기반 추천이며, 투자 책임은 본인에게 있습니다.<br/>
      손절가 -5%, 보유 기간 10영업일을 권장합니다.
    </div>
  `;

  html += '</div>';

  // 모달 열기 (기존 detailModal 사용)
  document.getElementById('modalTitle').textContent = `🌟 V10 정예 추천`;
  document.getElementById('modalSubtitle').innerHTML = `🇰🇷 ${item.market || 'KOSPI'} · 패턴 ${patternKey} · 백테스트 ${stats.winRate.toFixed(1)}%`;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('active');
}

function openV10AvoidDetail(item) {
  let html = `<div style="padding:14px 18px 32px;">`;
  html += `
    <div style="background:linear-gradient(135deg,#991b1b,#dc2626);border-radius:14px;padding:16px;color:#fff;margin-bottom:14px;">
      <div style="font-size:11px;opacity:0.85;letter-spacing:1px;">매수 회피</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px;">${escapeHtml(item.name)}</div>
      <div style="font-size:11px;opacity:0.9;margin-top:2px;font-family:'DM Mono',monospace;">${item.ticker}</div>
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;">
      <div style="font-size:13px;font-weight:700;color:#991b1b;">${item.reason}</div>
      <div style="font-size:11px;color:#b91c1c;margin-top:6px;line-height:1.5;">
        등급: ${item.severity || '주의'}<br/>
        보유 중이라면 매도 검토 권장합니다.
      </div>
    </div>
  </div>`;

  document.getElementById('modalTitle').textContent = '🛡️ 매수 회피';
  document.getElementById('modalSubtitle').innerHTML = `${item.severity || '주의'} 등급`;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('active');
}

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
             onclick="openV10AvoidDetail({ticker:'${item.ticker}',name:'${escapeHtml(item.name).replace(/'/g, "\\'")}',reason:'${escapeHtml(item.reason).replace(/'/g, "\\'")}',severity:'${escapeHtml(item.severity || '').replace(/'/g, "\\'")}'})">
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

  document.getElementById('modalTitle').textContent = '🛡️ 매수 회피 시그널';
  document.getElementById('modalSubtitle').innerHTML = `${avoidance.length}개 종목 · V10 자동 검출`;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('active');
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

let _v10AutoRefreshTimer = null;
function setupV10AutoRefresh() {
  if (_v10AutoRefreshTimer) clearInterval(_v10AutoRefreshTimer);
  _v10AutoRefreshTimer = setInterval(() => {
    if (STATE.view === 'today' && STATE.market === 'kr') {
      renderV10();
    }
  }, 30 * 60 * 1000);
}

function initV10() {
  renderV10();
  setupV10AutoRefresh();
}
