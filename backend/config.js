require('dotenv').config();

const SERVICE_KEY = process.env.SERVICE_KEY;
if (!SERVICE_KEY) {
  throw new Error('.env에 SERVICE_KEY가 없습니다. .env.example을 참고하세요.');
}

module.exports = {
  SERVICE_KEY,
  PORT: process.env.PORT || 3000,
  // 유형별 국토부 전월세 실거래가 엔드포인트.
  // apt 외에는 data.go.kr에서 API별 활용신청이 따로 필요(미승인 시 403 → 빈 결과로 격리).
  MOLIT_ENDPOINTS: {
    apt: 'http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
    rh: 'http://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent',
    sh: 'http://apis.data.go.kr/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent',
    offi: 'http://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent',
  },
  PAGE_SIZE: 1000,
  // (유형,구,월) 수집 캐시 TTL — 일 1,000건 쿼터 보호. 당월은 갱신되므로 짧게.
  MOLIT_CACHE_TTL_CURRENT_MS: 60 * 60 * 1000,
  MOLIT_CACHE_TTL_PAST_MS: 24 * 60 * 60 * 1000,

  // 서울 열린데이터광장 — 부동산 중개업소 정보 (없으면 중개업소 기능만 비활성)
  SEOUL_API_KEY: process.env.SEOUL_API_KEY || null,
  SEOUL_BROKER_BASE_URL: 'http://openapi.seoul.go.kr:8088',
  SEOUL_BROKER_SERVICE: 'landBizInfo',
  BROKER_PAGE_SIZE: 1000,
  BROKER_CACHE_TTL_MS: 24 * 60 * 60 * 1000,

  // "오늘의 집값은?" 시세 통계 (없으면 해당 페이지만 비활성 — 나머지 기능 무영향)
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://xwmvozrdhvemokidcbww.supabase.co',
  // service_role 키는 RLS를 우회하므로 절대 브라우저에 노출 금지 — 서버에서만 사용
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  CRON_SECRET: process.env.CRON_SECRET || null,
  // 지도에 집계할 유형 — 1인 가구 대상인 빌라·단독만 (아파트 제외)
  STATS_TYPES: ['rh', 'sh'],
  STATS_MONTHS: 3, // 동별 표본 확보를 위해 최근 3개월 누적 표시
  // 국토부 API가 구 하나에 수 초씩 걸려 83개를 한 번에 수집하면 서버리스 실행
  // 시간(최대 60초)을 넘긴다. 며칠에 걸쳐 나눠 수집한다.
  STATS_PARTS: 4,
};
