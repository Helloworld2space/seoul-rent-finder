// node tests/prefs.test.js
const { computePreferences } = require('../frontend/prefs');

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

const deal = (district, rentType, deposit, area, propertyType = '아파트') =>
  ({ district, rentType, deposit, area, propertyType });

// --- 기본 ---
console.log('\n[computePreferences: 기본]');
const p = computePreferences([
  deal('강남구', '전세', 50000, 59),
  deal('강남구', '전세', 70000, 84),
  deal('마포구', '월세', 10000, 33, '오피스텔'),
]);
assertEqual('선호 지역 빈도순', p.districts, ['강남구', '마포구']);
assertEqual('유형 집합', p.propertyTypes.sort(), ['아파트', '오피스텔'].sort());
assertEqual('전세 다수결', p.rentType, '전세');
assertEqual('보증금 최소 -15%', p.depositMin, 8500);
assertEqual('보증금 최대 +15%', p.depositMax, 80500);
assertEqual('면적 최소 -15%', p.areaMin, 28);
assertEqual('면적 최대 +15%', p.areaMax, 97);

// --- 동률 ---
console.log('\n[computePreferences: 전월세 동률]');
const tie = computePreferences([deal('강남구', '전세', 1000, 30), deal('강남구', '월세', 1000, 30)]);
assertEqual('동률 → 전체("")', tie.rentType, '');

// --- 상위 5개 제한 ---
console.log('\n[computePreferences: 지역 상위 5]');
const many = computePreferences(
  ['A', 'A', 'B', 'B', 'C', 'D', 'E', 'F'].map((g) => deal(g, '전세', 1000, 30))
);
assertEqual('최대 5개 지역', many.districts.length, 5);
assertEqual('빈도 상위 우선', many.districts.slice(0, 2).sort(), ['A', 'B']);

// --- propertyType 결측(구버전 저장분) ---
console.log('\n[computePreferences: propertyType 결측]');
const legacy = computePreferences([{ district: '강남구', rentType: '전세', deposit: 1000, area: 30 }]);
assertEqual('결측 → 아파트 취급', legacy.propertyTypes, ['아파트']);

// --- 빈 입력 ---
console.log('\n[computePreferences: 빈 입력]');
assertEqual('0건 → null', computePreferences([]), null);
assertEqual('undefined → null', computePreferences(undefined), null);

// --- 결과 ---
console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
