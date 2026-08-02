/**
 * 간단검색 — 예산에서 출발해 갈 수 있는 지역을 찾는다.
 * 저장된 시세 통계(/api/prices?by=district)만 읽으므로 공공 API 쿼터를 쓰지 않는다.
 */

const state = {
  districts: null,   // 서버에서 받은 구 단위 시세 (한 번만 로드)
  rentType: '전세',
  region: '',
};

/* ── 유틸 (index.html과 표기 규칙 동일) ────────── */
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

/* ── 입력 ─────────────────────────────────────── */
function readCriteria() {
  const deposit = parseInt(document.getElementById('deposit-input').value, 10);
  const rentRaw = document.getElementById('rent-input').value;
  const monthlyRent = rentRaw === '' ? undefined : parseInt(rentRaw, 10);
  return {
    rentType: state.rentType,
    deposit: isNaN(deposit) ? null : deposit,
    monthlyRent: monthlyRent != null && isNaN(monthlyRent) ? undefined : monthlyRent,
    region: state.region || undefined,
  };
}

function updateDepositPreview() {
  const v = parseInt(document.getElementById('deposit-input').value, 10);
  document.getElementById('deposit-preview').textContent = isNaN(v) ? '' : fmtAmount(v);
}

/* ── 결과 렌더 ────────────────────────────────── */
function renderMatches(matches, criteria) {
  const list = document.getElementById('result-list');
  const isJeonse = criteria.rentType === '전세';

  list.innerHTML = matches
    .map((m) => {
      const priceLine = isJeonse
        ? `평균 보증금 <strong>${fmtAmount(m.avgDeposit)}</strong>`
        : `평균 보증금 <strong>${fmtAmount(m.avgDeposit)}</strong> · 월세 <strong>${fmtAmount(m.avgRent)}</strong>`;
      // 예산이 평균보다 얼마나 여유 있는지 — 선택의 폭을 가늠하는 단서
      const gap = m.depositGap > 0
        ? `<span class="match-gap">예산보다 ${fmtAmount(m.depositGap)} 여유</span>`
        : '';
      return `
        <div class="match-card">
          <div class="match-head">
            <span class="match-name">${esc(m.name)}</span>
            <span class="badge badge-prop">${m.count.toLocaleString()}건</span>
          </div>
          <div class="match-price">${priceLine}</div>
          ${gap}
          <div class="row-actions match-actions">
            <a class="action-btn" href="index.html?district=${encodeURIComponent(m.code)}">실거래 보기</a>
            <a class="action-btn" href="today.html">지도에서 보기</a>
          </div>
        </div>`;
    })
    .join('');
}

function renderNearMisses(near, criteria) {
  const list = document.getElementById('result-list');
  const isJeonse = criteria.rentType === '전세';
  list.innerHTML =
    `<p class="modal-msg">예산에 맞는 지역을 찾지 못했습니다. 조금 더 올리면 아래 지역이 가능합니다.</p>` +
    near
      .map((m) => {
        const short = m.avgDeposit - criteria.deposit;
        // 월세 조건으로 찾았다면 월세도 함께 보여줘야 비교가 된다
        const priceLine = isJeonse
          ? `평균 보증금 <strong>${fmtAmount(m.avgDeposit)}</strong>`
          : `평균 보증금 <strong>${fmtAmount(m.avgDeposit)}</strong> · 월세 <strong>${fmtAmount(m.avgRent)}</strong>`;
        return `
        <div class="match-card near">
          <div class="match-head">
            <span class="match-name">${esc(m.name)}</span>
            <span class="badge badge-prop">${m.count.toLocaleString()}건</span>
          </div>
          <div class="match-price">${priceLine}</div>
          <span class="match-gap short">보증금 ${fmtAmount(short)} 부족</span>
        </div>`;
      })
      .join('');
}

/* ── 조회 ─────────────────────────────────────── */
async function loadDistricts() {
  if (state.districts) return state.districts;
  const res = await fetch('/api/prices?by=district');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `시세 조회 실패 (${res.status})`);
  state.districts = body.districts ?? [];
  return state.districts;
}

async function find() {
  const criteria = readCriteria();
  if (criteria.deposit == null) {
    setStatus('보증금 예산을 입력해 주세요.', true);
    return;
  }

  const section = document.getElementById('result-section');
  const btn = document.getElementById('find-btn');
  btn.disabled = true;
  setStatus('찾는 중…');

  try {
    const districts = await loadDistricts();
    const matches = matchDistricts(districts, criteria);

    clearStatus();
    section.classList.remove('hidden');

    const label = criteria.rentType === '전세'
      ? `보증금 ${fmtAmount(criteria.deposit)}`
      : `보증금 ${fmtAmount(criteria.deposit)}${criteria.monthlyRent != null ? ` · 월세 ${fmtAmount(criteria.monthlyRent)}` : ''}`;

    if (matches.length > 0) {
      document.getElementById('result-title').textContent = `갈 수 있는 지역 ${matches.length}곳`;
      document.getElementById('result-note').textContent =
        `${label} 기준 · 빌라·단독 최근 3개월 평균이 예산 안에 드는 지역입니다. 평균이므로 실제 매물은 더 비싸거나 쌀 수 있습니다.`;
      renderMatches(matches, criteria);
    } else {
      document.getElementById('result-title').textContent = '조건에 맞는 지역이 없습니다';
      document.getElementById('result-note').textContent = `${label} 기준`;
      renderNearMisses(nearMisses(districts, criteria), criteria);
    }

    Analytics.track('simple_search', {
      rent_type: criteria.rentType,
      deposit: criteria.deposit,
      monthly_rent: criteria.monthlyRent ?? null,
      region: criteria.region ?? 'all',
      match_count: matches.length,
    });
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* ── 이벤트 ───────────────────────────────────── */
document.querySelectorAll('#rent-type-chips .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#rent-type-chips .chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.rentType = btn.dataset.rentType;
    // 월세일 때만 월세 예산 입력을 보여준다
    document.getElementById('rent-field').classList.toggle('hidden', state.rentType !== '월세');
  });
});

document.querySelectorAll('#region-chips .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#region-chips .chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.region = btn.dataset.region;
  });
});

document.querySelectorAll('#deposit-quick .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('deposit-input').value = btn.dataset.deposit;
    updateDepositPreview();
  });
});

document.getElementById('deposit-input').addEventListener('input', updateDepositPreview);
document.getElementById('find-btn').addEventListener('click', find);
document.getElementById('deposit-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') find();
});

Analytics.track('simple_search_view');
