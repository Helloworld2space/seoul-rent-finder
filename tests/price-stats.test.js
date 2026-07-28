// node tests/price-stats.test.js
const { aggregate, mergeRows } = require('../backend/price-stats');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertEqual(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) console.error(`    actual:   ${JSON.stringify(actual)}`);
  if (!ok) console.error(`    expected: ${JSON.stringify(expected)}`);
  assert(label, ok);
}

const deal = (dong, rentType, deposit, monthlyRent = 0) => ({ dong, rentType, deposit, monthlyRent });
const META = { ym: '202607', districtCode: '11440', propertyType: 'rh' };
const byDong = (rows, dong) => rows.find((r) => r.dong === dong);

// --- 동별 그룹핑 + 구 합계 ---
console.log('\n[aggregate: 기본]');
const rows = aggregate(
  [
    deal('성산동', '전세', 20000),
    deal('성산동', '전세', 30000),
    deal('성산동', '월세', 1000, 60),
    deal('연남동', '월세', 2000, 80),
  ],
  META
);

assertEqual('동 2개 + 구 합계 = 3행', rows.length, 3);
const seongsan = byDong(rows, '성산동');
assertEqual('성산동 전세 건수', seongsan.jeonse_count, 2);
assertEqual('성산동 전세 평균', seongsan.jeonse_avg_deposit, 25000);
assertEqual('성산동 월세 건수', seongsan.wolse_count, 1);
assertEqual('성산동 월세 평균 월세', seongsan.wolse_avg_rent, 60);

const total = byDong(rows, '');
assertEqual('구 합계 전세 건수', total.jeonse_count, 2);
assertEqual('구 합계 월세 건수', total.wolse_count, 2);
assertEqual('구 합계 월세 평균 보증금', total.wolse_avg_deposit, 1500);
assertEqual('구 합계 월세 평균 월세', total.wolse_avg_rent, 70);

console.log('\n[aggregate: 메타 전파]');
assertEqual('ym', seongsan.ym, '202607');
assertEqual('district_code', seongsan.district_code, '11440');
assertEqual('property_type', seongsan.property_type, 'rh');

// --- 한쪽 유형만 있을 때 0나누기 방지 ---
console.log('\n[aggregate: 전세만]');
const only = aggregate([deal('망원동', '전세', 15000)], META);
assertEqual('월세 건수 0', byDong(only, '망원동').wolse_count, 0);
assertEqual('월세 평균 0', byDong(only, '망원동').wolse_avg_deposit, 0);

// --- 동명 결측 ---
console.log('\n[aggregate: 동명 없음]');
const noDong = aggregate([deal('', '전세', 10000)], META);
assert('(미상)으로 분류', byDong(noDong, '(미상)') !== undefined);

// --- 빈 입력 ---
console.log('\n[aggregate: 빈 입력]');
assertEqual('거래 0건 → 빈 배열', aggregate([], META), []);

// --- mergeRows: 건수 가중 평균 ---
console.log('\n[mergeRows: 가중 평균]');
const merged = mergeRows([
  { jeonse_count: 1, jeonse_avg_deposit: 10000, wolse_count: 0, wolse_avg_deposit: 0, wolse_avg_rent: 0 },
  { jeonse_count: 3, jeonse_avg_deposit: 20000, wolse_count: 0, wolse_avg_deposit: 0, wolse_avg_rent: 0 },
]);
assertEqual('전세 건수 합', merged.jeonseCount, 4);
assertEqual('평균의 평균(15000) 아닌 가중평균(17500)', merged.jeonseAvgDeposit, 17500);

console.log('\n[mergeRows: 빈 입력]');
const empty = mergeRows([]);
assertEqual('건수 0', empty.jeonseCount, 0);
assertEqual('평균 0 (0나누기 방지)', empty.jeonseAvgDeposit, 0);

// --- 결과 ---
console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
