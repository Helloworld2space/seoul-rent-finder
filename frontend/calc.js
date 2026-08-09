/**
 * 전월세 계산기 — 입력이 바뀔 때마다 즉시 다시 계산한다(버튼 없음).
 * 계산은 finance.js의 순수함수가 맡고, 여기서는 읽고 그리기만 한다.
 */

const state = { tab: 'compare', convertDir: 'toMonthly' };

/* ── 유틸 (앱 전체 표기 규칙과 동일) ───────────── */
function fmtAmount(won) {
  if (!won) return '0원';
  const rounded = Math.round(won);
  const eok = Math.floor(rounded / 10000);
  const man = rounded % 10000;
  const parts = [];
  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  return parts.join(' ') + '원';
}

/** 월 단위 금액은 만원 소수까지 보여준다 (37.5만원) */
function fmtMonthly(man) {
  if (!man) return '0원';
  const v = Math.round(man * 10) / 10;
  return `${v.toLocaleString()}만원`;
}

const num = (id) => {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) ? 0 : v;
};

/* ── 전세 vs 월세 비교 ────────────────────────── */
function renderCompare() {
  const p = {
    jeonseDeposit: num('jeonse-deposit'),
    ownFunds: num('own-funds'),
    loanRate: num('loan-rate'),
    wolseDeposit: num('wolse-deposit'),
    wolseMonthly: num('wolse-monthly'),
    savingsRate: num('savings-rate'),
  };
  const el = document.getElementById('compare-result');

  if (p.jeonseDeposit <= 0 && p.wolseMonthly <= 0) {
    el.innerHTML = '<p class="calc-empty">보증금과 월세를 입력하면 비교 결과가 나옵니다.</p>';
    return;
  }

  const r = compareJeonseWolse(p);
  const 유리 = r.cheaper;
  const verdict = 유리 === '같음'
    ? '두 방식의 월 부담이 <strong>같습니다</strong>.'
    : `<strong>${유리}</strong>가 월 <strong>${fmtMonthly(r.diff)}</strong> 저렴합니다. <span class="calc-year">(1년이면 ${fmtMonthly(r.diff * 12)})</span>`;

  // 청년 버팀목 기준(보증금 80%·최대 2억)으로 대출이 가능한지 함께 알려준다
  const feas = loanFeasibility(p.jeonseDeposit, p.ownFunds, 80, 20000);
  const feasNote = r.jeonse.loan > 0 && !feas.enough
    ? `<p class="calc-warn">⚠ 전세대출 한도(보증금의 80%·최대 2억 기준)로는
        <strong>${fmtAmount(feas.shortfall)}</strong>이 모자랍니다. 상품·조건에 따라 달라질 수 있습니다.</p>`
    : '';

  el.innerHTML = `
    <div class="calc-verdict">${verdict}</div>
    <div class="calc-compare">
      <div class="calc-card ${유리 === '전세' ? 'win' : ''}">
        <div class="calc-card-head">전세</div>
        <div class="calc-total">${fmtMonthly(r.jeonse.monthlyTotal)}<span>/월</span></div>
        <ul class="calc-breakdown">
          <li>대출 ${fmtAmount(r.jeonse.loan)}</li>
          <li>대출이자 ${fmtMonthly(r.jeonse.interest)}</li>
          ${r.jeonse.opportunity > 0 ? `<li>묶인 돈의 기회비용 ${fmtMonthly(r.jeonse.opportunity)}</li>` : ''}
        </ul>
      </div>
      <div class="calc-card ${유리 === '월세' ? 'win' : ''}">
        <div class="calc-card-head">월세</div>
        <div class="calc-total">${fmtMonthly(r.wolse.monthlyTotal)}<span>/월</span></div>
        <ul class="calc-breakdown">
          <li>월세 ${fmtMonthly(p.wolseMonthly)}</li>
          ${r.wolse.loan > 0 ? `<li>보증금 대출 ${fmtAmount(r.wolse.loan)} · 이자 ${fmtMonthly(r.wolse.interest)}</li>` : ''}
          ${r.wolse.opportunity > 0 ? `<li>묶인 돈의 기회비용 ${fmtMonthly(r.wolse.opportunity)}</li>` : ''}
        </ul>
      </div>
    </div>
    ${feasNote}
    <p class="calc-note">
      전세는 만기에 보증금을 돌려받으므로 월 부담에 원금은 넣지 않았습니다.
      중개보수·이사비 등 일회성 비용과 전세보증금 미반환 위험은 별도로 고려하세요.
    </p>`;
}

