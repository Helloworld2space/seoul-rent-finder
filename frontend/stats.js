/**
 * 지역(구)별 전/월세 평균 산출 — 순수함수.
 * 브라우저(index.html <script>)와 Node(tests/) 양쪽에서 사용한다.
 *
 * @param {RentDeal[]} deals  화면에 표시 중인(필터 반영된) 거래 목록
 * @returns {Array<{
 *   district: string,
 *   total: number,
 *   jeonse: { count: number, avgDeposit: number },
 *   wolse: { count: number, avgDeposit: number, avgRent: number },
 * }>}  거래 건수 내림차순. 금액은 만원 단위 반올림.
 */
function computeRegionStats(deals) {
  const acc = new Map(); // district → 합계 누적

  for (const d of deals) {
    let row = acc.get(d.district);
    if (!row) {
      row = { jeonseCount: 0, jeonseDeposit: 0, wolseCount: 0, wolseDeposit: 0, wolseRent: 0 };
      acc.set(d.district, row);
    }
    if (d.rentType === '전세') {
      row.jeonseCount++;
      row.jeonseDeposit += d.deposit;
    } else {
      row.wolseCount++;
      row.wolseDeposit += d.deposit;
      row.wolseRent += d.monthlyRent;
    }
  }

  const avg = (sum, n) => (n > 0 ? Math.round(sum / n) : 0);

  return [...acc.entries()]
    .map(([district, r]) => ({
      district,
      total: r.jeonseCount + r.wolseCount,
      jeonse: { count: r.jeonseCount, avgDeposit: avg(r.jeonseDeposit, r.jeonseCount) },
      wolse: {
        count: r.wolseCount,
        avgDeposit: avg(r.wolseDeposit, r.wolseCount),
        avgRent: avg(r.wolseRent, r.wolseCount),
      },
    }))
    .sort((a, b) => b.total - a.total);
}

// Node(테스트)에서도 require 가능하게
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeRegionStats };
}
