// ============================================
// 종목 회사 정보 (사업 개요, 업종, 섹터)
// 주요 한국/미국 종목의 정적 정보
// 네이버/Yahoo API에서 가져올 수 없는 정보를 보강
// ============================================

window.KR_STOCK_INFO = {
  // 대형주 - IT/반도체
  '005930': {
    industry: '반도체 및 관련장비',
    sector: '정보기술',
    theme: '반도체, 메모리, AI, HBM',
    description: '한국 최대 IT 기업. 메모리 반도체(DRAM, NAND), 시스템 반도체, 스마트폰(갤럭시), 가전제품 등 다양한 사업을 영위. 메모리 반도체 시장 글로벌 1위.',
  },
  '000660': {
    industry: '반도체 및 관련장비',
    sector: '정보기술',
    theme: '반도체, HBM, AI, 메모리',
    description: '메모리 반도체 전문 기업. DRAM 시장 글로벌 2위. 최근 HBM(고대역폭 메모리) 기술로 AI 시장에서 강세.',
  },
  '035420': {
    industry: '인터넷 서비스',
    sector: '커뮤니케이션 서비스',
    theme: 'AI, 클라우드, 핀테크, 검색',
    description: '한국 1위 포털 서비스. 광고, 커머스, 핀테크(네이버페이), 클라우드, 콘텐츠 등 다양한 인터넷 서비스 제공. AI(하이퍼클로바X) 개발.',
  },
  '035720': {
    industry: '인터넷 서비스',
    sector: '커뮤니케이션 서비스',
    theme: '메신저, 핀테크, 모빌리티, AI',
    description: '한국 1위 모바일 메신저(카카오톡) 운영. 카카오페이, 카카오모빌리티, 카카오엔터테인먼트 등 다양한 자회사 보유.',
  },

  // 자동차/2차전지
  '005380': {
    industry: '자동차',
    sector: '경기소비재',
    theme: '전기차, 친환경차, 자율주행',
    description: '한국 최대 자동차 제조사. 현대자동차, 제네시스 브랜드 운영. 전기차(아이오닉), 수소차 분야 진출.',
  },
  '000270': {
    industry: '자동차',
    sector: '경기소비재',
    theme: '전기차, EV, 친환경차',
    description: '한국 2위 자동차 제조사. EV6, EV9 등 전기차 라인업. 글로벌 시장에서 빠르게 성장.',
  },
  '373220': {
    industry: '2차전지',
    sector: '소재',
    theme: '2차전지, EV, ESS',
    description: 'LG에너지솔루션. 글로벌 2차전지(EV용 배터리) 시장 선두. GM, 현대차 등 주요 자동차 업체에 공급.',
  },
  '006400': {
    industry: '2차전지/소재',
    sector: '소재',
    theme: '2차전지, 양극재, 음극재',
    description: '삼성SDI. 2차전지 및 전자재료 기업. EV 배터리, 소형전지, 디스플레이 소재 등 사업.',
  },
  '051910': {
    industry: '화학/2차전지',
    sector: '소재',
    theme: '2차전지, 양극재, 화학',
    description: 'LG화학. 화학(석유화학) 본업과 함께 첨단소재(2차전지 양극재), 생명과학 사업.',
  },
  '247540': {
    industry: '2차전지 소재',
    sector: '소재',
    theme: '2차전지, 양극재, EV',
    description: '에코프로비엠. 2차전지 양극재 전문 기업. 하이니켈 양극재로 글로벌 시장 점유율 상위.',
  },

  // 바이오/제약
  '207940': {
    industry: '바이오시밀러',
    sector: '헬스케어',
    theme: '바이오, 시밀러, CDMO',
    description: '삼성바이오로직스. 바이오의약품 위탁생산(CDMO) 글로벌 선두. 세계 최대 생산능력 보유.',
  },
  '068270': {
    industry: '바이오시밀러',
    sector: '헬스케어',
    theme: '바이오시밀러, 항암제',
    description: '셀트리온. 바이오시밀러(복제 바이오의약품) 전문. 램시마, 트룩시마 등 글로벌 출시.',
  },

  // 건설
  '006360': {
    industry: '건설',
    sector: '산업재',
    theme: '건설, 재건축, 플랜트',
    description: 'GS건설. 자이(Xi) 브랜드의 주택 건설, 인프라, 플랜트 사업. 해외 EPC 프로젝트.',
  },
  '000720': {
    industry: '건설',
    sector: '산업재',
    theme: '건설, 인프라, 해외',
    description: '현대건설. 한국 1위 건설사. 주택, 토목, 플랜트, 해외 건설 사업.',
  },

  // 금융
  '105560': {
    industry: '은행',
    sector: '금융',
    theme: '은행, 금리, 배당',
    description: 'KB금융지주. KB국민은행 등을 자회사로 둔 한국 최대 금융지주.',
  },
  '055550': {
    industry: '은행',
    sector: '금융',
    theme: '은행, 디지털금융, 배당',
    description: '신한지주. 신한은행, 신한카드 등 자회사. 한국 2위 금융지주.',
  },
  '086790': {
    industry: '은행',
    sector: '금융',
    theme: '은행, 배당',
    description: '하나금융지주. 하나은행 중심의 금융지주.',
  },

  // 화학/에너지
  '096770': {
    industry: '석유/가스',
    sector: '에너지',
    theme: '에너지, 정유, 배터리',
    description: 'SK이노베이션. 정유(SK에너지), 화학, 배터리(SK온) 사업.',
  },
  '034730': {
    industry: '지주회사',
    sector: '산업재',
    theme: 'AI, 통신, 반도체, 지주',
    description: 'SK㈜. SK그룹 지주회사. 통신(SKT), 에너지, 반도체 등 자회사 보유.',
  },

  // 유통/소비재
  '003550': {
    industry: '유통',
    sector: '필수소비재',
    theme: '유통, 면세점, 식품',
    description: 'LG. LG그룹 지주회사. 전자, 화학, 통신 등 자회사 보유.',
  },

  // 코스닥 강세 종목
  '253590': {
    industry: '반도체 장비',
    sector: '정보기술',
    theme: '반도체 장비, AI',
    description: '네오셈. 반도체 검사 장비 전문 기업. 메모리 검사 장비 분야 강세.',
  },
  '480370': {
    industry: '솔루션',
    sector: '정보기술',
    theme: 'IT 솔루션',
    description: '씨케이솔루션. IT 솔루션 및 서비스 기업.',
  },
};