/* ── 보증금 ↔ 월세 전환 ───────────────────────── */
function renderConvert() {
  const amount = num('convert-amount');
  const rate = num('convert-rate');
  const el = document.getElementById('convert-result');

  if (amount <= 0 || rate <= 0) {
    el.innerHTML = '<p class="calc-empty">금액과 전환율을 입력하면 결과가 나옵니다.</p>';
    return;
  }

  if (state.convertDir === 'toMonthly') {
    const monthly = depositToMonthly(amount, rate);
    el.innerHTML = `
      <div class="calc-verdict">
        보증금 <strong>${fmtAmount(amount)}</strong>을 월세로 바꾸면
        월 <strong>${fmtMonthly(monthly)}</strong>입니다.
      </div>
      <p class="calc-note">연 ${rate}% 기준 · 1년이면 ${fmtMonthly(monthly * 12)}</p>`;
  } else {
    const deposit = monthlyToDeposit(amount, rate);
    el.innerHTML = `
      <div class="calc-verdict">
        월세 <strong>${fmtMonthly(amount)}</strong>을 보증금으로 바꾸면
        <strong>${fmtAmount(deposit)}</strong>입니다.
      </div>
      <p class="calc-note">연 ${rate}% 기준</p>`;
  }

  // 법정 상한을 넘는 전환율이면 알려준다 (세입자에게 불리한 조건일 수 있음)
  const note = document.getElementById('legal-note');
  note.innerHTML = rate > LEGAL_CONVERSION_CAP
    ? `⚠ 입력한 전환율 ${rate}%는 <strong>법정 상한 ${LEGAL_CONVERSION_CAP}%</strong>를 넘습니다.
       기존 계약의 보증금을 월세로 바꿀 때는 상한이 적용됩니다(신규 계약에는 적용되지 않습니다).`
    : `법정 전환율 상한은 <strong>연 ${LEGAL_CONVERSION_CAP}%</strong>입니다
       (기준금리 ${BASE_RATE}% + 2%, 2026년 8월 기준). 기존 계약의 전환에 적용됩니다.`;
}

function render() {
  if (state.tab === 'compare') renderCompare();
  else renderConvert();
}

/* ── 이벤트 ───────────────────────────────────── */
document.querySelectorAll('#calc-tabs .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#calc-tabs .chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.tab = btn.dataset.tab;
    document.querySelectorAll('.calc-panel').forEach((p) => {
      p.classList.toggle('hidden', p.dataset.panel !== state.tab);
    });
    render();
    Analytics.track('calc_tab', { tab: state.tab });
  });
});

document.querySelectorAll('#rate-presets .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('loan-rate').value = btn.dataset.rate;
    render();
    Analytics.track('calc_rate_preset', { rate: btn.dataset.rate });
  });
});

document.querySelectorAll('#convert-dir .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#convert-dir .chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.convertDir = btn.dataset.dir;
    // 방향에 따라 입력 의미가 달라지므로 라벨과 기본값을 함께 바꾼다
    const toMonthly = state.convertDir === 'toMonthly';
    document.getElementById('convert-input-label').innerHTML = toMonthly
      ? '전환할 보증금 <span class="hint">(만원)</span>'
      : '전환할 월세 <span class="hint">(만원)</span>';
    document.getElementById('convert-amount').value = toMonthly ? 10000 : 50;
    render();
  });
});

// 입력이 바뀌면 즉시 재계산
['own-funds', 'loan-rate', 'jeonse-deposit', 'wolse-deposit', 'wolse-monthly',
 'savings-rate', 'convert-amount', 'convert-rate'].forEach((id) => {
  document.getElementById(id).addEventListener('input', render);
});

render();
Analytics.track('calc_view');
