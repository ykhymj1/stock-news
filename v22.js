// ============================================
// V22 RECOMMEND 모듈 - StockRadar 환경별 패턴 추천 시스템
// ============================================
// 백엔드 데이터: Worker /v22-recommend 엔드포인트
// 백테스트: 5년 1082건, 통합 81.2% 승률, +수익 92.5%
// 보수적 운영: 80%+ 패턴만 사용, 없으면 "추천 없음"
// ============================================

// V22 데이터 캐시 (메모리)
let V22_CACHE = {
  data: null,
  fetchedAt: 0,
  ttl: 30 * 60 * 1000,  // 30분 캐시
};

// V22 환경별 표시 정보
const V22_REGIME_INFO = {
  strong_bear: { emoji: '🔴', label: '강한 하락장' },
  bear: { emoji: '🔴', label: '하락장' },
  sideways: { emoji: '⚪', label: '횡보장' },
  bull: { emoji: '🟢', label: '상승장' },
  strong_bull: { emoji: '🟢', label: '강한 상승장' },
  unknown: { emoji: '❓', label: '환경 분석 중' },
};

// V22 Tier 한글명 (V22++++++ 5년 백테스트 81.2% 검증)
const V22_TIER_NAME = {
  // 🔴 강한 하락장 (n=85, 82.4%, +19.13%)
  'SB_R20_30_STRICT': '강한 하락 + 폭락 반등',
  // 🔴 하락장 (n=82, 81.7%, +9.32%)
  'B_PRI_DEEP': '깊은 조정 (50%+ 폭락)',
  // ⚪ 횡보장 (n=28, 82.1%, +0.74%)
  'SW_VOL': '변동성 압축',
  // 🟢 상승장 (n=40, 77.5%, +0.07%)
  'BU_BIG_DROP': '5일 급락 반등',
  // 🟢 강한 상승장 - 신규 (n=22, 90.9%, +3.15%) ⭐
  'SB_A_PEAK': '강한 상승장·고점 반등',
  // 🟢 강한 상승장 (n=825, 81.0%, +2.15%)
  'SB_S_30': '강한 상승장·30% 조정',
  
  // 옛 Tier (호환성 - 혹시 옛 데이터 표시 시)
  'U1_PEAK': '갭다운 + 60일 폭락',
  'U1': '60일 폭락 (안전망)',
  'S1_LOW': '저점 근처 + 60일 폭락',
  'EXT': '극단 폭락',
  'B_PRI': '가격 폭락 우선',
  'SB_U_VOL': '60일 폭락 + 변동성 압축',
  'SB_U_GAP': '60일 폭락 + 갭다운',
  'SB_U': '60일 폭락 (조정)',
  'SB_S_35': '강한 조정 (35%+)',
  'B_PRI_VOL': '가격 폭락 + 변동성 압축',
};

// ============================================
// V22 데이터 가져오기 (Worker 호출)
// ============================================
async function fetchV22Recommendations(forceRefresh = false) {
  if (!forceRefresh && V22_CACHE.data && (Date.now() - V22_CACHE.fetchedAt) < V22_CACHE.ttl) {
    return V22_CACHE.data;
  }
  const newsProxyUrl = (typeof STATE !== 'undefined' && STATE.settings && STATE.settings.newsProxyUrl)
    || 'https://ykh-news-proxy.kyunghoyou.workers.dev';
  const url = `${newsProxyUrl}/v22-recommend`;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      // 404 = 데이터 없음 (자동 추천 대기 중)
      if (res.status === 404) {
        const data = await res.json();
        V22_CACHE.data = data;
        V22_CACHE.fetchedAt = Date.now();
        return data;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    V22_CACHE.data = data;
    V22_CACHE.fetchedAt = Date.now();
    return data;
  } catch (e) {
    console.error('[V22] fetch error:', e);
    return null;
  }
}

// ============================================
// V22 별점 계산 (예상 승률 기반)
// ============================================
function getV22Stars(expectedWr) {
  if (expectedWr >= 95) return '⭐⭐⭐⭐';
  if (expectedWr >= 90) return '⭐⭐⭐';
  if (expectedWr >= 85) return '⭐⭐';
  return '⭐';
}

// ============================================
// 메인 렌더 함수 - V22 섹션 그리기
// ============================================
async function renderV22() {
  // 한국 시장만 V22 지원
  const market = (typeof STATE !== 'undefined' && STATE.market) || 'kr';
  
  // 시장 탭 전환 처리
  const sec = document.getElementById('v22Section');
  if (market !== 'kr') {
    if (sec) sec.style.display = 'none';
    return;
  }
  
  // 한국 시장 - V22 섹션 다시 보이게
  if (sec) sec.style.display = '';
  
  const data = await fetchV22Recommendations();
  
  // 데이터 없음
  if (!data || !data.ok) {
    showV22Empty(data);
    return;
  }
  
  // 시스템 헬스 표시
  renderV22Health(data.health);
  
  // 시장 환경 표시
  renderV22Regime(data.regime);
  
  // 추천 종목 (또는 "오늘 추천 없음")
  if (data.recommendations && data.recommendations.length > 0) {
    renderV22TopCard(data.recommendations[0]);  // 1순위 큰 카드
    renderV22Rest(data.recommendations.slice(1, 5));  // 2~5순위
    document.getElementById('v22Empty').style.display = 'none';
  } else {
    showV22NoRecommend();
  }
  
  // 매수 차단 (악재)
  renderV22Blocked(data.blocked);
}

