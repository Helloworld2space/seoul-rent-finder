// node tests/profile.test.js
const { describeDong, buildReport, MIN_SAMPLE } = require('../frontend/profile');

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

const YEAR = 2026; // 테스트가 해가 바뀌어도 깨지지 않게 고정
const dong = (o) => ({
  dong: '테스트동', jeonseCount: 0, wolseCount: 0,
  jeonseAvgDeposit: 0, wolseAvgDeposit: 0, wolseAvgRent: 0,
  areaAvg: 0, buildYearAvg: 0, ...o,
});

// --- 월세 위주 원룸촌 ---
console.log('\n[describeDong: 월세 위주 · 작은 집 · 노후]');
const r1 = describeDong(dong({ jeonseCount: 30, wolseCount: 70, areaAvg: 28.5, buildYearAvg: 1999 }), YEAR);
assertEqual('월세 비중 70%', r1.wolseRatio, 70);
assert('월세 위주 태그', r1.tags.includes('월세 위주'));
assert('작은 집 태그', r1.tags.includes('작은 집 위주'));
assert('노후 태그 (1999년, 27년)', r1.tags.includes('오래된 주택 많음'));
assert('요약에 평수 환산 포함', r1.summary.includes('평'));
assert('요약이 문장으로 끝남', r1.summary.endsWith('.'));

// --- 전세 위주 · 넓은 집 · 신축 ---
console.log('\n[describeDong: 전세 위주 · 넓은 집 · 신축]');
const r2 = describeDong(dong({ jeonseCount: 80, wolseCount: 20, areaAvg: 72.0, buildYearAvg: 2020 }), YEAR);
assert('전세 위주 태그', r2.tags.includes('전세 위주'));
assert('넓은 집 태그', r2.tags.includes('넓은 집 많음'));
assert('신축 태그 (2020년, 6년)', r2.tags.includes('신축 많음'));
assert('노후 태그 없음', !r2.tags.includes('오래된 주택 많음'));

// --- 중간값: 단정하지 않음 ---
console.log('\n[describeDong: 뚜렷한 특징 없음]');
const r3 = describeDong(dong({ jeonseCount: 50, wolseCount: 50, areaAvg: 45, buildYearAvg: 2011 }), YEAR);
assertEqual('성격 태그 없음', r3.tags, []);
assert('그래도 요약은 제공', r3.summary.length > 10);
assert('섞여 있다고 서술', r3.summary.includes('비슷하게 섞여'));

// --- 표본 부족 ---
console.log('\n[describeDong: 표본 부족]');
const r4 = describeDong(dong({ jeonseCount: 2, wolseCount: 3, areaAvg: 30, buildYearAvg: 1990 }), YEAR);
assertEqual('enough=false', r4.enough, false);
assertEqual('표본 적음 태그만', r4.tags, ['표본 적음']);
assert('건수를 밝힘', r4.summary.includes('5건'));
assert('성격을 단정하지 않음', !r4.tags.includes('월세 위주'));
assert(`기준은 ${MIN_SAMPLE}건`, MIN_SAMPLE === 10);

// --- 거래 없음 ---
console.log('\n[describeDong: 거래 없음]');
const r5 = describeDong(dong({}), YEAR);
assertEqual('total 0', r5.total, 0);
assertEqual('태그 없음', r5.tags, []);
assert('거래 없음 안내', r5.summary.includes('거래가 없'));

// --- 결측 필드 방어 ---
console.log('\n[describeDong: 면적·준공년도 결측]');
const r6 = describeDong(dong({ jeonseCount: 20, wolseCount: 30, areaAvg: 0, buildYearAvg: 0 }), YEAR);
assert('결측이어도 오류 없이 요약', r6.summary.length > 0);
assert('면적 태그 없음', !r6.tags.some((t) => t.includes('집')));

// --- buildReport 정렬·필터 ---
console.log('\n[buildReport]');
const report = buildReport([
  dong({ dong: '가동', jeonseCount: 5, wolseCount: 5, areaAvg: 30, buildYearAvg: 2000 }),
  dong({ dong: '나동', jeonseCount: 40, wolseCount: 60, areaAvg: 30, buildYearAvg: 2000 }),
  dong({ dong: '다동' }), // 거래 0 → 제외
], YEAR);
assertEqual('거래 없는 동 제외', report.length, 2);
assertEqual('거래 많은 순', report.map((r) => r.dong), ['나동', '가동']);
assert('원본 필드 유지', report[0].areaAvg === 30);
assertEqual('빈 입력', buildReport(null), []);

console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
