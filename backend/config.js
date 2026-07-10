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
};
