/**
 * 간단검색 — 예산으로 "갈 수 있는 지역"을 찾는 순수함수.
 * 브라우저와 Node(tests/) 양쪽에서 사용한다.
 *
 * 기존 검색이 "지역을 고른 뒤 조건을 좁히는" 방향이라면,
 * 여기는 반대로 "예산에서 출발해 지역을 찾는" 역방향 탐색이다.
 */

/** 표본이 이보다 적으면 평균을 신뢰하기 어려워 결과에서 뺀다 */
const MIN_SAMPLE = 3;

/**
 * @param {Array} districts  /api/prices?by=district 응답의 districts
 * @param {object} criteria
 *   @param {'전세'|'월세'} criteria.rentType
 *   @param {number} criteria.deposit      보증금 예산 (만원)
 *   @param {number} [criteria.monthlyRent] 월세 예산 (만원) — 월세일 때만
 *   @param {string} [criteria.region]     'seoul'|'gyeonggi'|'incheon' (없으면 전체)
 * @returns {Array} 예산에 맞는 지역. 예산 대비 여유가 큰 순.
 *   각 항목: { code, name, region, avgDeposit, avgRent, count, depositGap, rentGap }
 */
function matchDistricts(districts, criteria) {
  if (!districts || !criteria) return [];
  const { rentType, deposit, region } = criteria;
  const isJeonse = rentType === '전세';
  const rentBudget = criteria.monthlyRent;

  return districts
    .filter((d) => !region || d.region === region)
    .map((d) => {
      const count = isJeonse ? d.jeonseCount : d.wolseCount;
      const avgDeposit = isJeonse ? d.jeonseAvgDeposit : d.wolseAvgDeposit;
      const avgRent = isJeonse ? 0 : d.wolseAvgRent;
      return {
        code: d.code,
        name: d.name,
        region: d.region,
        count,
        avgDeposit,
        avgRent,
        // 예산에서 얼마나 여유가 있는지 (음수면 예산 초과)
        depositGap: deposit - avgDeposit,
        rentGap: isJeonse ? 0 : (rentBudget ?? 0) - avgRent,
      };
    })
    .filter((d) => {
      if (d.count < MIN_SAMPLE || d.avgDeposit <= 0) return false;
      if (d.depositGap < 0) return false;
      // 월세는 보증금과 월세를 모두 만족해야 한다
      if (!isJeonse && rentBudget != null && d.rentGap < 0) return false;
      return true;
    })
    // 예산 여유가 큰 곳부터 (같으면 거래가 많은 곳 = 선택지가 많은 곳)
    .sort((a, b) => b.depositGap - a.depositGap || b.count - a.count);
}

/**
 * 예산에 맞는 지역이 하나도 없을 때, 가장 가까운 후보를 알려주기 위한 보조.
 * "조금만 올리면 갈 수 있는 곳"을 보여줘 빈 화면을 피한다.
 * @returns {Array} 예산 초과폭이 작은 순 상위 n곳
 */
function nearMisses(districts, criteria, limit = 5) {
  if (!districts || !criteria) return [];
  const { rentType, deposit, region } = criteria;
  const isJeonse = rentType === '전세';

  return districts
    .filter((d) => !region || d.region === region)
    .map((d) => ({
      code: d.code,
      name: d.name,
      region: d.region,
      count: isJeonse ? d.jeonseCount : d.wolseCount,
      avgDeposit: isJeonse ? d.jeonseAvgDeposit : d.wolseAvgDeposit,
      avgRent: isJeonse ? 0 : d.wolseAvgRent,
    }))
    .filter((d) => d.count >= MIN_SAMPLE && d.avgDeposit > deposit)
    .sort((a, b) => a.avgDeposit - b.avgDeposit)
    .slice(0, limit);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { matchDistricts, nearMisses, MIN_SAMPLE };
}
