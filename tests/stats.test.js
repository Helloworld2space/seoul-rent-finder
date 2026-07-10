// node tests/stats.test.js
const { computeRegionStats } = require('../frontend/stats');

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

const deal = (district, rentType, deposit, monthlyRent = 0) => ({ district, rentType, deposit, monthlyRent });

// --- 기본 집계 ---
console.log('\n[computeRegionStats: 기본]');
const stats = computeRegionStats([
  deal('강남구', '전세', 50000),
  deal('강남구', '전세', 70000),
  deal('강남구', '월세', 10000, 100),
  deal('강남구', '월세', 20000, 200),
  deal('수원시 장안구', '전세', 30000),
]);

assertEqual('구 2개', stats.length, 2);
assertEqual('건수 내림차순 — 강남구 먼저', stats[0].district, '강남구');
assertEqual('강남 total', stats[0].total, 4);
assertEqual('강남 전세 건수', stats[0].jeonse.count, 2);
assertEqual('강남 전세 평균 보증금', stats[0].jeonse.avgDeposit, 60000);
assertEqual('강남 월세 건수', stats[0].wolse.count, 2);
assertEqual('강남 월세 평균 보증금', stats[0].wolse.avgDeposit, 15000);
assertEqual('강남 월세 평균 월세', stats[0].wolse.avgRent, 150);
assertEqual('장안구 전세 평균', stats[1].jeonse.avgDeposit, 30000);

// --- 한쪽 유형만 있을 때 ---
console.log('\n[computeRegionStats: 전세만]');
const only = computeRegionStats([deal('마포구', '전세', 40000)]);
assertEqual('월세 건수 0', only[0].wolse.count, 0);
assertEqual('월세 평균 0 (0나누기 방지)', only[0].wolse.avgDeposit, 0);
assertEqual('월세 평균 월세 0', only[0].wolse.avgRent, 0);

// --- 반올림 ---
console.log('\n[computeRegionStats: 반올림]');
const rounded = computeRegionStats([
  deal('중구', '전세', 10000),
  deal('중구', '전세', 10001),
]);
assertEqual('평균 만원 단위 반올림', rounded[0].jeonse.avgDeposit, 10001);

// --- 빈 입력 ---
console.log('\n[computeRegionStats: 빈 입력]');
assertEqual('빈 배열 → 빈 결과', computeRegionStats([]), []);

// --- 결과 ---
console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
