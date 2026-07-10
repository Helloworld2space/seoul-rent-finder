// node tests/normalize.test.js
const { normalize, normalizeAll, parseAmount } = require('../backend/normalize');

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

// --- parseAmount ---
console.log('\n[parseAmount]');
assertEqual('숫자 그대로', parseAmount(30000), 30000);
assertEqual('"20,000" → 20000', parseAmount('20,000'), 20000);
assertEqual('"0" → 0', parseAmount('0'), 0);
assertEqual('빈 문자열 → 0', parseAmount(''), 0);

// --- normalize: 전세 ---
console.log('\n[normalize: 전세]');
const jeonseItem = {
  보증금액: '50,000',
  월세금액: '0',
  전용면적: '84.99',
  층: '7',
  건축년도: '2010',
  년: '2024',
  월: '3',
  일: '5',
  법정동: '역삼동',
  아파트: '래미안역삼',
  계약구분: '신규',
};
const jeonse = normalize(jeonseItem, '11680');
assert('결과 존재', jeonse !== null);
assertEqual('district', jeonse?.district, '강남구');
assertEqual('dong', jeonse?.dong, '역삼동');
assertEqual('aptName', jeonse?.aptName, '래미안역삼');
assertEqual('rentType', jeonse?.rentType, '전세');
assertEqual('deposit', jeonse?.deposit, 50000);
assertEqual('monthlyRent', jeonse?.monthlyRent, 0);
assertEqual('area', jeonse?.area, 84.99);
assertEqual('pyeong', jeonse?.pyeong, 25.7);
assertEqual('floor', jeonse?.floor, 7);
assertEqual('buildYear', jeonse?.buildYear, 2010);
assertEqual('dealDate', jeonse?.dealDate, '2024-03-05');
assertEqual('contractType', jeonse?.contractType, '신규');

// --- normalize: 월세 ---
console.log('\n[normalize: 월세]');
const wolseItem = {
  보증금액: '5,000',
  월세금액: '150',
  전용면적: '59.5',
  층: '3',
  건축년도: '2005',
  년: '2024',
  월: '11',
  일: '20',
  법정동: '서초동',
  아파트: '반포자이',
};
const wolse = normalize(wolseItem, '11650');
assert('결과 존재', wolse !== null);
assertEqual('district', wolse?.district, '서초구');
assertEqual('rentType', wolse?.rentType, '월세');
assertEqual('deposit', wolse?.deposit, 5000);
assertEqual('monthlyRent', wolse?.monthlyRent, 150);
assertEqual('contractType 없음', wolse?.contractType, undefined);

// --- normalize: 갱신 계약 ---
console.log('\n[normalize: 갱신]');
const galItem = { ...jeonseItem, 계약구분: '갱신' };
const gal = normalize(galItem, '11680');
assertEqual('contractType 갱신', gal?.contractType, '갱신');

// --- normalize: 불량 데이터 → null ---
console.log('\n[normalize: 불량 데이터]');
assert('아파트명 없음 → null', normalize({ 보증금액: '1000', 전용면적: '60', 월세금액: '0' }, '11680') === null);
assert('면적 0 → null', normalize({ 아파트: '테스트', 보증금액: '1000', 전용면적: '0', 월세금액: '0' }, '11680') === null);

// --- normalizeAll ---
console.log('\n[normalizeAll]');
const mixed = [jeonseItem, { 아파트: '', 보증금액: '100', 전용면적: '0', 월세금액: '0' }, wolseItem];
const all = normalizeAll(mixed, '11680');
assertEqual('유효한 2건만 반환', all.length, 2);

// --- 주거 유형: apt 기본값 ---
console.log('\n[propertyType]');
assertEqual('기본 apt → 아파트', jeonse?.propertyType, '아파트');

// --- 주거 유형: rh (연립다세대, 영문 필드) ---
const rhItem = {
  deposit: '20,000',
  monthlyRent: '0',
  excluUseAr: '45.5',
  floor: '2',
  buildYear: '1998',
  dealYear: '2026',
  dealMonth: '6',
  dealDay: '10',
  umdNm: '역삼동',
  mhouseNm: '역삼빌라',
};
const rh = normalize(rhItem, '11680', 'rh');
assert('rh 결과 존재', rh !== null);
assertEqual('rh propertyType', rh?.propertyType, '연립다세대');
assertEqual('rh 건물명(mhouseNm)', rh?.aptName, '역삼빌라');
assertEqual('rh dong(umdNm 흡수)', rh?.dong, '역삼동');

// --- 주거 유형: sh (단독다가구 — 건물명·층 없음, 계약면적) ---
const shItem = {
  deposit: '5,000',
  monthlyRent: '50',
  totalFloorAr: '80.5',
  buildYear: '1995',
  dealYear: '2026',
  dealMonth: '6',
  dealDay: '15',
  umdNm: '성산동',
};
const sh = normalize(shItem, '11440', 'sh');
assert('sh 결과 존재 (건물명 없어도 통과)', sh !== null);
assertEqual('sh propertyType', sh?.propertyType, '단독다가구');
assertEqual('sh 건물명 대체 표기', sh?.aptName, '단독/다가구');
assertEqual('sh 면적(totalFloorAr)', sh?.area, 80.5);
assertEqual('sh 층 0', sh?.floor, 0);

// --- 주거 유형: offi (오피스텔) ---
const offiItem = {
  deposit: '1,000',
  monthlyRent: '80',
  excluUseAr: '28.1',
  floor: '11',
  buildYear: '2018',
  dealYear: '2026',
  dealMonth: '6',
  dealDay: '20',
  umdNm: '가산동',
  offiNm: '가산센트럴오피스텔',
};
const offi = normalize(offiItem, '11545', 'offi');
assert('offi 결과 존재', offi !== null);
assertEqual('offi propertyType', offi?.propertyType, '오피스텔');
assertEqual('offi 건물명(offiNm)', offi?.aptName, '가산센트럴오피스텔');

// --- 수도권 district 매핑 ---
console.log('\n[수도권 district]');
const gyeonggi = normalize({ ...jeonseItem }, '41135');
assertEqual('경기 코드 → 성남시 분당구', gyeonggi?.district, '성남시 분당구');
const incheon = normalize({ ...jeonseItem }, '28290');
assertEqual('인천 코드 → 인천 검단구', incheon?.district, '인천 검단구');

// --- 결과 ---
console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
