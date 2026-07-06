/* ── 상태 ─────────────────────────────────────── */
const state = {
  rawDeals: [],       // 서버에서 받은 원본 전체
  filter: {
    rentType: '',     // '' | '전세' | '월세'
    depositMin: null,
    depositMax: null,
    areaMin: null,
    areaMax: null,
  },
  sort: 'dealDate-desc',
  page: 0,           // 렌더링된 페이지 수
};
const PAGE_SIZE = 100;

/* ── API ──────────────────────────────────────── */
async function fetchDistricts() {
  const res = await fetch('/api/districts');
  if (!res.ok) throw new Error('구 목록 조회 실패');
  return res.json();
}

async function fetchDeals(districtCodes, months) {
  const params = new URLSearchParams({ months: String(months) });
  if (districtCodes.length > 0) params.set('districts', districtCodes.join(','));
  const res = await fetch(`/api/search?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `서버 오류 (${res.status})`);
  }
  return res.json();
}

/* ── filterSort (순수함수) ────────────────────── */
function filterSort(deals, filter, sort) {
  let list = deals;

  if (filter.rentType) {
    list = list.filter((d) => d.rentType === filter.rentType);
  }
  if (filter.depositMin != null) {
    list = list.filter((d) => d.deposit >= filter.depositMin);
  }
  if (filter.depositMax != null) {
    list = list.filter((d) => d.deposit <= filter.depositMax);
  }
  if (filter.areaMin != null) {
    list = list.filter((d) => d.area >= filter.areaMin);
  }
  if (filter.areaMax != null) {
    list = list.filter((d) => d.area <= filter.areaMax);
  }

  const [key, dir] = sort.split('-');
  list = [...list].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'asc' ? cmp : -cmp;
  });

  return list;
}

/* ── 렌더: 자치구 칩 ──────────────────────────── */
let selectedDistricts = new Set();

function renderDistrictChips(districts) {
  const container = document.getElementById('district-chips');
  container.innerHTML = '';
  districts.forEach((d) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = d.name;
    btn.dataset.code = d.code;
    btn.addEventListener('click', () => {
      if (selectedDistricts.has(d.code)) {
        selectedDistricts.delete(d.code);
        btn.classList.remove('active');
      } else {
        selectedDistricts.add(d.code);
        btn.classList.add('active');
      }
    });
    container.appendChild(btn);
  });
}

/* ── 렌더: 결과 테이블 ────────────────────────── */
function renderResults(deals, append = false) {
  const tbody = document.getElementById('results-body');
  if (!append) tbody.innerHTML = '';

  deals.forEach((d) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(d.district)}</td>
      <td>${esc(d.dong)}</td>
      <td>${esc(d.aptName)}</td>
      <td><span class="badge ${d.rentType === '전세' ? 'badge-jeonse' : 'badge-wolse'}">${esc(d.rentType)}</span></td>
      <td class="amount">${fmtAmount(d.deposit)}</td>
      <td class="amount">${d.monthlyRent > 0 ? fmtAmount(d.monthlyRent) : '-'}</td>
      <td>${d.area}</td>
      <td>${d.pyeong}</td>
      <td>${d.floor}</td>
      <td>${d.buildYear || '-'}</td>
      <td>${esc(d.dealDate)}</td>
      <td>${d.contractType ? `<span class="badge ${d.contractType === '신규' ? 'badge-new' : 'badge-renew'}">${esc(d.contractType)}</span>` : '-'}</td>
    `;
    tr.appendChild(buildActionsCell(d));
    tbody.appendChild(tr);
  });
}

function buildActionsCell(d) {
  const td = document.createElement('td');
  td.className = 'row-actions';

  const mapLink = document.createElement('a');
  mapLink.className = 'action-btn';
  mapLink.textContent = '지도';
  mapLink.href = naverMapUrl(d);
  mapLink.target = '_blank';
  mapLink.rel = 'noopener';
  mapLink.title = '네이버 지도에서 단지 사진·거리뷰 보기';

  const brokerBtn = document.createElement('button');
  brokerBtn.className = 'action-btn';
  brokerBtn.textContent = '중개업소';
  brokerBtn.title = '근처 부동산 중개업소 연락처';
  brokerBtn.addEventListener('click', () => openBrokerModal(d));

  const twinLink = document.createElement('a');
  twinLink.className = 'action-btn';
  twinLink.textContent = '인테리어';
  twinLink.href = twinforgeUrl(d);
  twinLink.target = '_blank';
  twinLink.rel = 'noopener';
  twinLink.title = 'ROOM TWIN 3D에서 이 평수로 인테리어 해보기';

  td.append(mapLink, brokerBtn, twinLink);
  return td;
}

