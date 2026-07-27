/* ── 상태 ─────────────────────────────────────── */
const state = {
  rawDeals: [],       // 서버에서 받은 원본 전체
  filter: {
    rentType: '',     // '' | '전세' | '월세'
    depositMin: null,
    depositMax: null,
    areaMin: null,
    areaMax: null,
    pyeongMin: null,
    pyeongMax: null,
  },
  sort: 'dealDate-desc',
  page: 0,           // 렌더링된 페이지 수
};
const PAGE_SIZE = 100;

/* ── API ──────────────────────────────────────── */
async function fetchDistricts() {
  const res = await fetch('/api/districts');
  if (!res.ok) throw new Error('구 목록 조회 실패');
  return res.json(); // { regions, districts }
}

async function fetchDeals(districtCodes, months, types) {
  const params = new URLSearchParams({ months: String(months) });
  if (districtCodes.length > 0) params.set('districts', districtCodes.join(','));
  if (types.length > 0) params.set('types', types.join(','));
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
  if (filter.pyeongMin != null) {
    list = list.filter((d) => d.pyeong >= filter.pyeongMin);
  }
  if (filter.pyeongMax != null) {
    list = list.filter((d) => d.pyeong <= filter.pyeongMax);
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

/* ── 렌더: 지역 탭 + 자치구 칩 ────────────────── */
let selectedDistricts = new Set();
let allDistricts = [];          // [{code, name, region}]
let activeRegion = 'seoul';
let selectedTypes = new Set(['apt']);

function renderRegionTabs(regions) {
  const container = document.getElementById('region-tabs');
  container.innerHTML = '';
  regions.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = `chip region-tab${r.id === activeRegion ? ' active' : ''}`;
    btn.textContent = r.name;
    btn.dataset.region = r.id;
    btn.addEventListener('click', () => {
      activeRegion = r.id;
      container.querySelectorAll('.region-tab').forEach((b) => b.classList.toggle('active', b.dataset.region === r.id));
      renderDistrictChips();
    });
    container.appendChild(btn);
  });
}