window.US_STOCK_INFO = {
  // Big Tech
  'AAPL': {
    industry: 'Consumer Electronics',
    sector: 'Technology',
    description: 'iPhone, Mac, iPad 등을 제조하는 글로벌 IT 기업. 서비스(앱스토어, iCloud) 사업도 확대.',
    country: 'USA',
  },
  'MSFT': {
    industry: 'Software',
    sector: 'Technology',
    description: 'Windows, Office, Azure 클라우드, Xbox 등 운영. AI 분야에서 OpenAI에 대규모 투자.',
    country: 'USA',
  },
  'GOOGL': {
    industry: 'Internet Content & Information',
    sector: 'Communication Services',
    description: '구글 검색, YouTube, 안드로이드, 클라우드 운영. AI(Gemini) 개발.',
    country: 'USA',
  },
  'AMZN': {
    industry: 'Internet Retail',
    sector: 'Consumer Cyclical',
    description: '글로벌 1위 이커머스. AWS 클라우드 분야 1위. Prime Video 등 콘텐츠 사업.',
    country: 'USA',
  },
  'META': {
    industry: 'Internet Content',
    sector: 'Communication Services',
    description: 'Facebook, Instagram, WhatsApp 운영. VR(Quest)/AI 분야 투자.',
    country: 'USA',
  },
  'NVDA': {
    industry: 'Semiconductors',
    sector: 'Technology',
    description: 'AI/데이터센터용 GPU 분야 글로벌 1위. AI 붐의 최대 수혜주.',
    country: 'USA',
  },
  'TSLA': {
    industry: 'Auto Manufacturers',
    sector: 'Consumer Cyclical',
    description: '글로벌 1위 전기차 제조사. 자율주행, 에너지 저장(파워월), 로봇 사업 확장.',
    country: 'USA',
  },

  // 반도체
  'INTC': {
    industry: 'Semiconductors',
    sector: 'Technology',
    description: 'CPU 제조 글로벌 메이저. 최근 파운드리 사업 확대.',
    country: 'USA',
  },
  'AMD': {
    industry: 'Semiconductors',
    sector: 'Technology',
    description: 'CPU/GPU 제조. AI/데이터센터 분야 NVIDIA의 주요 경쟁자.',
    country: 'USA',
  },
  'TSM': {
    industry: 'Semiconductors',
    sector: 'Technology',
    description: '대만 TSMC. 글로벌 1위 파운드리. Apple, NVIDIA 등에 칩 공급.',
    country: 'Taiwan',
  },
  'QCOM': {
    industry: 'Semiconductors',
    sector: 'Technology',
    description: '모바일 통신용 칩(스냅드래곤) 제조. 5G 분야 강세.',
    country: 'USA',
  },
  'AVGO': {
    industry: 'Semiconductors',
    sector: 'Technology',
    description: 'Broadcom. 통신/네트워크 칩 분야 강자. 최근 VMware 인수.',
    country: 'USA',
  },

  // SaaS/엔터프라이즈
  'NOW': {
    industry: 'Software',
    sector: 'Technology',
    description: 'ServiceNow. 기업용 워크플로우 자동화 SaaS 플랫폼.',
    country: 'USA',
  },
  'CRM': {
    industry: 'Software',
    sector: 'Technology',
    description: 'Salesforce. CRM(고객관계관리) 플랫폼 글로벌 1위.',
    country: 'USA',
  },
  'ORCL': {
    industry: 'Software',
    sector: 'Technology',
    description: 'Oracle. 데이터베이스, 클라우드 분야 글로벌 메이저.',
    country: 'USA',
  },

  // 금융
  'JPM': {
    industry: 'Banks',
    sector: 'Financial Services',
    description: 'JPMorgan Chase. 미국 최대 은행.',
    country: 'USA',
  },
  'BAC': {
    industry: 'Banks',
    sector: 'Financial Services',
    description: 'Bank of America. 미국 2위 은행.',
    country: 'USA',
  },
  'V': {
    industry: 'Credit Services',
    sector: 'Financial Services',
    description: 'Visa. 글로벌 1위 결제 네트워크.',
    country: 'USA',
  },
  'MA': {
    industry: 'Credit Services',
    sector: 'Financial Services',
    description: 'Mastercard. 글로벌 2위 결제 네트워크.',
    country: 'USA',
  },

  // 헬스케어/제약
  'JNJ': {
    industry: 'Drug Manufacturers',
    sector: 'Healthcare',
    description: 'Johnson & Johnson. 제약, 의료기기 글로벌 메이저.',
    country: 'USA',
  },
  'LLY': {
    industry: 'Drug Manufacturers',
    sector: 'Healthcare',
    description: 'Eli Lilly. 비만치료제(Mounjaro), 당뇨병 치료제로 강세.',
    country: 'USA',
  },
  'PFE': {
    industry: 'Drug Manufacturers',
    sector: 'Healthcare',
    description: 'Pfizer. 글로벌 제약 메이저. COVID 백신 개발사 중 하나.',
    country: 'USA',
  },

  // 소비재
  'KO': {
    industry: 'Beverages',
    sector: 'Consumer Defensive',
    description: 'Coca-Cola. 글로벌 1위 음료 회사. 워런 버핏 장기 보유.',
    country: 'USA',
  },
  'WMT': {
    industry: 'Discount Stores',
    sector: 'Consumer Defensive',
    description: 'Walmart. 미국 최대 유통사.',
    country: 'USA',
  },

  // 에너지
  'XOM': {
    industry: 'Oil & Gas',
    sector: 'Energy',
    description: 'ExxonMobil. 글로벌 메이저 석유회사.',
    country: 'USA',
  },

  // ETF
  'SPY': {
    industry: 'ETF',
    sector: 'ETF',
    description: 'S&P 500 지수 추종 ETF. 미국 대형주 500개 분산 투자.',
    country: 'USA',
  },
  'QQQ': {
    industry: 'ETF',
    sector: 'ETF',
    description: 'Nasdaq 100 ETF. 미국 기술주 대표 ETF.',
    country: 'USA',
  },
  'VOO': {
    industry: 'ETF',
    sector: 'ETF',
    description: 'Vanguard S&P 500 ETF. 낮은 보수율로 인기.',
    country: 'USA',
  },
  'SOXL': {
    industry: '3X Leveraged ETF',
    sector: 'ETF',
    description: '반도체 3X 레버리지 ETF. 변동성 매우 큼.',
    country: 'USA',
  },
  'TQQQ': {
    industry: '3X Leveraged ETF',
    sector: 'ETF',
    description: 'Nasdaq 100 3X 레버리지 ETF. 변동성 매우 큼.',
    country: 'USA',
  },
};

console.log('[StockInfo] Loaded:', Object.keys(window.KR_STOCK_INFO).length, 'KR stocks,', Object.keys(window.US_STOCK_INFO).length, 'US stocks');
