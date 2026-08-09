/**
 * 전월세 계산 — 순수함수.
 * 브라우저(calc.html)와 Node(tests/) 양쪽에서 쓴다.
 *
 * 핵심 관점: 전세는 "월세를 안 내는 것"이 아니라 **대출이자 + 기회비용**을 내는 것이다.
 * 그래서 두 방식을 같은 잣대(월 실부담)로 놓고 비교해야 답이 나온다.
 *
 * 금액 단위는 앱 전체와 같이 **만원**, 이율은 **연 %**.
 */

/**
 * 법정 전월세전환율 상한 (주택임대차보호법 시행령 제9조).
 * min(연 10%, 한국은행 기준금리 + 2%).
 * ※ 기준금리가 바뀌면 이 값도 바뀐다 — 화면에 기준일을 함께 표기할 것.
 */
const BASE_RATE = 2.5;              // 한국은행 기준금리 (2026-08 기준)
const LEGAL_CAP_ADD = 2.0;          // 시행령상 가산율
const LEGAL_CAP_MAX = 10.0;         // 시행령상 절대 상한
const LEGAL_CONVERSION_CAP = Math.min(LEGAL_CAP_MAX, BASE_RATE + LEGAL_CAP_ADD); // = 4.5

/**
 * 보증금을 월세로 환산한다.
 *   월세 = 보증금 × 전환율 ÷ 12
 * @param {number} deposit  전환할 보증금 (만원)
 * @param {number} rate     연 전환율 (%)
 * @returns {number} 월세 (만원, 소수 첫째자리 반올림)
 */
function depositToMonthly(deposit, rate) {
  if (!(deposit > 0) || !(rate > 0)) return 0;
  return Math.round(((deposit * (rate / 100)) / 12) * 10) / 10;
}

/**
 * 월세를 보증금으로 환산한다 (위의 역산).
 * @returns {number} 보증금 (만원, 정수 반올림)
 */
function monthlyToDeposit(monthly, rate) {
  if (!(monthly > 0) || !(rate > 0)) return 0;
  return Math.round((monthly * 12) / (rate / 100));
}

/**
 * 전세대출의 월 이자 (거치식 — 원금은 만기 상환이 일반적).
 * @param {number} loan  대출 원금 (만원)
 * @param {number} rate  연 금리 (%)
 * @returns {number} 월 이자 (만원, 소수 첫째자리)
 */
function monthlyInterest(loan, rate) {
  if (!(loan > 0) || !(rate > 0)) return 0;
  return Math.round(((loan * (rate / 100)) / 12) * 10) / 10;
}

/**
 * 전세 vs 월세를 **월 실부담**으로 비교한다.
 *
 * 전세 월 부담 = 대출이자 + 자기자금의 기회비용
 *   (자기자금을 예금에 뒀다면 받을 이자를 포기하는 셈이므로 비용으로 본다)
 * 월세 월 부담 = 월세 + 보증금의 기회비용
 *
 * @param {object} p
 *   @param {number} p.jeonseDeposit   전세 보증금 (만원)
 *   @param {number} p.ownFunds        보유 자기자금 (만원)
 *   @param {number} p.loanRate        전세대출 금리 (연 %)
 *   @param {number} p.wolseDeposit    월세 보증금 (만원)
 *   @param {number} p.wolseMonthly    월세 (만원)
 *   @param {number} [p.savingsRate]   예금 금리 (연 %) — 기회비용 계산용
 * @returns {{
 *   jeonse: {loan, interest, opportunity, monthlyTotal, shortfall},
 *   wolse:  {opportunity, monthlyTotal},
 *   diff: number, cheaper: '전세'|'월세'|'같음'
 * }}
 */
function compareJeonseWolse(p) {
  const savingsRate = p.savingsRate ?? 0;

  // 전세: 자기자금으로 모자란 만큼 대출
  const loan = Math.max(0, p.jeonseDeposit - p.ownFunds);
  const interest = monthlyInterest(loan, p.loanRate);
  // 전세에 묶이는 자기자금 (보증금을 못 넘는다)
  const jeonseOwn = Math.min(p.ownFunds, p.jeonseDeposit);
  const jeonseOpportunity = monthlyInterest(jeonseOwn, savingsRate);

  // 월세: 보증금만 묶이고 나머지 자기자금은 예금에 남는다고 본다
  const wolseOwn = Math.min(p.ownFunds, p.wolseDeposit);
  const wolseLoan = Math.max(0, p.wolseDeposit - p.ownFunds);
  const wolseInterest = monthlyInterest(wolseLoan, p.loanRate);
  const wolseOpportunity = monthlyInterest(wolseOwn, savingsRate);

  const jeonseTotal = Math.round((interest + jeonseOpportunity) * 10) / 10;
  const wolseTotal = Math.round((p.wolseMonthly + wolseInterest + wolseOpportunity) * 10) / 10;
  const diff = Math.round((jeonseTotal - wolseTotal) * 10) / 10;

  return {
    // 대출 한도로 실제 감당 가능한지는 loanFeasibility가 따로 판정한다
    jeonse: {
      loan,
      interest,
      opportunity: jeonseOpportunity,
      monthlyTotal: jeonseTotal,
    },
    wolse: {
      loan: wolseLoan,
      interest: wolseInterest,
      opportunity: wolseOpportunity,
      monthlyTotal: wolseTotal,
    },
    diff: Math.abs(diff),
    cheaper: diff === 0 ? '같음' : diff < 0 ? '전세' : '월세',
  };
}

/**
 * 전세대출 한도 확인 — 보증금 대비 비율과 절대 한도 중 작은 값.
 * @param {number} deposit  보증금 (만원)
 * @param {number} ratio    보증금 대비 최대 비율 (%) 예: 80
 * @param {number} maxLoan  절대 한도 (만원) 예: 20000
 * @returns {{limit: number, needed: number, enough: boolean, shortfall: number}}
 */
function loanFeasibility(deposit, ownFunds, ratio, maxLoan) {
  const limit = Math.min(Math.floor((deposit * ratio) / 100), maxLoan);
  const needed = Math.max(0, deposit - ownFunds);
  return {
    limit,
    needed,
    enough: needed <= limit,
    shortfall: Math.max(0, needed - limit),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    depositToMonthly, monthlyToDeposit, monthlyInterest,
    compareJeonseWolse, loanFeasibility,
    LEGAL_CONVERSION_CAP, BASE_RATE,
  };
}
