require('dotenv').config();

const SERVICE_KEY = process.env.SERVICE_KEY;
if (!SERVICE_KEY) {
  throw new Error('.env에 SERVICE_KEY가 없습니다. .env.example을 참고하세요.');
}

module.exports = {
  SERVICE_KEY,
  PORT: process.env.PORT || 3000,
  MOLIT_BASE_URL:
    'http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
  PAGE_SIZE: 1000,

  // 서울 열린데이터광장 — 부동산 중개업소 정보 (없으면 중개업소 기능만 비활성)
  SEOUL_API_KEY: process.env.SEOUL_API_KEY || null,
  SEOUL_BROKER_BASE_URL: 'http://openapi.seoul.go.kr:8088',
  SEOUL_BROKER_SERVICE: 'landBizInfo',
  BROKER_PAGE_SIZE: 1000,
  BROKER_CACHE_TTL_MS: 24 * 60 * 60 * 1000,
};
