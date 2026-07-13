/**
 * 저장된 관심 거래에서 사용자 선호를 추출하는 순수함수.
 * 브라우저(맞춤 검색 자동 세팅)와 Node(tests/) 양쪽에서 사용.
 *
 * @param {RentDeal[]} deals  저장된 관심 거래 (favorites의 deal 필드 목록)
 * @returns {null | {
 *   districts: string[],          // 저장 빈도 상위 지역명 (최대 5)
 *   propertyTypes: string[],      // 저장된 주거유형 집합
 *   rentType: '전세'|'월세'|'',    // 다수결 (동률이면 '' = 전체)
 *   depositMin: number, depositMax: number,   // 만원, ±15% 여유
 *   areaMin: number, areaMax: number,         // ㎡, ±15% 여유
 * }}  저장 0건이면 null
 */
function computePreferences(deals) {
  if (!deals || deals.length === 0) return null;

  // 지역: 빈도 내림차순 상위 5
  const freq = new Map();
  deals.forEach((d) => freq.set(d.district, (freq.get(d.district) ?? 0) + 1));
  const districts = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const propertyTypes = [...new Set(deals.map((d) => d.propertyType ?? '아파트'))];

  const jeonse = deals.filter((d) => d.rentType === '전세').length;
  const wolse = deals.length - jeonse;
  const rentType = jeonse > wolse ? '전세' : wolse > jeonse ? '월세' : '';

  const deposits = deals.map((d) => d.deposit);
  const areas = deals.map((d) => d.area);
  const pad = (v, dir) => Math.max(0, Math.round(v * (1 + dir * 0.15)));

  return {
    districts,
    propertyTypes,
    rentType,
    depositMin: pad(Math.min(...deposits), -1),
    depositMax: pad(Math.max(...deposits), +1),
    areaMin: pad(Math.min(...areas), -1),
    areaMax: pad(Math.max(...areas), +1),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computePreferences };
}
