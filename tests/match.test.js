// node tests/match.test.js
const { matchDistricts, nearMisses } = require('../frontend/match');

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

const d = (code, name, region, o = {}) => ({
  code, name, region,
  jeonseCount: 0, jeonseAvgDeposit: 0,
  wolseCount: 0, wolseAvgDeposit: 0, wolseAvgRent: 0,
  ...o,
});

const SAMPLE = [
  d('11680', '강남구', 'seoul', { jeonseCount: 20, jeonseAvgDeposit: 60000, wolseCount: 10, wolseAvgDeposit: 10000, wolseAvgRent: 120 }),
  d('11440', '마포구', 'seoul', { jeonseCount: 30, jeonseAvgDeposit: 30000, wolseCount: 15, wolseAvgDeposit: 3000, wolseAvgRent: 70 }),
  d('41135', '성남시 분당구', 'gyeonggi', { jeonseCount: 12, jeonseAvgDeposit: 25000, wolseCount: 8, wolseAvgDeposit: 2000, wolseAvgRent: 60 }),
  d('28185', '인천 연수구', 'incheon', { jeonseCount: 9, jeonseAvgDeposit: 15000, wolseCount: 5, wolseAvgDeposit: 1000, wolseAvgRent: 45 }),
  d('11110', '표본부족구', 'seoul', { jeonseCount: 2, jeonseAvgDeposit: 1000 }), // 표본 3 미만
];

// --- 전세: 예산 내 지역만 ---
console.log('\n[matchDistricts: 전세]');
const j = matchDistricts(SAMPLE, { rentType: '전세', deposit: 32000 });
assertEqual('예산 3.2억 → 3곳', j.map((x) => x.name), ['인천 연수구', '성남시 분당구', '마포구']);
assert('강남구(6억) 제외', !j.some((x) => x.name === '강남구'));
assert('표본 3건 미만 제외', !j.some((x) => x.name === '표본부족구'));
assertEqual('여유 큰 순 정렬 — 첫째가 가장 저렴', j[0].name, '인천 연수구');
assertEqual('depositGap 계산', j[0].depositGap, 32000 - 15000);

// --- 지역 필터 ---
console.log('\n[matchDistricts: 지역 한정]');
const seoulOnly = matchDistricts(SAMPLE, { rentType: '전세', deposit: 32000, region: 'seoul' });
assertEqual('서울만', seoulOnly.map((x) => x.name), ['마포구']);

// --- 월세: 보증금과 월세 둘 다 만족 ---
console.log('\n[matchDistricts: 월세]');
const w = matchDistricts(SAMPLE, { rentType: '월세', deposit: 5000, monthlyRent: 65 });
assertEqual('보증금5천·월세65 → 2곳', w.map((x) => x.name), ['인천 연수구', '성남시 분당구']);
assert('마포(월세70) 제외 — 월세 초과', !w.some((x) => x.name === '마포구'));

const wNoRent = matchDistricts(SAMPLE, { rentType: '월세', deposit: 5000 });
assert('월세 예산 미입력 시 보증금만 판단', wNoRent.some((x) => x.name === '마포구'));

// --- 결과 없음 ---
console.log('\n[matchDistricts: 예산 부족]');
assertEqual('아주 낮은 예산 → 빈 배열', matchDistricts(SAMPLE, { rentType: '전세', deposit: 100 }), []);

// --- 방어 ---
console.log('\n[matchDistricts: 방어]');
assertEqual('빈 입력', matchDistricts([], { rentType: '전세', deposit: 10000 }), []);
assertEqual('null 입력', matchDistricts(null, null), []);

// --- nearMisses ---
console.log('\n[nearMisses]');
const near = nearMisses(SAMPLE, { rentType: '전세', deposit: 10000 });
assertEqual('예산 초과분 중 저렴한 순', near.map((x) => x.name), ['인천 연수구', '성남시 분당구', '마포구', '강남구']);
assert('표본부족구 제외', !near.some((x) => x.name === '표본부족구'));

console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