// 현재 활성 지역의 구 칩만 표시. 선택 상태(selectedDistricts)는 지역을 넘어 유지된다.
function renderDistrictChips() {
  const container = document.getElementById('district-chips');
  container.innerHTML = '';
  allDistricts
    .filter((d) => d.region === activeRegion)
    .forEach((d) => {
      const btn = document.createElement('button');
      btn.className = `chip${selectedDistricts.has(d.code) ? ' active' : ''}`;
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
      <td><span class="badge badge-prop">${esc(d.propertyType ?? '아파트')}</span></td>
      <td><span class="badge ${d.rentType === '전세' ? 'badge-jeonse' : 'badge-wolse'}">${esc(d.rentType)}</span></td>
      <td class="amount">${fmtAmount(d.deposit)}</td>
      <td class="amount">${d.monthlyRent > 0 ? fmtAmount(d.monthlyRent) : '-'}</td>
      <td>${d.area}</td>
      <td>${d.pyeong}</td>
      <td>${d.floor || '-'}</td>
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

  const star = document.createElement('button');
  const key = Auth.dealKey(d);
  star.className = `action-btn star-btn${favoriteKeys.has(key) ? ' active' : ''}`;
  star.textContent = '★';
  star.title = '관심 거래로 저장';
  star.addEventListener('click', () => toggleFavorite(d, star));
  td.appendChild(star);

  const mapLink = document.createElement('a');
  mapLink.className = 'action-btn';
  mapLink.textContent = '지도';
  mapLink.href = naverMapUrl(d);
  mapLink.target = '_blank';
  mapLink.rel = 'noopener';
  mapLink.title = '네이버 지도에서 단지 사진·거리뷰 보기';

  const landLink = document.createElement('a');
  landLink.className = 'action-btn';
  landLink.textContent = '매물찾기';
  landLink.href = naverLandUrl(d);
  landLink.target = '_blank';
  landLink.rel = 'noopener';
  landLink.title = '네이버 부동산에서 이 단지·동네 매물 검색';

  const brokerBtn = document.createElement('button');
  brokerBtn.className = 'action-btn';
  brokerBtn.textContent = '중개업소';
  // 중개업소 데이터 출처(서울 열린데이터광장)가 서울 한정
  if (regionOfDistrict(d.district) === 'seoul') {
    brokerBtn.title = '근처 부동산 중개업소 연락처';
    brokerBtn.addEventListener('click', () => openBrokerModal(d));
  } else {
    brokerBtn.disabled = true;
    brokerBtn.title = '중개업소 조회는 서울만 지원합니다';
  }

  const twinLink = document.createElement('a');
  twinLink.className = 'action-btn';
  twinLink.textContent = '인테리어';
  twinLink.href = twinforgeUrl(d);
  twinLink.target = '_blank';
  twinLink.rel = 'noopener';
  twinLink.title = 'ROOM TWIN 3D에서 이 평수로 인테리어 해보기';

  mapLink.addEventListener('click', () => Analytics.track('action_click', { action: 'map' }));
  landLink.addEventListener('click', () => Analytics.track('action_click', { action: 'naver_land' }));
  twinLink.addEventListener('click', () => Analytics.track('action_click', { action: 'twinforge' }));

  td.append(mapLink, landLink, brokerBtn, twinLink);
  return td;
}

/* ── 외부 연계: 네이버 지도 / ROOM TWIN 3D ────── */
const TWINFORGE_URL = 'https://twinforge.vercel.app'; // ROOM TWIN 3D (로컬 개발 시 http://localhost:5173)

function naverMapUrl(d) {
  return `https://map.naver.com/p/search/${encodeURIComponent(`${d.district} ${d.dong} ${d.aptName}`)}`;
}

/** 네이버 부동산 검색 딥링크(매물찾기) — 검색 페이지로 연결해 사용자가 매물을 찾는다.
 *  네이버 부동산은 공식 공개 API가 없고, 주소→좌표 자동 연결(근처 매물 지도)은
 *  지오코딩 키 없이는 불가능해 검색 진입점 방식이 합법적 최선.
 *  m.land 검색만 서버측 200을 반환한다 (new.land/search는 404 리다이렉트).
 *  단지명의 "(963)" 같은 지번 꼬리표는 검색 매칭을 방해해 제거하고,
 *  단독다가구는 건물명이 없으므로 동네 단위로 검색한다. */
function naverLandUrl(d) {
  const cleanName = d.propertyType === '단독다가구' ? '' : d.aptName.replace(/\(.*?\)/g, '').trim();
  const query = `${d.district} ${d.dong} ${cleanName}`.trim();
  return `https://m.land.naver.com/search/result/${encodeURIComponent(query)}`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** RentDeal → ROOM TWIN 3D share 딥링크. 전용면적을 4:3 방으로 환산 (한도 2~12m) */
function twinforgeUrl(d) {
  const w = clamp(Math.round(Math.sqrt((d.area * 4) / 3) * 10) / 10, 2, 12);
  const depth = clamp(Math.round((d.area / w) * 10) / 10, 2, 12);
  const regionNames = { seoul: '서울', gyeonggi: '경기', incheon: '인천' };
  const payload = {
    v: 1,
    n: `${d.aptName} ${d.pyeong}평`,
    w,
    d: depth,
    rg: regionNames[regionOfDistrict(d.district)] ?? '서울',
    fl: clamp(d.floor || 1, 1, 50),
    zn: [],
    it: [],
    src: 'rent-finder',
  };
  return `${TWINFORGE_URL}/?share=${btoa(encodeURIComponent(JSON.stringify(payload)))}`;
}

/** 지역명("강남구", "수원시 장안구") → region id. 목록에 없으면 'seoul' 취급 안 함 */
function regionOfDistrict(districtName) {
  return districtRegionByName[districtName] ?? null;
}

/* ── 중개업소 모달 ────────────────────────────── */
let districtCodeByName = {};        // "강남구" → "11680"
let districtRegionByName = {};      // "강남구" → "seoul"
const brokerCache = new Map();      // "코드:동" → /api/brokers 응답
const BROKER_DISPLAY_LIMIT = 100;

async function openBrokerModal(deal) {
  const modal = document.getElementById('broker-modal');
  const title = document.getElementById('broker-modal-title');
  const body = document.getElementById('broker-modal-body');
  title.textContent = `${deal.district} ${deal.dong} 중개업소`;
  body.innerHTML = '<p class="modal-msg">불러오는 중…</p>';
  modal.classList.remove('hidden');
  Analytics.track('action_click', { action: 'broker' });

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
  if (e.key === 'Escape') {
    closeBrokerModal();
    document.getElementById('fav-modal').classList.add('hidden');
  }
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
  renderStats(deals);
  showPage(deals, 0, false);

  document.getElementById('filter-panel').classList.remove('hidden');
  document.getElementById('stats-section').classList.remove('hidden');
  document.getElementById('results-section').classList.remove('hidden');
  if (window._updateHScroll) window._updateHScroll();
}

/* ── 렌더: 지역별 평균 (stats.js의 순수함수 사용) ── */
function renderStats(deals) {
  const tbody = document.getElementById('stats-body');
  tbody.innerHTML = '';
  computeRegionStats(deals).forEach((s) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(s.district)}</td>
      <td class="amount">${s.total.toLocaleString()}</td>
      <td class="amount">${s.jeonse.count.toLocaleString()}</td>
      <td class="amount">${s.jeonse.count ? fmtAmount(s.jeonse.avgDeposit) : '-'}</td>
      <td class="amount">${s.wolse.count.toLocaleString()}</td>
      <td class="amount">${s.wolse.count ? fmtAmount(s.wolse.avgDeposit) : '-'}</td>
      <td class="amount">${s.wolse.count ? fmtAmount(s.wolse.avgRent) : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── 이벤트 바인딩 ────────────────────────────── */
document.getElementById('search-btn').addEventListener('click', async () => {
  const months = parseInt(document.getElementById('months-select').value, 10);
  // 구 미선택 시 현재 지역 탭 전체를 명시적으로 전송
  const codes =
    selectedDistricts.size > 0
      ? [...selectedDistricts]
      : allDistricts.filter((d) => d.region === activeRegion).map((d) => d.code);
  const types = [...selectedTypes];

  setStatus('데이터를 불러오는 중…');
  document.getElementById('search-btn').disabled = true;
  document.getElementById('filter-panel').classList.add('hidden');
  document.getElementById('stats-section').classList.add('hidden');
  document.getElementById('results-section').classList.add('hidden');

  Analytics.track('search', {
    region: activeRegion,
    district_count: codes.length,
    explicit_selection: selectedDistricts.size > 0,
    types: types.join(','),
    months,
  });

  try {
    const data = await fetchDeals(codes, months, types);
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

// 주거 유형 칩 (다중선택, 최소 1개 유지)
document.querySelectorAll('[data-prop-type]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = btn.dataset.propType;
    if (selectedTypes.has(t)) {
      if (selectedTypes.size === 1) return; // 전부 해제 방지
      selectedTypes.delete(t);
      btn.classList.remove('active');
    } else {
      selectedTypes.add(t);
      btn.classList.add('active');
    }
  });
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
    const val = e.target.value === '' ? null : parseFloat(e.target.value);
    state.filter[stateKey] = val === null || isNaN(val) ? null : val;
    if (state.rawDeals.length > 0) refreshView();
  });
}
bindNumFilter('deposit-min', 'depositMin');
bindNumFilter('deposit-max', 'depositMax');
bindNumFilter('area-min', 'areaMin');
bindNumFilter('area-max', 'areaMax');
bindNumFilter('pyeong-min', 'pyeongMin');
bindNumFilter('pyeong-max', 'pyeongMax');

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

/* ── 랜딩 (진입 시 항상 표시) ─────────────────── */
// 마크업 기본값이 "랜딩 보임 / 본문 숨김"이라 깜빡임 없이 랜딩이 먼저 보인다.
(function setupLanding() {
  const landing = document.getElementById('landing');
  const main = document.querySelector('main');

  function enterApp() {
    landing.classList.add('hidden');
    main.classList.remove('hidden');
  }

  // 구글 로그인 후 되돌아온 경우엔 랜딩을 건너뛴다 (작업 흐름 유지).
  // Supabase는 implicit flow면 #access_token=, PKCE면 ?code= 로 돌아온다.
  if (/access_token=/.test(window.location.hash) || /[?&]code=/.test(window.location.search)) {
    enterApp();
  }

  document.getElementById('landing-start').addEventListener('click', () => {
    enterApp();
    Analytics.track('landing_start');
  });
})();

/* ── 로그인 / 관심 거래 / 맞춤 검색 ───────────── */
let favoriteKeys = new Set();   // 현재 사용자가 저장한 deal_key
let favoritesCache = null;      // fetchFavorites 결과 (모달·맞춤 검색용)

function updateAuthUI(user) {
  const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
  show('login-btn', !user);
  show('logout-btn', !!user);
  show('user-email', !!user);
  show('fav-list-btn', !!user);
  show('custom-search-btn', !!user);
  if (user) document.getElementById('user-email').textContent = user.email;
}

async function loadFavorites() {
  try {
    favoritesCache = await Auth.fetchFavorites();
    favoriteKeys = new Set(favoritesCache.map((r) => r.deal_key));
  } catch (err) {
    console.warn(err.message);
    favoritesCache = [];
    favoriteKeys = new Set();
  }
  updateCustomSearchBtn();
  if (state.rawDeals.length > 0) refreshView(); // ★ 상태 반영해 재렌더
}

function updateCustomSearchBtn() {
  const btn = document.getElementById('custom-search-btn');
  const has = favoritesCache && favoritesCache.length > 0;
  btn.disabled = !has;
  btn.title = has ? '저장한 관심 거래 기반으로 조건을 자동 설정해 조회' : '관심 거래를 먼저 저장하세요';
}

async function toggleFavorite(deal, starEl) {
  if (!Auth.getUser()) {
    if (window.confirm('관심 거래 저장에는 구글 로그인이 필요합니다. 로그인할까요?')) {
      Auth.signInWithGoogle();
    }
    return;
  }
  const key = Auth.dealKey(deal);
  try {
    if (favoriteKeys.has(key)) {
      await Auth.removeFavorite(key);
      favoriteKeys.delete(key);
      favoritesCache = (favoritesCache ?? []).filter((r) => r.deal_key !== key);
      starEl.classList.remove('active');
    } else {
      await Auth.addFavorite(deal);
      favoriteKeys.add(key);
      (favoritesCache ??= []).unshift({ deal_key: key, deal, created_at: new Date().toISOString() });
      starEl.classList.add('active');
      Analytics.track('favorite_added', { district: deal.district, property_type: deal.propertyType, rent_type: deal.rentType });
    }
    updateCustomSearchBtn();
  } catch (err) {
    setStatus(`오류: ${err.message}`, true);
  }
}

/* 관심 목록 모달 */
function openFavModal() {
  const modal = document.getElementById('fav-modal');
  const body = document.getElementById('fav-modal-body');
  modal.classList.remove('hidden');
  const rows = favoritesCache ?? [];
  if (rows.length === 0) {
    body.innerHTML = '<p class="modal-msg">저장된 관심 거래가 없습니다. 결과 목록의 ★를 눌러 저장하세요.</p>';
    return;
  }
  body.innerHTML = '';
  rows.forEach((r) => {
    const d = r.deal;
    const item = document.createElement('div');
    item.className = 'broker-item';
    item.innerHTML = `
      <div class="broker-name">${esc(d.aptName)} <span class="badge badge-prop">${esc(d.propertyType ?? '아파트')}</span></div>
      <div class="broker-addr">${esc(d.district)} ${esc(d.dong)} · ${esc(d.rentType)}
        보증금 ${fmtAmount(d.deposit)}${d.monthlyRent > 0 ? ` / 월세 ${fmtAmount(d.monthlyRent)}` : ''}
        · ${d.pyeong ?? ''}평 · ${esc(d.dealDate ?? '')}</div>`;
    const actions = document.createElement('div');
    actions.className = 'row-actions fav-actions';
    const mk = (text, href, title) => {
      const a = document.createElement('a');
      a.className = 'action-btn'; a.textContent = text; a.href = href;
      a.target = '_blank'; a.rel = 'noopener'; a.title = title;
      return a;
    };
    actions.append(
      mk('지도', naverMapUrl(d), '네이버 지도'),
      mk('매물찾기', naverLandUrl(d), '네이버 부동산 검색'),
      mk('인테리어', twinforgeUrl(d), 'ROOM TWIN 3D')
    );
    const del = document.createElement('button');
    del.className = 'action-btn';
    del.textContent = '삭제';
    del.addEventListener('click', async () => {
      try {
        await Auth.removeFavorite(r.deal_key);
        favoriteKeys.delete(r.deal_key);
        favoritesCache = favoritesCache.filter((x) => x.deal_key !== r.deal_key);
        updateCustomSearchBtn();
        openFavModal(); // 목록 갱신
        if (state.rawDeals.length > 0) refreshView();
      } catch (err) {
        setStatus(`오류: ${err.message}`, true);
      }
    });
    actions.appendChild(del);
    item.appendChild(actions);
    body.appendChild(item);
  });
}

/* 맞춤 검색: 저장된 거래에서 선호 추출 → 검색 조건 자동 세팅 → 조회 */
const TYPE_LABEL_TO_CODE = { 아파트: 'apt', 연립다세대: 'rh', 단독다가구: 'sh', 오피스텔: 'offi' };

function runCustomSearch() {
  const prefs = computePreferences((favoritesCache ?? []).map((r) => r.deal));
  if (!prefs) return;

  // 지역 칩: 선호 지역 중 유효한 코드만 선택, 첫 지역의 탭으로 전환
  const codes = prefs.districts.map((name) => districtCodeByName[name]).filter(Boolean);
  if (codes.length > 0) {
    selectedDistricts = new Set(codes);
    activeRegion = districtRegionByName[prefs.districts[0]] ?? activeRegion;
    document.querySelectorAll('#region-tabs .region-tab').forEach((b) =>
      b.classList.toggle('active', b.dataset.region === activeRegion));
    renderDistrictChips();
  }

  // 유형 칩
  const typeCodes = prefs.propertyTypes.map((l) => TYPE_LABEL_TO_CODE[l]).filter(Boolean);
  if (typeCodes.length > 0) {
    selectedTypes = new Set(typeCodes);
    document.querySelectorAll('[data-prop-type]').forEach((b) =>
      b.classList.toggle('active', selectedTypes.has(b.dataset.propType)));
  }

  // 전/월세 성향 + 보증금·면적 범위 (프론트 필터)
  state.filter.rentType = prefs.rentType;
  document.querySelectorAll('[data-rent-type]').forEach((b) =>
    b.classList.toggle('active', b.dataset.rentType === prefs.rentType));
  state.filter.depositMin = prefs.depositMin;
  state.filter.depositMax = prefs.depositMax;
  state.filter.areaMin = prefs.areaMin;
  state.filter.areaMax = prefs.areaMax;
  document.getElementById('deposit-min').value = prefs.depositMin;
  document.getElementById('deposit-max').value = prefs.depositMax;
  document.getElementById('area-min').value = prefs.areaMin;
  document.getElementById('area-max').value = prefs.areaMax;

  document.getElementById('search-btn').click();
}

/* 이벤트 바인딩 + 세션 초기화 */
document.getElementById('login-btn').addEventListener('click', () => {
  Analytics.track('login_click');
  Auth.signInWithGoogle();
});
document.getElementById('logout-btn').addEventListener('click', () => Auth.signOut());
document.getElementById('fav-list-btn').addEventListener('click', openFavModal);
document.getElementById('custom-search-btn').addEventListener('click', () => {
  Analytics.track('custom_search');
  runCustomSearch();
});
document.getElementById('fav-modal-close').addEventListener('click', () =>
  document.getElementById('fav-modal').classList.add('hidden'));
document.getElementById('fav-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

Auth.onAuth((user) => {
  updateAuthUI(user);
  if (user) {
    loadFavorites();
  } else {
    favoriteKeys = new Set();
    favoritesCache = null;
    if (state.rawDeals.length > 0) refreshView();
  }
});
Auth.initAuth();

/* ── 플로팅 가로 스크롤바 ─────────────────────── */
// 결과 테이블이 길어 자체 가로 스크롤바가 테이블 맨 아래에만 보이는 문제 보완:
// 테이블 하단이 화면 밖에 있는 동안 화면 하단에 고정 스크롤바를 띄워 어디서든 좌우 이동.
(function setupFloatingHScroll() {
  const wrapper = document.querySelector('#results-section .table-wrapper');
  const bar = document.getElementById('hscroll');
  const inner = document.getElementById('hscroll-inner');
  let syncing = false;

  function update() {
    const section = document.getElementById('results-section');
    const rect = wrapper.getBoundingClientRect();
    const overflows = wrapper.scrollWidth > wrapper.clientWidth + 1;
    // 테이블 상단이 화면 안에 들어왔고, 하단(자체 스크롤바)은 아직 화면 밖일 때만 표시
    const inView = rect.top < window.innerHeight - 40 && rect.bottom > window.innerHeight;
    if (!section.classList.contains('hidden') && overflows && inView) {
      bar.style.left = `${rect.left}px`;
      bar.style.width = `${rect.width}px`;
      inner.style.width = `${wrapper.scrollWidth}px`;
      bar.classList.remove('hidden');
      if (!syncing) bar.scrollLeft = wrapper.scrollLeft;
    } else {
      bar.classList.add('hidden');
    }
  }

  bar.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true;
    wrapper.scrollLeft = bar.scrollLeft;
    syncing = false;
  });
  wrapper.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true;
    bar.scrollLeft = wrapper.scrollLeft;
    syncing = false;
  });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  new ResizeObserver(update).observe(wrapper);
  // refreshView/더보기 이후에도 갱신되도록 노출
  window._updateHScroll = update;
})();

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
    const { regions, districts } = await fetchDistricts();
    allDistricts = districts;
    districtCodeByName = Object.fromEntries(districts.map((d) => [d.name, d.code]));
    districtRegionByName = Object.fromEntries(districts.map((d) => [d.name, d.region]));
    renderRegionTabs(regions);
    renderDistrictChips();
  } catch (err) {
    setStatus('구 목록을 불러오지 못했습니다. 서버가 실행 중인지 확인하세요.', true);
  }
})();
