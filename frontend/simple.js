/**
 * 간단검색 — 한 번에 한 질문씩 답하고, 마지막에 결과만 보는 단계형 흐름.
 *
 * 실거래 검색(index.html)이 여러 조건을 한 화면에 펼쳐놓는 방식이라면,
 * 여기는 질문을 하나씩 던져 선택을 쌓아간다. 살 곳을 아직 못 정한 사용자를 위한 입구.
 * 판정은 match.js의 순수함수가 담당하고, 저장된 통계만 읽어 공공 API를 쓰지 않는다.
 */

const state = {
  districts: null,      // /api/prices?by=district (한 번만 로드)
  rentType: null,
  deposit: null,
  monthlyRent: undefined,
  region: '',
  stepIndex: 0,
};

/** 월세를 고르면 월세 예산 질문이 하나 더 붙는다 */
function steps() {
  return state.rentType === '월세'
    ? ['rentType', 'deposit', 'rent', 'region']
    : ['rentType', 'deposit', 'region'];
}

const currentStep = () => steps()[state.stepIndex];

/* ── 유틸 (사이트 전체 표기 규칙과 동일) ───────── */
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtAmount(won) {
  if (!won) return '-';
  const eok = Math.floor(won / 10000);
  const man = won % 10000;
  const parts = [];
  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  return parts.join(' ') + '원';
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = `status-msg${isError ? ' error' : ''}`;
}
function clearStatus() {
  document.getElementById('status-msg').className = 'status-msg hidden';
}

/* ── 화면 전환 ────────────────────────────────── */
function renderStep() {
  const list = steps();
  const key = list[state.stepIndex];

  document.querySelectorAll('.wizard-step').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.step !== key);
  });

  // 진행 표시
  const pct = ((state.stepIndex + 1) / list.length) * 100;
  document.getElementById('wizard-bar-fill').style.width = `${pct}%`;
  document.getElementById('wizard-count').textContent = `${state.stepIndex + 1} / ${list.length}`;

  // 선택형(전월세·지역)은 누르면 바로 넘어가므로 '다음' 버튼이 필요 없다
  const needsNext = key === 'deposit' || key === 'rent';
  document.getElementById('wizard-next').classList.toggle('hidden', !needsNext);
  document.getElementById('wizard-back').classList.toggle('hidden', state.stepIndex === 0);

  if (key === 'deposit') {
    const el = document.getElementById('deposit-input');
    el.value = state.deposit ?? '';
    updateDepositPreview();
    el.focus();
  }
  if (key === 'rent') {
    const el = document.getElementById('rent-input');
    el.value = state.monthlyRent ?? '';
    updateRentPreview();
    el.focus();
  }
}

function goNext() {
  const key = currentStep();

  // 입력형 단계는 값 검증 후에만 진행
  if (key === 'deposit') {
    const v = parseInt(document.getElementById('deposit-input').value, 10);
    if (isNaN(v) || v <= 0) {
      setStatus('보증금 예산을 입력해 주세요.', true);
      return;
    }
    state.deposit = v;
    clearStatus();
  }
  if (key === 'rent') {
    const raw = document.getElementById('rent-input').value;
    const v = parseInt(raw, 10);
    state.monthlyRent = raw === '' || isNaN(v) ? undefined : v;
    clearStatus();
  }

  if (state.stepIndex >= steps().length - 1) {
    finish();
    return;
  }
  state.stepIndex++;
  renderStep();
}

function goBack() {
  if (state.stepIndex === 0) return;
  state.stepIndex--;
  clearStatus();
  renderStep();
}

/* ── 미리보기 ─────────────────────────────────── */
function updateDepositPreview() {
  const v = parseInt(document.getElementById('deposit-input').value, 10);
  document.getElementById('deposit-preview').textContent =
    isNaN(v) || v <= 0 ? '금액을 입력해 주세요' : fmtAmount(v);
}

function updateRentPreview() {
  const raw = document.getElementById('rent-input').value;
  const v = parseInt(raw, 10);
  document.getElementById('rent-preview').textContent =
    raw === '' || isNaN(v) ? '비워두면 보증금만 보고 찾습니다' : `매달 ${fmtAmount(v)}`;
}

/* ── 결과 ─────────────────────────────────────── */
async function loadDistricts() {
  if (state.districts) return state.districts;
  const res = await fetch('/api/prices?by=district');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `시세 조회 실패 (${res.status})`);
  state.districts = body.districts ?? [];
  return state.districts;
}

function conditionText() {
  const regionName = { '': '수도권 전체', seoul: '서울', gyeonggi: '경기', incheon: '인천' }[state.region];
  const money = state.rentType === '전세'
    ? `보증금 ${fmtAmount(state.deposit)}`
    : `보증금 ${fmtAmount(state.deposit)}${state.monthlyRent != null ? ` · 월세 ${fmtAmount(state.monthlyRent)}` : ''}`;
  return `${regionName} · ${state.rentType} · ${money}`;
}