/* ── 외부 연계: 네이버 지도 / ROOM TWIN 3D ────── */
const TWINFORGE_URL = 'https://twinforge.vercel.app'; // ROOM TWIN 3D (로컬 개발 시 http://localhost:5173)

function naverMapUrl(d) {
  return `https://map.naver.com/p/search/${encodeURIComponent(`${d.district} ${d.dong} ${d.aptName}`)}`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** RentDeal → ROOM TWIN 3D share 딥링크. 전용면적을 4:3 방으로 환산 (한도 2~12m) */
function twinforgeUrl(d) {
  const w = clamp(Math.round(Math.sqrt((d.area * 4) / 3) * 10) / 10, 2, 12);
  const depth = clamp(Math.round((d.area / w) * 10) / 10, 2, 12);
  const payload = {
    v: 1,
    n: `${d.aptName} ${d.pyeong}평`,
    w,
    d: depth,
    rg: '서울',
    fl: clamp(d.floor || 1, 1, 50),
    zn: [],
    it: [],
    src: 'rent-finder',
  };
  return `${TWINFORGE_URL}/?share=${btoa(encodeURIComponent(JSON.stringify(payload)))}`;
}

/* ── 중개업소 모달 ────────────────────────────── */
let districtCodeByName = {};        // "강남구" → "11680"
const brokerCache = new Map();      // "코드:동" → /api/brokers 응답
const BROKER_DISPLAY_LIMIT = 100;

async function openBrokerModal(deal) {
  const modal = document.getElementById('broker-modal');
  const title = document.getElementById('broker-modal-title');
  const body = document.getElementById('broker-modal-body');
  title.textContent = `${deal.district} ${deal.dong} 중개업소`;
  body.innerHTML = '<p class="modal-msg">불러오는 중…</p>';
  modal.classList.remove('hidden');

  const code = districtCodeByName[deal.district];
  if (!code) {
    body.innerHTML = '<p class="modal-msg error">자치구 코드를 찾지 못했습니다.</p>';
    return;
  }

  const cacheKey = `${code}:${deal.dong}`;
  try {
    let data = brokerCache.get(cacheKey);
    if (!data) {
      const params = new URLSearchParams({ district: code, dong: deal.dong });
      const res = await fetch(`/api/brokers?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `서버 오류 (${res.status})`);
      data = json;
      brokerCache.set(cacheKey, data);
    }
    renderBrokerList(deal, data);
  } catch (err) {
    body.innerHTML = `<p class="modal-msg error">${esc(err.message)}</p>`;
  }
}

function renderBrokerList(deal, data) {
  const body = document.getElementById('broker-modal-body');
  if (data.brokers.length === 0) {
    body.innerHTML = '<p class="modal-msg">영업중인 중개업소를 찾지 못했습니다.</p>';
    return;
  }

  const scopeNote =
    data.scope === 'district'
      ? `<p class="modal-msg">${esc(deal.dong)}에 등록된 중개업소가 없어 ${esc(deal.district)} 전체 ${data.count.toLocaleString()}곳을 표시합니다.</p>`
      : '';
  const shown = data.brokers.slice(0, BROKER_DISPLAY_LIMIT);
  const rest = data.brokers.length - shown.length;

  body.innerHTML =
    scopeNote +
    shown
      .map(
        (b) => `
      <div class="broker-item">
        <div class="broker-name">${esc(b.name)}${b.agentName ? ` <span class="broker-agent">대표 ${esc(b.agentName)}</span>` : ''}</div>
        <div class="broker-addr">${esc(b.address)}</div>
        ${b.phone ? `<a class="broker-phone" href="tel:${esc(b.phone)}">☎ ${esc(b.phone)}</a>` : '<span class="broker-phone muted">전화번호 미등록</span>'}
      </div>`
      )
      .join('') +
    (rest > 0 ? `<p class="modal-msg">외 ${rest.toLocaleString()}곳</p>` : '');
}

function closeBrokerModal() {
  document.getElementById('broker-modal').classList.add('hidden');
}

document.getElementById('broker-modal-close').addEventListener('click', closeBrokerModal);
document.getElementById('broker-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeBrokerModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeBrokerModal();
});

function updateResultSummary(filtered, total) {
  const el = document.getElementById('result-summary');
  el.textContent = `필터된 결과 ${filtered.toLocaleString()}건 / 전체 ${total.toLocaleString()}건`;
}

/* ── 페이지네이션 ─────────────────────────────── */
let _currentDeals = [];

function showPage(deals, pageIdx, append = false) {
  const start = pageIdx * PAGE_SIZE;
  const slice = deals.slice(start, start + PAGE_SIZE);
  renderResults(slice, append);

  const hasMore = deals.length > (pageIdx + 1) * PAGE_SIZE;
  document.getElementById('load-more-wrap').classList.toggle('hidden', !hasMore);
}

function refreshView() {
  const deals = filterSort(state.rawDeals, state.filter, state.sort);
  _currentDeals = deals;
  state.page = 0;

  updateResultSummary(deals.length, state.rawDeals.length);
  showPage(deals, 0, false);

  document.getElementById('filter-panel').classList.remove('hidden');
  document.getElementById('results-section').classList.remove('hidden');
}

/* ── 이벤트 바인딩 ────────────────────────────── */
document.getElementById('search-btn').addEventListener('click', async () => {
  const months = parseInt(document.getElementById('months-select').value, 10);
  const codes = [...selectedDistricts];

  setStatus('데이터를 불러오는 중…');
  document.getElementById('search-btn').disabled = true;
  document.getElementById('filter-panel').classList.add('hidden');
  document.getElementById('results-section').classList.add('hidden');

  try {
    const data = await fetchDeals(codes, months);
    state.rawDeals = data.results;
    clearStatus();
    if (state.rawDeals.length === 0) {
      setStatus('조회된 거래가 없습니다.');
    } else {
      refreshView();
    }
  } catch (err) {
    setStatus(`오류: ${err.message}`, true);
  } finally {
    document.getElementById('search-btn').disabled = false;
  }
});

// 렌트 유형 칩
document.querySelectorAll('[data-rent-type]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-rent-type]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter.rentType = btn.dataset.rentType;
    refreshView();
  });
});

// 보증금 / 면적 필터
function bindNumFilter(inputId, stateKey) {
  document.getElementById(inputId).addEventListener('change', (e) => {
    const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
    state.filter[stateKey] = isNaN(val) ? null : val;
    if (state.rawDeals.length > 0) refreshView();
  });
}
bindNumFilter('deposit-min', 'depositMin');
bindNumFilter('deposit-max', 'depositMax');
bindNumFilter('area-min', 'areaMin');
bindNumFilter('area-max', 'areaMax');

// 정렬
document.getElementById('sort-select').addEventListener('change', (e) => {
  state.sort = e.target.value;
  if (state.rawDeals.length > 0) refreshView();
});

// 더 보기
document.getElementById('load-more-btn').addEventListener('click', () => {
  state.page++;
  showPage(_currentDeals, state.page, true);
});

/* ── 상태 메시지 ──────────────────────────────── */
function setStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = `status-msg${isError ? ' error' : ''}`;
}
function clearStatus() {
  const el = document.getElementById('status-msg');
  el.className = 'status-msg hidden';
}

/* ── 유틸 ─────────────────────────────────────── */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 만원 → "3억 2,000만원" 형태 */
function fmtAmount(won) {
  if (!won) return '-';
  const eok = Math.floor(won / 10000);
  const man = won % 10000;
  const parts = [];
  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  return parts.join(' ') + '원';
}

/* ── 초기화 ───────────────────────────────────── */
(async () => {
  try {
    const districts = await fetchDistricts();
    renderDistrictChips(districts);
    districtCodeByName = Object.fromEntries(districts.map((d) => [d.name, d.code]));
  } catch (err) {
    setStatus('구 목록을 불러오지 못했습니다. 서버가 실행 중인지 확인하세요.', true);
  }
})();
