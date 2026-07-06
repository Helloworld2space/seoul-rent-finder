// node tests/broker-normalize.test.js
const { normalizeBroker } = require('../backend/broker-client');

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

// --- normalizeBroker: 영업중 ---
console.log('\n[normalizeBroker: 영업중]');
const activeRow = {
  SYS_REG_NO: '117102019000057',
  SGG_CD: '11710',
  STDG_CD: '1171011400',
  CGG_CD: '송파구',
  LGL_DONG_NM: '마천동',
  ADDR: '서울특별시 송파구 마천로 339 1층(마천동)',
  MDT_BSNS_NM: '조성수',
  BZMN_CONM: '반석공인중개사사무소',
  TELNO: '02-407-6677',
  STTS_SE: '영업중',
};
const broker = normalizeBroker(activeRow);
assert('결과 존재', broker !== null);
assertEqual('name', broker?.name, '반석공인중개사사무소');
assertEqual('agentName', broker?.agentName, '조성수');
assertEqual('phone', broker?.phone, '02-407-6677');
assertEqual('address', broker?.address, '서울특별시 송파구 마천로 339 1층(마천동)');
assertEqual('sggCode', broker?.sggCode, '11710');
assertEqual('dong', broker?.dong, '마천동');

// --- normalizeBroker: 필터링 ---
console.log('\n[normalizeBroker: 필터링]');
assert('휴업/폐업 → null', normalizeBroker({ ...activeRow, STTS_SE: '폐업' }) === null);
assert('상호 없음 → null', normalizeBroker({ ...activeRow, BZMN_CONM: '' }) === null);
assert('빈 row → null', normalizeBroker({}) === null);

// --- normalizeBroker: 결측 필드 허용 ---
console.log('\n[normalizeBroker: 결측 허용]');
const sparse = normalizeBroker({ BZMN_CONM: '테스트공인', STTS_SE: '영업중' });
assert('상호+영업중만 있어도 결과 존재', sparse !== null);
assertEqual('phone 빈 문자열', sparse?.phone, '');
assertEqual('dong 빈 문자열', sparse?.dong, '');

// --- 결과 ---
console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