function priceLineOf(m, isJeonse) {
  return isJeonse
    ? `평균 보증금 <strong>${fmtAmount(m.avgDeposit)}</strong>`
    : `평균 보증금 <strong>${fmtAmount(m.avgDeposit)}</strong> · 월세 <strong>${fmtAmount(m.avgRent)}</strong>`;
}

function renderMatches(matches, isJeonse) {
  document.getElementById('result-list').innerHTML = matches
    .map((m) => `
      <div class="match-card">
        <div class="match-head">
          <span class="match-name">${esc(m.name)}</span>
          <span class="badge badge-prop">${m.count.toLocaleString()}건</span>
        </div>
        <div class="match-price">${priceLineOf(m, isJeonse)}</div>
        ${m.depositGap > 0 ? `<span class="match-gap">예산보다 ${fmtAmount(m.depositGap)} 여유</span>` : ''}
        <div class="row-actions match-actions">
          <a class="action-btn" href="index.html?district=${encodeURIComponent(m.code)}">실거래 보기</a>
          <a class="action-btn" href="today.html">지도에서 보기</a>
        </div>
      </div>`)
    .join('');
}

function renderNearMisses(near, isJeonse) {
  document.getElementById('result-list').innerHTML =
    `<p class="modal-msg">예산에 맞는 지역을 찾지 못했습니다. 조금 더 올리면 아래 지역이 가능합니다.</p>` +
    near
      .map((m) => `
        <div class="match-card near">
          <div class="match-head">
            <span class="match-name">${esc(m.name)}</span>
            <span class="badge badge-prop">${m.count.toLocaleString()}건</span>
          </div>
          <div class="match-price">${priceLineOf(m, isJeonse)}</div>
          <span class="match-gap short">보증금 ${fmtAmount(m.avgDeposit - state.deposit)} 부족</span>
        </div>`)
      .join('');
}

async function finish() {
  const criteria = {
    rentType: state.rentType,
    deposit: state.deposit,
    monthlyRent: state.monthlyRent,
    region: state.region || undefined,
  };
  setStatus('찾는 중…');

  try {
    const districts = await loadDistricts();
    const matches = matchDistricts(districts, criteria);
    const isJeonse = criteria.rentType === '전세';

    clearStatus();
    // 질문은 감추고 결과만 남긴다
    document.getElementById('wizard').classList.add('hidden');
    document.getElementById('result-section').classList.remove('hidden');
    document.getElementById('result-condition').textContent = conditionText();

    if (matches.length > 0) {
      document.getElementById('result-title').textContent = `갈 수 있는 지역 ${matches.length}곳`;
      document.getElementById('result-note').textContent =
        '빌라·단독 최근 3개월 평균이 예산 안에 드는 지역입니다. 평균이므로 실제 매물은 더 비싸거나 쌀 수 있습니다.';
      renderMatches(matches, isJeonse);
    } else {
      document.getElementById('result-title').textContent = '조건에 맞는 지역이 없습니다';
      document.getElementById('result-note').textContent = '';
      renderNearMisses(nearMisses(districts, criteria), isJeonse);
    }

    Analytics.track('simple_search', {
      rent_type: criteria.rentType,
      deposit: criteria.deposit,
      monthly_rent: criteria.monthlyRent ?? null,
      region: criteria.region ?? 'all',
      match_count: matches.length,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    setStatus(err.message, true);
  }
}

function restart() {
  state.stepIndex = 0;
  document.getElementById('result-section').classList.add('hidden');
  document.getElementById('wizard').classList.remove('hidden');
  clearStatus();
  renderStep();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── 이벤트 ───────────────────────────────────── */
// 선택형 질문: 고르는 즉시 다음 단계로
document.querySelectorAll('[data-step="rentType"] .wizard-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.rentType = btn.dataset.value;
    if (state.rentType === '전세') state.monthlyRent = undefined; // 이전 선택 잔재 제거
    goNext();
  });
});

document.querySelectorAll('[data-step="region"] .wizard-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.region = btn.dataset.value;
    goNext(); // 마지막 단계 → 결과
  });
});

// 빠른 금액 선택
document.querySelectorAll('#deposit-quick .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('deposit-input').value = btn.dataset.value;
    updateDepositPreview();
  });
});
document.querySelectorAll('#rent-quick .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('rent-input').value = btn.dataset.value;
    updateRentPreview();
  });
});

document.getElementById('deposit-input').addEventListener('input', updateDepositPreview);
document.getElementById('rent-input').addEventListener('input', updateRentPreview);

// 입력 후 엔터로 바로 다음
['deposit-input', 'rent-input'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goNext();
  });
});

document.getElementById('wizard-next').addEventListener('click', goNext);
document.getElementById('wizard-back').addEventListener('click', goBack);
document.getElementById('restart-btn').addEventListener('click', restart);

renderStep();
Analytics.track('simple_search_view');
