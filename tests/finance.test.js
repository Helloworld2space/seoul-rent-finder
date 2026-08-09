// node tests/finance.test.js
const {
  depositToMonthly, monthlyToDeposit, monthlyInterest,
  compareJeonseWolse, loanFeasibility, LEGAL_CONVERSION_CAP,
} = require('../frontend/finance');

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

// --- 법정 상한 ---
console.log('\n[법정 전환율 상한]');
assertEqual('기준금리 2.5% + 2% = 4.5%', LEGAL_CONVERSION_CAP, 4.5);

// --- 보증금 ↔ 월세 전환 ---
console.log('\n[전월세 전환]');
// 1억(10,000만원)을 4.5%로 → 연 450만원 → 월 37.5만원
assertEqual('1억 · 4.5% → 월 37.5만원', depositToMonthly(10000, 4.5), 37.5);
assertEqual('5천만 · 6% → 월 25만원', depositToMonthly(5000, 6), 25);
assertEqual('역산: 월 37.5 · 4.5% → 1억', monthlyToDeposit(37.5, 4.5), 10000);
assertEqual('0원 입력 → 0', depositToMonthly(0, 4.5), 0);
assertEqual('전환율 0 → 0 (0나누기 방지)', monthlyToDeposit(50, 0), 0);

// --- 대출 이자 ---
console.log('\n[대출 이자]');
// 1억을 연 3%로 → 연 300만원 → 월 25만원
assertEqual('1억 · 3% → 월 25만원', monthlyInterest(10000, 3), 25);
assertEqual('대출 0 → 이자 0', monthlyInterest(0, 3), 0);

// --- 전세 vs 월세 비교 ---
console.log('\n[전세 vs 월세]');
// 전세 2억, 자기자금 5천 → 대출 1.5억, 연 3% → 월 이자 37.5만
// 월세: 보증금 1천(자기자금으로 충당) + 월세 60만
// 기회비용 0으로 두면 전세 37.5 vs 월세 60 → 전세가 저렴
const c1 = compareJeonseWolse({
  jeonseDeposit: 20000, ownFunds: 5000, loanRate: 3,
  wolseDeposit: 1000, wolseMonthly: 60, savingsRate: 0,
});
assertEqual('전세 대출액 1.5억', c1.jeonse.loan, 15000);
assertEqual('전세 월 이자 37.5만', c1.jeonse.interest, 37.5);
assertEqual('전세 월 부담 37.5만', c1.jeonse.monthlyTotal, 37.5);
assertEqual('월세 월 부담 60만', c1.wolse.monthlyTotal, 60);
assertEqual('전세가 저렴', c1.cheaper, '전세');
assertEqual('차액 22.5만', c1.diff, 22.5);

// 기회비용을 넣으면 전세 쪽 부담이 커진다 (자기자금이 묶이므로)
const c2 = compareJeonseWolse({
  jeonseDeposit: 20000, ownFunds: 5000, loanRate: 3,
  wolseDeposit: 1000, wolseMonthly: 60, savingsRate: 3.6,
});
// 전세: 이자 37.5 + 자기자금 5000의 기회비용 15 = 52.5
// 월세: 60 + 보증금 1000의 기회비용 3 = 63
assertEqual('전세 기회비용 15만', c2.jeonse.opportunity, 15);
assertEqual('전세 월 부담 52.5만', c2.jeonse.monthlyTotal, 52.5);
assertEqual('월세 월 부담 63만', c2.wolse.monthlyTotal, 63);
assert('기회비용 반영 시 전세 부담 증가', c2.jeonse.monthlyTotal > c1.jeonse.monthlyTotal);

// 자기자금이 충분하면 대출이 없다
const c3 = compareJeonseWolse({
  jeonseDeposit: 10000, ownFunds: 20000, loanRate: 3,
  wolseDeposit: 1000, wolseMonthly: 50, savingsRate: 0,
});
assertEqual('자기자금 충분 → 대출 0', c3.jeonse.loan, 0);
assertEqual('이자 0 → 월 부담 0', c3.jeonse.monthlyTotal, 0);

// 월세 보증금이 자기자금보다 크면 월세 쪽도 대출이 잡힌다
const c4 = compareJeonseWolse({
  jeonseDeposit: 30000, ownFunds: 500, loanRate: 4,
  wolseDeposit: 3000, wolseMonthly: 40, savingsRate: 0,
});
assertEqual('월세 보증금 부족분 대출 2,500만', c4.wolse.loan, 2500);
assert('월세 부담에 이자 포함', c4.wolse.monthlyTotal > 40);

// --- 대출 한도 ---
console.log('\n[대출 한도]');
// 보증금 2억, 자기자금 3천 → 필요 1.7억. 한도: 80% = 1.6억 vs 최대 2억 → 1.6억
const f1 = loanFeasibility(20000, 3000, 80, 20000);
assertEqual('한도 1.6억 (80% 적용)', f1.limit, 16000);
assertEqual('필요 1.7억', f1.needed, 17000);
assertEqual('부족', f1.enough, false);
assertEqual('1천만원 모자람', f1.shortfall, 1000);

// 보증금 3억 → 80%면 2.4억이지만 절대 한도 2억에 걸린다
const f2 = loanFeasibility(30000, 5000, 80, 20000);
assertEqual('절대 한도 2억 적용', f2.limit, 20000);

const f3 = loanFeasibility(10000, 5000, 80, 20000);
assertEqual('자기자금 충분 → 가능', f3.enough, true);
assertEqual('부족액 0', f3.shortfall, 0);

console.log(`\n결과: ${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exit(1);