// ============================================
// 헬스체크 표시
// ============================================
function renderV22Health(health) {
  const el = document.getElementById('v22Health');
  if (!el) return;
  if (!health) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const score = health.health_score || 0;
  let icon = '🟢', cls = 'good';
  if (score < 70) { icon = '🔴'; cls = 'bad'; }
  else if (score < 90) { icon = '🟡'; cls = 'warn'; }
  
  el.classList.remove('good', 'warn', 'bad');
  el.classList.add(cls);
  
  document.getElementById('v22HealthIcon').textContent = icon;
  document.getElementById('v22HealthText').textContent = `시스템 ${health.summary || '점검 중'} (${score}%)`;
  
  // 문제 있는 항목 표시
  const failed = Object.entries(health.checks || {}).filter(([k, v]) => !v.ok);
  const detailEl = document.getElementById('v22HealthDetail');
  if (failed.length > 0) {
    detailEl.style.display = 'block';
    detailEl.textContent = '⚠️ ' + failed.map(([k]) => k).join(', ') + ' 점검 필요';
  } else {
    detailEl.style.display = 'none';
  }
}

// ============================================
// 시장 환경 표시
// ============================================
function renderV22Regime(regime) {
  const el = document.getElementById('v22Regime');
  if (!el) return;
  if (!regime || regime.regime === 'unknown') {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const info = V22_REGIME_INFO[regime.regime] || V22_REGIME_INFO.unknown;
  document.getElementById('v22RegimeIcon').textContent = info.emoji;
  document.getElementById('v22RegimeLabel').textContent = info.label;
  
  if (regime.ret_60d != null) {
    const sign = regime.ret_60d >= 0 ? '+' : '';
    document.getElementById('v22RegimeMeta').textContent = 
      `KOSPI 60일 ${sign}${regime.ret_60d.toFixed(1)}%`;
  }
}

// ============================================
// 1순위 큰 카드 렌더 (스크린샷 1124 형식)
// ============================================
function renderV22TopCard(item) {
  const card = document.getElementById('v22TopCard');
  if (!card) return;
  card.style.display = 'block';
  
  const stars = getV22Stars(item.expected_wr);
  const tierLabel = V22_TIER_NAME[item.tier] || item.tier;
  
  const buybackBadge = item.has_buyback
    ? '<span class="v22-buyback-badge">⭐ 자사주매입</span>' : '';
  
  // 매수가/매도가 박스
  let priceBoxHtml = '';
  if (item.close > 0) {
    priceBoxHtml = `
      <div class="v22-buy-box">
        <div class="v22-buy-title">🎯 추천 매수가 (종가 ±2%)</div>
        <div class="v22-buy-range">
          <span class="v22-buy-low">${item.buy_price_low.toLocaleString()}</span>
          <span class="v22-buy-tilde">~</span>
          <span class="v22-buy-high">${item.buy_price_high.toLocaleString()}</span>
          <span class="v22-buy-unit">원</span>
        </div>
        <div class="v22-buy-footer">
          <span class="v22-buy-current-label">현재가</span>
          <span class="v22-buy-current">${item.close.toLocaleString()}원</span>
        </div>
      </div>
      <div class="v22-sell-box">
        <div class="v22-sell-title">📈 익절가 (${item.hold_days}일 후 +${item.tp_pct}%)</div>
        <div class="v22-sell-range">
          <span class="v22-sell-price">${item.target_price.toLocaleString()}</span>
          <span class="v22-sell-unit">원</span>
        </div>
        <div class="v22-sell-footer">
          <span class="v22-stop-loss-label">손절가 (-5%)</span>
          <span class="v22-stop-loss">${item.stop_price.toLocaleString()}원</span>
        </div>
      </div>
    `;
  }
  
  // DART 공시 정보
  let filingHtml = '';
  if (item.dart_strongest_negative) {
    filingHtml = `
      <div class="v22-filing-warn">
        ⚠️ ${escapeHtml(item.dart_strongest_negative.label || '주의 공시')}
      </div>
    `;
  } else if (item.dart_strongest_positive) {
    filingHtml = `
      <div class="v22-filing-good">
        ✅ ${escapeHtml(item.dart_strongest_positive.label || '호재 공시')}
      </div>
    `;
  }
  
  card.innerHTML = `
    <div class="v22-top-header">
      <div class="v22-top-header-left">
        <span class="v22-rank-badge">1순위</span>
        ${buybackBadge}
      </div>
      <div class="v22-top-tag">V22</div>
    </div>
    <div class="v22-top-name">${escapeHtml(item.name || item.ticker)}</div>
    <div class="v22-top-meta">
      ${item.ticker} · ${item.market || 'KOSPI'} · ${item.changePct >= 0 ? '+' : ''}${(item.changePct || 0).toFixed(2)}%
    </div>
    <div class="v22-tier-row">
      <span class="v22-tier-tag">${item.tier}</span>
      <span class="v22-tier-desc">${tierLabel}</span>
    </div>
    <div class="v22-stats-box">
      <div class="v22-stat success">
        <div class="v22-stat-label">예상 승률</div>
        <div class="v22-stat-value">
          <span class="v22-stat-num">${item.expected_wr}</span>
          <span class="v22-stat-pct">%</span>
        </div>
        <div class="v22-stat-stars">${stars}</div>
      </div>
      <div class="v22-stat info">
        <div class="v22-stat-label">최종 점수</div>
        <div class="v22-stat-value">
          <span class="v22-stat-num">${item.final_score}</span>
        </div>
      </div>
    </div>
    ${priceBoxHtml}
    ${filingHtml}
    <div class="v22-info-row">
      <div class="v22-info-item">
        <div class="v22-info-label">60일 위치</div>
        <div class="v22-info-value">저점+${(item.from_low60 || 0).toFixed(1)}%</div>
      </div>
      <div class="v22-info-item">
        <div class="v22-info-label">5일 변동</div>
        <div class="v22-info-value">${(item.ret_5d || 0).toFixed(1)}%</div>
      </div>
      <div class="v22-info-item">
        <div class="v22-info-label">변동성</div>
        <div class="v22-info-value">${(item.volatility || 0).toFixed(1)}</div>
      </div>
    </div>
    <button class="v22-detail-btn" onclick="openV22ItemDetail('${item.ticker}')">자세히 보기 →</button>
  `;
}

// ============================================
// 2~5순위 리스트
// ============================================
function renderV22Rest(items) {
  const container = document.getElementById('v22Rest');
  const list = document.getElementById('v22RestList');
  if (!container || !list) return;
  
  if (!items || items.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  list.innerHTML = items.map((item, idx) => {
    const rank = idx + 2;
    const stars = getV22Stars(item.expected_wr);
    const buybackTag = item.has_buyback ? ' · ⭐' : '';
    return `
      <div class="v22-rest-item" onclick="openV22ItemDetail('${item.ticker}')">
        <div class="v22-rest-row">
          <div class="v22-rest-rank">${rank}</div>
          <div class="v22-rest-info">
            <div class="v22-rest-name">${escapeHtml(item.name || item.ticker)}</div>
            <div class="v22-rest-meta">${item.ticker} · ${item.tier} · 승률 ${item.expected_wr}%${buybackTag}</div>
          </div>
          <div class="v22-rest-score-box">
            <div class="v22-rest-score">${item.final_score}</div>
            <div class="v22-rest-stars">${stars}</div>
          </div>
        </div>
        <div class="v22-rest-bottom">
          <span class="v22-rest-buy">🎯 ${item.buy_price_low.toLocaleString()}~${item.buy_price_high.toLocaleString()}원</span>
          <span class="v22-rest-target">📈 +${item.tp_pct}% / ${item.hold_days}일</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// 매수 차단 (DART 악재) 표시
// ============================================
function renderV22Blocked(blocked) {
  const banner = document.getElementById('v22BlockedBanner');
  if (!banner) return;
  if (!blocked || blocked.length === 0) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  document.getElementById('v22BlockedCount').textContent =
    `${blocked.length}개 종목 (DART 악재)`;
}

// ============================================
// 빈 상태들
// ============================================
function showV22Empty(data) {
  const sec = document.getElementById('v22TopCard');
  if (sec) sec.style.display = 'none';
  const rest = document.getElementById('v22Rest');
  if (rest) rest.style.display = 'none';
  const block = document.getElementById('v22BlockedBanner');
  if (block) block.style.display = 'none';
  
  const empty = document.getElementById('v22Empty');
  if (empty) {
    empty.style.display = 'block';
    const msg = (data && data.message) || '자동 추천 대기 중';
    empty.querySelector('.v22-empty-title').textContent = 'V22 추천 대기';
    empty.querySelector('.v22-empty-desc').innerHTML = 
      msg + '<br/><small>매일 21:00 (한국 마감 후, 거래일 전)</small>';
  }
}

function showV22NoRecommend() {
  const card = document.getElementById('v22TopCard');
  if (card) card.style.display = 'none';
  const rest = document.getElementById('v22Rest');
  if (rest) rest.style.display = 'none';
  
  const empty = document.getElementById('v22Empty');
  if (empty) {
    empty.style.display = 'block';
    empty.querySelector('.v22-empty-icon').textContent = '🛡️';
    empty.querySelector('.v22-empty-title').textContent = '오늘은 80%+ 패턴 없음';
    empty.querySelector('.v22-empty-desc').innerHTML = 
      '보수적 운영 - 억지로 추천하지 않음<br/><small>다음 추천: 다음 거래일 21:00</small>';
  }
}

function showV22NotAvailable() {
  const sec = document.getElementById('v22Section');
  if (sec) sec.style.display = 'none';
}

// ============================================
// V22 상세 모달
// ============================================
function openV22ItemDetail(ticker) {
  if (!V22_CACHE.data) return;
  
  let item = (V22_CACHE.data.recommendations || []).find(r => r.ticker === ticker);
  if (!item) {
    item = (V22_CACHE.data.blocked || []).find(b => b.ticker === ticker);
  }
  if (!item) {
    if (typeof showToast === 'function') showToast('종목 정보 없음');
    return;
  }
  
  showV22DetailModal(item);
}

function showV22DetailModal(item) {
  const stars = getV22Stars(item.expected_wr);
  const tierLabel = V22_TIER_NAME[item.tier] || item.tier;
  
  // 1000만원 시뮬
  const investment = 10000000;
  const expectedProfit = Math.round(investment * item.tp_pct / 100);
  const stopLoss = Math.round(investment * -5 / 100);
  
  let html = `<div style="padding:14px 18px 32px;">`;
  
  // 헤더
  html += `
    <div style="background:linear-gradient(135deg,#5b21b6,#7c3aed,#a855f7);border-radius:14px;padding:16px;color:#fff;margin-bottom:14px;">
      <div style="font-size:11px;opacity:0.85;letter-spacing:1px;">${item.market || 'KOSPI'} · ${item.ticker}</div>
      <div style="font-size:24px;font-weight:700;margin-top:4px;">${escapeHtml(item.name || '')}</div>
      <div style="display:flex;align-items:end;justify-content:space-between;margin-top:12px;">
        <div>
          <div style="font-size:11px;opacity:0.85;">현재가</div>
          <div style="font-size:24px;font-weight:700;font-family:'DM Mono',monospace;">${(item.close || 0).toLocaleString()}원</div>
          <div style="font-size:12px;opacity:0.9;font-family:'DM Mono',monospace;">${item.changePct >= 0 ? '+' : ''}${(item.changePct || 0).toFixed(2)}% 오늘</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;opacity:0.85;">최종 점수</div>
          <div style="font-size:32px;font-weight:700;font-family:'DM Mono',monospace;">${item.final_score}</div>
        </div>
      </div>
    </div>
  `;
  
  // V22 패턴 검증
  html += `
    <div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:12px;padding:12px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:#5b21b6;letter-spacing:1px;margin-bottom:6px;">📊 V22 패턴 (${item.tier} - ${tierLabel}) ${stars}</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;text-align:center;">
        <div style="background:#fff;border-radius:8px;padding:8px 4px;">
          <div style="font-size:9px;color:#5b21b6;letter-spacing:0.5px;">예상 승률</div>
          <div style="font-size:22px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;">${item.expected_wr}%</div>
        </div>
        <div style="background:#fff;border-radius:8px;padding:8px 4px;">
          <div style="font-size:9px;color:#5b21b6;letter-spacing:0.5px;">시장 환경</div>
          <div style="font-size:14px;font-weight:700;color:#7c3aed;margin-top:6px;">${(V22_REGIME_INFO[item.regime] || {}).label || item.regime}</div>
        </div>
      </div>
    </div>
  `;
  
  // 매매 가이드
  if (item.close > 0) {
    html += `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:10px;">💰 매매 가이드</div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <div>
            <div style="font-size:12px;color:#64748b;">🎯 매수가 (종가 ±2%)</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:1px;">분할매수 권장</div>
          </div>
          <div style="font-size:14px;font-weight:700;font-family:'DM Mono',monospace;">${item.buy_price_low.toLocaleString()}~${item.buy_price_high.toLocaleString()}원</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <div>
            <div style="font-size:12px;color:#16a34a;">📈 익절가 (${item.hold_days}일 후)</div>
            <div style="font-size:9px;color:#16a34a;margin-top:1px;">+${item.tp_pct}%</div>
          </div>
          <div style="font-size:14px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;">${item.target_price.toLocaleString()}원</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;">
          <div>
            <div style="font-size:12px;color:#dc2626;">🛑 손절가</div>
            <div style="font-size:9px;color:#dc2626;margin-top:1px;">-5% 도달 시 매도</div>
          </div>
          <div style="font-size:14px;font-weight:700;color:#dc2626;font-family:'DM Mono',monospace;">${item.stop_price.toLocaleString()}원</div>
        </div>
      </div>
    `;
    
    // 1000만원 시뮬
    html += `
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:8px;">💵 1,000만원 투자 시</div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span style="font-size:12px;color:#16a34a;">✅ 익절 (${item.expected_wr}% 확률)</span>
          <span style="font-size:13px;font-weight:700;color:#16a34a;font-family:'DM Mono',monospace;">+${expectedProfit.toLocaleString()}원</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <span style="font-size:12px;color:#dc2626;">🛑 손절 시</span>
          <span style="font-size:13px;font-weight:700;color:#dc2626;font-family:'DM Mono',monospace;">${stopLoss.toLocaleString()}원</span>
        </div>
      </div>
    `;
  }
  
  // 자사주매입 등 특이사항
  if (item.has_buyback) {
    html += `
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:#92400e;">⭐ 자사주매입 공시 보유</div>
        <div style="font-size:10px;color:#92400e;margin-top:2px;">강한 긍정 시그널</div>
      </div>
    `;
  }
  
  // DART 공시 정보
  if (item.dart_filings_count > 0) {
    html += `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#475569;letter-spacing:1px;margin-bottom:8px;">📋 DART 공시 (최근 7일, ${item.dart_filings_count}건)</div>
    `;
    if (item.dart_strongest_negative) {
      html += `<div style="background:#fef2f2;border-radius:8px;padding:8px;margin-bottom:6px;font-size:12px;color:#991b1b;">⚠️ ${escapeHtml(item.dart_strongest_negative.label || '주의')}</div>`;
    }
    if (item.dart_strongest_positive) {
      html += `<div style="background:#f0fdf4;border-radius:8px;padding:8px;margin-bottom:6px;font-size:12px;color:#15803d;">✅ ${escapeHtml(item.dart_strongest_positive.label || '호재')}</div>`;
    }
    html += `</div>`;
  }
  
  // 차단 사유 (blocked 종목인 경우)
  if (item.dart_block_reasons && item.dart_block_reasons.length > 0) {
    html += `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:6px;">🚫 매수 차단 사유</div>
        ${item.dart_block_reasons.map(r => `<div style="font-size:12px;color:#b91c1c;line-height:1.5;">• ${escapeHtml(r)}</div>`).join('')}
      </div>
    `;
  }
  
  html += `
    <div style="font-size:10px;color:#94a3b8;text-align:center;line-height:1.5;margin-top:14px;">
      ⚠️ 백테스트 기반 추천 (5년 1082건 검증)<br/>
      손절가 -5%, 보유 기간 ${item.hold_days}영업일 권장
    </div>
  `;
  html += '</div>';
  
  // 모달 열기
  document.getElementById('modalTitle').textContent = `🌟 V22 추천`;
  document.getElementById('modalSubtitle').innerHTML = 
    `${(V22_REGIME_INFO[item.regime] || {}).label || ''} · ${item.tier} · 백테스트 81.2%`;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('active');
}

// ============================================
// 매수 차단 모달
// ============================================
function openV22Blocked() {
  if (!V22_CACHE.data || !V22_CACHE.data.blocked) return;
  
  const blocked = V22_CACHE.data.blocked;
  let html = '<div style="padding:14px 18px 32px;">';
  html += `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;margin-bottom:14px;">
      <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:4px;">🚫 매수 차단 안내</div>
      <div style="font-size:11px;color:#b91c1c;line-height:1.5;">
        총 ${blocked.length}개 종목이 DART 공시상 악재 (감사의견/상장폐지 등)로 차단되었습니다.
      </div>
    </div>
  `;
  
  blocked.forEach(item => {
    const reasons = item.dart_block_reasons || [];
    html += `
      <div style="background:#fff;border:1px solid #fee2e2;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer;"
           onclick="openV22ItemDetail('${item.ticker}')">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:13px;font-weight:700;color:#111827;">${escapeHtml(item.name)}</div>
            <div style="font-size:10px;color:#94a3b8;font-family:'DM Mono',monospace;margin-top:2px;">${item.ticker}</div>
          </div>
          <span style="font-size:10px;color:#b91c1c;font-weight:600;">차단</span>
        </div>
        ${reasons.length > 0 ? `<div style="font-size:11px;color:#b91c1c;margin-top:4px;">• ${escapeHtml(reasons[0])}</div>` : ''}
      </div>
    `;
  });
  
  html += '</div>';
  
  document.getElementById('modalTitle').textContent = '🚫 매수 차단 종목';
  document.getElementById('modalSubtitle').innerHTML = `${blocked.length}개 종목 · V22 자동 검출`;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('detailModal').classList.add('active');
}

// ============================================
// 새로고침
// ============================================
async function refreshV22() {
  if (typeof showToast === 'function') showToast('V22 추천 새로고침 중...');
  V22_CACHE.data = null;
  await renderV22();
  if (typeof showToast === 'function') showToast('✅ V22 추천 갱신 완료');
}

// ============================================
// 자동 새로고침
// ============================================
let _v22AutoRefreshTimer = null;
function setupV22AutoRefresh() {
  if (_v22AutoRefreshTimer) clearInterval(_v22AutoRefreshTimer);
  _v22AutoRefreshTimer = setInterval(() => {
    if (typeof STATE !== 'undefined' && STATE.view === 'today' && STATE.market === 'kr') {
      renderV22();
    }
  }, 30 * 60 * 1000);
}

// ============================================
// 초기화
// ============================================
function initV22() {
  renderV22();
  setupV22AutoRefresh();
}

// ============================================
// 자동 초기화 - DOMContentLoaded 또는 즉시 (이미 로드된 경우)
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof initV22 === 'function') {
      // STATE가 이미 정의되어 있어야 함 (app.js 로드 후)
      setTimeout(initV22, 500);
    }
  });
} else {
  setTimeout(() => {
    if (typeof initV22 === 'function') initV22();
  }, 500);
}

// 시장 탭 전환 시 V22도 갱신
(function() {
  const origSwitchMarket = window.switchMarket;
  if (typeof origSwitchMarket === 'function') {
    window.switchMarket = function(market) {
      origSwitchMarket(market);
      if (typeof renderV22 === 'function') renderV22();
    };
  }
})();


// ============================================
// 🆕 V22 검색 평가 기능 (v6.11)
// 사용자가 종목명/티커를 입력하고 매수가(선택) 입력 → V22 평가 결과 모달 표시
// ============================================

// 종목명 → 티커 변환 (kr_stocks.js의 KR_STOCKS / KR_CODE_TO_NAME 사용)
function v22ResolveTicker(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  
  // 6자리 티커
  if (/^\d{6}$/.test(s)) {
    const name = (window.KR_CODE_TO_NAME && window.KR_CODE_TO_NAME[s]) || '';
    return { ticker: s, name };
  }
  
  // 종목명 (정확 매칭 → 부분 매칭)
  const dict = window.KR_STOCKS || {};
  if (dict[s]) {
    return { ticker: dict[s], name: s };
  }
  
  // 대소문자 무시 + 공백 제거 매칭
  const sLower = s.toLowerCase().replace(/\s/g, '');
  for (const [name, code] of Object.entries(dict)) {
    if (name.toLowerCase().replace(/\s/g, '') === sLower) {
      return { ticker: code, name };
    }
  }
  
  // 부분 매칭 (포함)
  for (const [name, code] of Object.entries(dict)) {
    if (name.includes(s)) {
      return { ticker: code, name };
    }
  }
  
  return null;
}

// 자동완성 후보 검색 (최대 8개)
function v22SuggestStocks(query) {
  if (!query || query.length < 1) return [];
  const dict = window.KR_STOCKS || {};
  const q = query.trim();
  const qLower = q.toLowerCase();
  const results = [];
  const seen = new Set();
  
  // 6자리 코드 입력 시
  if (/^\d{1,6}$/.test(q)) {
    const codeMap = window.KR_CODE_TO_NAME || {};
    for (const code of Object.keys(codeMap)) {
      if (code.startsWith(q)) {
        if (seen.has(code)) continue;
        seen.add(code);
        results.push({ ticker: code, name: codeMap[code] });
        if (results.length >= 8) break;
      }
    }
    return results;
  }
  
  // 종목명 prefix 매칭 우선
  for (const [name, code] of Object.entries(dict)) {
    if (seen.has(code)) continue;
    if (name.startsWith(q) || name.toLowerCase().startsWith(qLower)) {
      seen.add(code);
      results.push({ ticker: code, name });
      if (results.length >= 8) break;
    }
  }
  
  // 부분 매칭으로 보충
  if (results.length < 8) {
    for (const [name, code] of Object.entries(dict)) {
      if (seen.has(code)) continue;
      if (name.includes(q) || name.toLowerCase().includes(qLower)) {
        seen.add(code);
        results.push({ ticker: code, name });
        if (results.length >= 8) break;
      }
    }
  }
  
  return results;
}

// 자동완성 표시
function onV22SearchInput(event) {
  const value = event.target.value;
  const suggest = document.getElementById('v22EvalSuggest');
  if (!suggest) return;
  
  if (!value || value.length < 1) {
    suggest.style.display = 'none';
    suggest.innerHTML = '';
    return;
  }
  
  const items = v22SuggestStocks(value);
  if (items.length === 0) {
    suggest.style.display = 'none';
    return;
  }
  
  suggest.innerHTML = items.map(it => `
    <div class="v22-suggest-item" onclick="selectV22Suggest('${it.ticker}','${escapeHtmlV22(it.name)}')">
      <span class="v22-suggest-name">${escapeHtmlV22(it.name)}</span>
      <span class="v22-suggest-code">${it.ticker}</span>
    </div>
  `).join('');
  suggest.style.display = 'block';
}

function selectV22Suggest(ticker, name) {
  const input = document.getElementById('v22EvalTickerInput');
  if (input) input.value = name;
  input.dataset.resolvedTicker = ticker;
  const suggest = document.getElementById('v22EvalSuggest');
  if (suggest) {
    suggest.style.display = 'none';
    suggest.innerHTML = '';
  }
}

function onV22SearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    runV22Evaluate();
  } else if (event.key === 'Escape') {
    const suggest = document.getElementById('v22EvalSuggest');
    if (suggest) suggest.style.display = 'none';
  }
}

// 외부 클릭 시 자동완성 닫기
document.addEventListener('click', function(e) {
  const wrap = document.querySelector('.v22-search-row-wrap');
  const suggest = document.getElementById('v22EvalSuggest');
  if (wrap && suggest && !wrap.contains(e.target)) {
    suggest.style.display = 'none';
  }
});

function escapeHtmlV22(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// 메인: 평가 실행
async function runV22Evaluate() {
  const tickerInput = document.getElementById('v22EvalTickerInput');
  const priceInput = document.getElementById('v22EvalPriceInput');
  const btn = document.getElementById('v22EvalSearchBtn');
  
  if (!tickerInput) return;
  const rawInput = tickerInput.value.trim();
  if (!rawInput) {
    alert('종목명 또는 티커를 입력해주세요');
    return;
  }
  
  // 1) 자동완성에서 선택한 티커 우선
  let resolved = null;
  if (tickerInput.dataset.resolvedTicker) {
    resolved = {
      ticker: tickerInput.dataset.resolvedTicker,
      name: rawInput,
    };
  } else {
    resolved = v22ResolveTicker(rawInput);
  }
  
  if (!resolved) {
    alert(`"${rawInput}" 종목을 찾을 수 없습니다.\n종목명을 정확히 입력하거나 6자리 티커를 입력해주세요.`);
    return;
  }
  
  // 2) 매수가 처리 (선택)
  let buyPrice = 0;
  if (priceInput && priceInput.value) {
    buyPrice = parseFloat(priceInput.value);
    if (isNaN(buyPrice) || buyPrice < 0) buyPrice = 0;
  }
  
  // 3) 모달 열고 로딩 표시
  openV22EvalModal();
  renderV22EvalLoading(resolved.name, resolved.ticker);
  
  if (btn) btn.disabled = true;
  
  // 4) Worker 호출
  try {
    const proxyUrl = (typeof STATE !== 'undefined' && STATE.settings && STATE.settings.newsProxyUrl)
      || 'https://ykh-news-proxy.kyunghoyou.workers.dev';
    let url = `${proxyUrl}/v22-evaluate?ticker=${resolved.ticker}`;
    if (buyPrice > 0) url += `&buy_price=${buyPrice}`;
    
    const res = await fetch(url, { cache: 'no-cache' });
    const data = await res.json();
    
    if (!res.ok || data.error) {
      renderV22EvalError(data.error || `HTTP ${res.status}`);
      return;
    }
    
    renderV22EvalResult(data);
  } catch (e) {
    console.error('[V22 Evaluate] error:', e);
    renderV22EvalError(e.message || '네트워크 오류');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openV22EvalModal() {
  const m = document.getElementById('v22EvalModal');
  if (m) m.classList.add('show');
}

function closeV22EvalModal() {
  const m = document.getElementById('v22EvalModal');
  if (m) m.classList.remove('show');
}

function closeV22EvalModalOnBg(event) {
  if (event.target.id === 'v22EvalModal') closeV22EvalModal();
}

function renderV22EvalLoading(name, ticker) {
  const body = document.getElementById('v22EvalBody');
  if (!body) return;
  body.innerHTML = `
    <div class="v22-eval-loading">
      <div class="v22-eval-spinner"></div>
      <div><b>${escapeHtmlV22(name)}</b> (${ticker}) 평가 중...</div>
      <div style="margin-top:6px;font-size:11px;">KIS API + DART + 뉴스 분석 (최대 10초)</div>
    </div>
  `;
}

function renderV22EvalError(msg) {
  const body = document.getElementById('v22EvalBody');
  if (!body) return;
  body.innerHTML = `
    <div class="v22-eval-error">
      ❌ ${escapeHtmlV22(msg)}
    </div>
  `;
}

// 환경 라벨
const V22_REGIME_LABEL_FULL = {
  strong_bear: { emoji: '🔴', label: '강한 하락장' },
  bear: { emoji: '🔴', label: '하락장' },
  sideways: { emoji: '⚪', label: '횡보장' },
  bull: { emoji: '🟢', label: '상승장' },
  strong_bull: { emoji: '🟢', label: '강한 상승장' },
  unknown: { emoji: '❓', label: '환경 분석 중' },
};

function renderV22EvalResult(data) {
  const body = document.getElementById('v22EvalBody');
  if (!body) return;
  
  if (!data.found) {
    body.innerHTML = `<div class="v22-eval-error">❌ ${escapeHtmlV22(data.error || '데이터 조회 실패')}</div>`;
    return;
  }
  
  let html = '';
  
  // 헤더 (종목명 + 현재가)
  html += `
    <div class="v22-eval-stock-name">${escapeHtmlV22(data.name || data.ticker)}</div>
    <div class="v22-eval-stock-meta">
      ${data.ticker} · 현재가 ${(data.current_price || 0).toLocaleString()}원
      ${data.change_pct != null ? ` · ${data.change_pct >= 0 ? '+' : ''}${data.change_pct.toFixed(2)}%` : ''}
    </div>
  `;
  
  // 시장 환경
  const regimeKey = (data.regime && data.regime.regime) || 'unknown';
  const regimeInfo = V22_REGIME_LABEL_FULL[regimeKey] || V22_REGIME_LABEL_FULL.unknown;
  const ret60d = data.regime && data.regime.ret_60d;
  html += `
    <div class="v22-eval-section">
      <div class="v22-eval-section-title">📊 시장 환경</div>
      <div class="v22-eval-row">
        <span class="v22-eval-row-label">현재 환경</span>
        <span class="v22-eval-row-value">${regimeInfo.emoji} ${regimeInfo.label}${ret60d != null ? ` (${ret60d >= 0 ? '+' : ''}${ret60d.toFixed(1)}%)` : ''}</span>
      </div>
    </div>
  `;
  
  // V22 매칭 결과
  if (data.v22_match && data.v22) {
    const v = data.v22;
    const tierName = (typeof V22_TIER_NAME !== 'undefined' && V22_TIER_NAME[v.tier]) || v.tier;
    const stars = v.expected_wr >= 95 ? '⭐⭐⭐⭐' :
                  v.expected_wr >= 90 ? '⭐⭐⭐' :
                  v.expected_wr >= 85 ? '⭐⭐' : '⭐';
    
    html += `
      <div class="v22-eval-section" style="background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border:1px solid #c4b5fd;">
        <div class="v22-eval-section-title" style="color:#5b21b6;">🌟 V22 패턴 매칭 ${stars}</div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">패턴</span>
          <span class="v22-eval-row-value">${v.tier} · ${escapeHtmlV22(tierName)}</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">예상 승률</span>
          <span class="v22-eval-row-value green">${v.expected_wr}%</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">V22 점수</span>
          <span class="v22-eval-row-value">${v.v22_score}</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">추천 매수가</span>
          <span class="v22-eval-row-value">${v.buy_price_low.toLocaleString()}~${v.buy_price_high.toLocaleString()}원</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">추천 매도가 (목표)</span>
          <span class="v22-eval-row-value green">${v.target_price.toLocaleString()}원 (+${v.tp_pct}%)</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">손절가</span>
          <span class="v22-eval-row-value red">${v.stop_price.toLocaleString()}원 (-5%)</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">예상 보유 기간</span>
          <span class="v22-eval-row-value">${v.hold_days}일</span>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="v22-eval-warning">
        ⚠️ ${escapeHtmlV22(data.v22_no_match_reason || 'V22 추천 패턴 미매칭')}
        <div style="font-size:11px;margin-top:4px;">현재 시장 환경에서 80%+ 승률 패턴에 해당하지 않습니다. 아래 지표는 참고용입니다.</div>
      </div>
    `;
  }
  
  // 사용자 매수가 분석 (있을 경우)
  if (data.user_buy_analysis) {
    const u = data.user_buy_analysis;
    if (u.grade) {
      const colorClass = u.grade_color || 'amber';
      html += `
        <div class="v22-eval-grade-card ${colorClass}">
          <div class="v22-eval-grade-stars">${u.grade_stars}</div>
          <div class="v22-eval-grade-label">${escapeHtmlV22(u.grade_label)}</div>
        </div>
        <div class="v22-eval-section">
          <div class="v22-eval-section-title">💰 매수가 ${u.buy_price.toLocaleString()}원 기준 손익</div>
          <div class="v22-eval-row">
            <span class="v22-eval-row-label">목표가 도달 시 수익</span>
            <span class="v22-eval-row-value ${u.expected_profit_pct >= 0 ? 'green' : 'red'}">
              ${u.expected_profit_pct >= 0 ? '+' : ''}${u.expected_profit_pct.toFixed(2)}% (${u.expected_profit_won >= 0 ? '+' : ''}${u.expected_profit_won.toLocaleString()}원)
            </span>
          </div>
          <div class="v22-eval-row">
            <span class="v22-eval-row-label">손절 시 손실</span>
            <span class="v22-eval-row-value red">${u.max_loss_pct.toFixed(2)}% (${u.max_loss_won.toLocaleString()}원)</span>
          </div>
          <div class="v22-eval-row">
            <span class="v22-eval-row-label">V22 추천가 대비</span>
            <span class="v22-eval-row-value">${u.vs_v22_low_pct >= 0 ? '+' : ''}${u.vs_v22_low_pct.toFixed(1)}% / ${u.vs_v22_high_pct >= 0 ? '+' : ''}${u.vs_v22_high_pct.toFixed(1)}%</span>
          </div>
          <div class="v22-eval-row">
            <span class="v22-eval-row-label">예상 보유</span>
            <span class="v22-eval-row-value">${u.hold_days}일 (예상 승률 ${u.expected_wr}%)</span>
          </div>
        </div>
      `;
    } else if (u.note) {
      // V22 미매칭 - 단순 정보만
      html += `
        <div class="v22-eval-section">
          <div class="v22-eval-section-title">💰 매수가 ${u.buy_price.toLocaleString()}원</div>
          <div class="v22-eval-row">
            <span class="v22-eval-row-label">현재가 대비</span>
            <span class="v22-eval-row-value">${u.vs_current_pct >= 0 ? '+' : ''}${u.vs_current_pct.toFixed(2)}%</span>
          </div>
          <div class="v22-eval-row" style="font-size:11px;color:#6b7280;">
            ${escapeHtmlV22(u.note)}
          </div>
        </div>
      `;
    }
  }
  
  // 60일 위치 + 핵심 지표
  if (data.indicators) {
    const ind = data.indicators;
    html += `
      <div class="v22-eval-section">
        <div class="v22-eval-section-title">📈 핵심 지표 (60일 기준)</div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">60일 고점 대비</span>
          <span class="v22-eval-row-value ${ind.from_high60 <= -30 ? 'red' : ''}">${ind.from_high60 >= 0 ? '+' : ''}${ind.from_high60.toFixed(1)}%</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">60일 저점 대비</span>
          <span class="v22-eval-row-value">${ind.from_low60 >= 0 ? '+' : ''}${ind.from_low60.toFixed(1)}%</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">5일 수익률</span>
          <span class="v22-eval-row-value ${ind.ret_5d >= 0 ? 'green' : 'red'}">${ind.ret_5d >= 0 ? '+' : ''}${ind.ret_5d.toFixed(1)}%</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">20일 변동성</span>
          <span class="v22-eval-row-value">${ind.volatility.toFixed(2)}</span>
        </div>
        <div class="v22-eval-row">
          <span class="v22-eval-row-label">시장 동조 (vs KOSPI)</span>
          <span class="v22-eval-row-value ${ind.relative_to_market >= 0 ? 'green' : 'red'}">${ind.relative_to_market >= 0 ? '+' : ''}${ind.relative_to_market.toFixed(1)}%</span>
        </div>
      </div>
    `;
  }
  
  // 4단계 안전망 결과
  if (data.filters) {
    const f = data.filters;
    const hasIssue = f.financial_blocked || f.dart_blocked || f.news_blocked;
    
    html += `<div class="v22-eval-section">`;
    html += `<div class="v22-eval-section-title">🔍 4단계 안전망 검증</div>`;
    
    // 재무
    html += `
      <div class="v22-eval-row">
        <span class="v22-eval-row-label">재무 부실</span>
        <span class="v22-eval-row-value ${f.financial_blocked ? 'red' : 'green'}">
          ${f.financial_blocked ? '❌ 블랙리스트' : '✅ 정상'}
        </span>
      </div>
    `;
    if (f.financial_blocked && f.financial_reasons.length) {
      html += `<div style="font-size:11px;color:#dc2626;padding:2px 0 6px;">└ ${f.financial_reasons.join(', ')}</div>`;
    }
    
    // DART
    html += `
      <div class="v22-eval-row">
        <span class="v22-eval-row-label">DART 공시 (30일)</span>
        <span class="v22-eval-row-value ${f.dart_blocked ? 'red' : (f.has_buyback ? 'green' : '')}">
          ${f.dart_blocked ? '❌ 차단' : (f.has_buyback ? '⭐ 자사주매입' : `📋 ${f.dart_filings_count}건`)}
        </span>
      </div>
    `;
    if (f.dart_warnings && f.dart_warnings.length) {
      html += `<div style="font-size:11px;color:#d97706;padding:2px 0 6px;">└ ${f.dart_warnings.join(', ')}</div>`;
    }
    if (f.dart_strongest_negative) {
      html += `<div style="font-size:11px;color:#dc2626;padding:2px 0 6px;">└ ⚠️ ${escapeHtmlV22(f.dart_strongest_negative.label || '')}</div>`;
    }
    if (f.dart_strongest_positive) {
      html += `<div style="font-size:11px;color:#16a34a;padding:2px 0 6px;">└ ✅ ${escapeHtmlV22(f.dart_strongest_positive.label || '')}</div>`;
    }
    
    // 뉴스
    html += `
      <div class="v22-eval-row">
        <span class="v22-eval-row-label">뉴스 (호재/악재)</span>
        <span class="v22-eval-row-value ${f.news_blocked ? 'red' : (f.news_score > 0 ? 'green' : '')}">
          ${f.news_blocked ? '❌ 강한 악재' : (f.news_count > 0 ? `📰 ${f.news_count}건 (${f.news_score >= 0 ? '+' : ''}${f.news_score})` : '없음')}
        </span>
      </div>
    `;
    
    // 종합
    html += `
      <div class="v22-eval-row" style="border-top:1px solid #e5e7eb;margin-top:6px;padding-top:8px;">
        <span class="v22-eval-row-label" style="font-weight:700;">종합</span>
        <span class="v22-eval-row-value ${hasIssue ? 'red' : 'green'}">
          ${hasIssue ? '⚠️ 위험 신호 있음' : '✅ 안전망 통과'}
        </span>
      </div>
    `;
    
    html += `</div>`;
  }
  
  // 푸터
  html += `
    <div style="text-align:center;font-size:10px;color:#9ca3af;padding:12px 0 0;">
      V22 v6.11 · 백테스트 1082건 81.2%<br>
      ⚠️ 투자 판단은 본인 책임
    </div>
  `;
  
  body.innerHTML = html;
}
