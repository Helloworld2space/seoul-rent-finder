/**
 * "오늘의 전/월세 평균" — 수도권 시세 지도.
 *
 * 지도는 외부 라이브러리·타일 없이 GeoJSON을 SVG path로 직접 그린다
 * (빌드 스텝 없는 프론트 원칙 유지 + 외부 의존성 0).
 */

/* ── 상태 ─────────────────────────────────────── */
const state = {
  geo: null,        // FeatureCollection
  polygons: [],     // /api/prices 응답
  byId: new Map(),  // 폴리곤 id → 시세
  metric: 'jeonseAvgDeposit',
  region: 'all',
  selectedId: null,
};

// 폴리곤 id 앞 2자리 = 지역 (통계청 코드: 11 서울, 23 인천, 31 경기)
const REGION_PREFIX = { seoul: '11', incheon: '23', gyeonggi: '31' };

const METRIC_LABEL = {
  jeonseAvgDeposit: '전세 평균 보증금',
  wolseAvgDeposit: '월세 평균 보증금',
  wolseAvgRent: '월세 평균 월세',
};

/* ── 유틸 ─────────────────────────────────────── */
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 만원 → "3억 2,000만원" (index.html의 표기 규칙과 동일) */
function fmtAmount(won) {
  if (!won) return '-';
  const eok = Math.floor(won / 10000);
  const man = won % 10000;
  const parts = [];
  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  return parts.join(' ') + '원';
}

function metricValue(p) {
  return p ? p[state.metric] ?? 0 : 0;
}

/** 해당 지표의 표본 건수 — 0이면 색을 칠하지 않는다 */
function metricCount(p) {
  if (!p) return 0;
  return state.metric === 'jeonseAvgDeposit' ? p.jeonseCount : p.wolseCount;
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = `status-msg${isError ? ' error' : ''}`;
}
function clearStatus() {
  document.getElementById('status-msg').className = 'status-msg hidden';
}

/* ── 색상 (연한 파랑 → 진한 파랑) ──────────────── */
const SCALE = ['#e8f1fc', '#c5ddf7', '#9dc4f0', '#6fa5e6', '#3f7fd4', '#1f5bb5'];

/** 현재 화면에 보이는 폴리곤들의 값 분포로 구간을 나눈다 */
function buildScale() {
  const vals = visibleFeatures()
    .map((f) => state.byId.get(f.properties.id))
    .filter((p) => metricCount(p) > 0)
    .map(metricValue)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  if (vals.length === 0) return null;
  // 분위수 기반 — 소수 지역의 극단값에 색이 쏠리지 않게
  const breaks = [];
  for (let i = 1; i < SCALE.length; i++) {
    breaks.push(vals[Math.floor((vals.length * i) / SCALE.length)] ?? vals[vals.length - 1]);
  }
  return breaks;
}

function colorFor(value, breaks) {
  if (!breaks || !value) return '#f0f0f2'; // 데이터 없음
  let i = 0;
  while (i < breaks.length && value >= breaks[i]) i++;
  return SCALE[Math.min(i, SCALE.length - 1)];
}

/* ── 지도 그리기 ──────────────────────────────── */
function visibleFeatures() {
  if (!state.geo) return [];
  if (state.region === 'all') return state.geo.features;
  const prefix = REGION_PREFIX[state.region];
  return state.geo.features.filter((f) => f.properties.id.startsWith(prefix));
}

const SVG_W = 760;
const SVG_H = 620;

function renderMap() {
  const svg = document.getElementById('map');
  const features = visibleFeatures();
  if (features.length === 0) return;

  // 보이는 지역만으로 경계 상자를 잡아 자동 확대
  // (먼 섬은 지도 데이터 생성 단계에서 이미 제외됐다 — scripts/build-map-data.js)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const f of features) {
    for (const poly of f.geometry.coordinates) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  // 위도에 따른 경도 압축 보정 (메르카토르 근사) — 한국 위도에서 가로가 늘어나 보이는 것 방지
  const latRad = (((minY + maxY) / 2) * Math.PI) / 180;
  const xScaleAdj = Math.cos(latRad);
  const spanX = (maxX - minX) * xScaleAdj;
  const spanY = maxY - minY;
  const pad = 12;
  const scale = Math.min((SVG_W - pad * 2) / spanX, (SVG_H - pad * 2) / spanY);
  const offsetX = (SVG_W - spanX * scale) / 2;
  const offsetY = (SVG_H - spanY * scale) / 2;

  const project = ([lng, lat]) => [
    offsetX + (lng - minX) * xScaleAdj * scale,
    // SVG는 y축이 아래로 향하므로 위도를 뒤집는다
    offsetY + (maxY - lat) * scale,
  ];

  const breaks = buildScale();
  svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
  svg.innerHTML = '';
  // 분위수 밖(먼 섬)이 화면을 넘어가 레이아웃을 밀지 않도록 잘라낸다
  svg.style.overflow = 'hidden';

  for (const f of features) {
    const id = f.properties.id;
    const stats = state.byId.get(id);
    const d = f.geometry.coordinates
      .map((poly) =>
        poly
          .map((ring) => {
            const pts = ring.map(project);
            return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
          })
          .join('')
      )
      .join('');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `map-area${state.selectedId === id ? ' selected' : ''}`);
    path.setAttribute(
      'fill',
      metricCount(stats) > 0 ? colorFor(metricValue(stats), breaks) : '#f0f0f2'
    );
    path.dataset.id = id;
    path.dataset.name = f.properties.name;
    svg.appendChild(path);
  }

  renderLegend(breaks);
}

function renderLegend(breaks) {
  const el = document.getElementById('legend');
  if (!breaks) {
    el.innerHTML = '<span class="legend-note">표시할 데이터가 없습니다.</span>';
    return;
  }
  const items = SCALE.map((color, i) => {
    const label =
      i === 0 ? `~${fmtAmount(breaks[0])}` :
      i === SCALE.length - 1 ? `${fmtAmount(breaks[i - 1])}~` :
      `${fmtAmount(breaks[i - 1])}~`;
    return `<span class="legend-item"><i style="background:${color}"></i>${esc(label)}</span>`;
  }).join('');
  el.innerHTML = `<span class="legend-title">${esc(METRIC_LABEL[state.metric])}</span>${items}`;
}

/* ── 툴팁 ─────────────────────────────────────── */
function showTooltip(evt, id, name) {
  const tip = document.getElementById('map-tooltip');
  const s = state.byId.get(id);
  const count = metricCount(s);
  const body = count > 0
    ? `${esc(METRIC_LABEL[state.metric])} ${fmtAmount(metricValue(s))}<br /><small>${count.toLocaleString()}건</small>`
    : '<small>최근 3개월 거래 없음</small>';
  tip.innerHTML = `<strong>${esc(name)}</strong><br />${body}`;
  tip.classList.remove('hidden');

  const wrap = document.getElementById('map-wrap').getBoundingClientRect();
  tip.style.left = `${evt.clientX - wrap.left + 12}px`;
  tip.style.top = `${evt.clientY - wrap.top + 12}px`;
}

function hideTooltip() {
  document.getElementById('map-tooltip').classList.add('hidden');
}

/* ── 동별 표 ──────────────────────────────────── */
async function showDongTable(polygonId, polygonName) {
  const section = document.getElementById('dong-section');
  const title = document.getElementById('dong-title');
  const tbody = document.getElementById('dong-body');
  const stats = state.byId.get(polygonId);
  const codes = stats?.districtCodes ?? [];

  section.classList.remove('hidden');
  title.textContent = `${polygonName} 동별 시세`;
  tbody.innerHTML = '<tr><td colspan="6">불러오는 중…</td></tr>';
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  if (codes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">최근 3개월 거래 자료가 없습니다.</td></tr>';
    return;
  }

  try {
    // 여러 자치구가 한 폴리곤을 공유하면(부천·화성 등) 모두 합쳐서 보여준다
    const results = await Promise.all(
      codes.map((code) =>
        fetch(`/api/prices?district=${encodeURIComponent(code)}`).then((r) => r.json())
      )
    );
    const dongs = results.flatMap((r) => r.dongs ?? []);
    dongs.sort((a, b) => b.jeonseCount + b.wolseCount - (a.jeonseCount + a.wolseCount));

    if (dongs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">최근 3개월 거래 자료가 없습니다.</td></tr>';
      return;
    }

    tbody.innerHTML = dongs
      .map((d) => {
        const total = d.jeonseCount + d.wolseCount;
        const sparse = total < 3 ? ' class="sparse"' : '';
        return `
        <tr${sparse}>
          <td>${esc(d.dong)}${total < 3 ? ' <small>(표본 적음)</small>' : ''}</td>
          <td class="amount">${d.jeonseCount.toLocaleString()}</td>
          <td class="amount">${d.jeonseCount ? fmtAmount(d.jeonseAvgDeposit) : '-'}</td>
          <td class="amount">${d.wolseCount.toLocaleString()}</td>
          <td class="amount">${d.wolseCount ? fmtAmount(d.wolseAvgDeposit) : '-'}</td>
          <td class="amount">${d.wolseCount ? fmtAmount(d.wolseAvgRent) : '-'}</td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">불러오지 못했습니다: ${esc(err.message)}</td></tr>`;
  }
}

/* ── 이벤트 ───────────────────────────────────── */
document.getElementById('map').addEventListener('mousemove', (e) => {
  const path = e.target.closest('.map-area');
  if (path) showTooltip(e, path.dataset.id, path.dataset.name);
  else hideTooltip();
});
document.getElementById('map').addEventListener('mouseleave', hideTooltip);

document.getElementById('map').addEventListener('click', (e) => {
  const path = e.target.closest('.map-area');
  if (!path) return;
  state.selectedId = path.dataset.id;
  renderMap();
  Analytics.track('map_district_click', { polygon: path.dataset.id, metric: state.metric });
  showDongTable(path.dataset.id, path.dataset.name);
});

document.querySelectorAll('#metric-chips .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#metric-chips .chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.metric = btn.dataset.metric;
    renderMap();
  });
});

document.querySelectorAll('#region-chips .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#region-chips .chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.region = btn.dataset.region;
    renderMap();
  });
});

/* ── 초기화 ───────────────────────────────────── */
(async () => {
  try {
    const [geo, prices] = await Promise.all([
      fetch('data/sudogwon.geo.json').then((r) => {
        if (!r.ok) throw new Error('지도 데이터를 불러오지 못했습니다.');
        return r.json();
      }),
      fetch('/api/prices').then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `시세 조회 실패 (${r.status})`);
        return body;
      }),
    ]);

    state.geo = geo;
    state.polygons = prices.polygons ?? [];
    state.byId = new Map(state.polygons.map((p) => [p.id, p]));

    const note = document.getElementById('basis-note');
    const when = prices.updatedAt
      ? new Date(prices.updatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
      : null;
    note.textContent = `수도권 빌라·단독 전월세 최근 3개월 평균${when ? ` · ${when} 기준` : ''}`;

    renderMap();
    clearStatus();
    Analytics.track('map_view');
  } catch (err) {
    setStatus(`${err.message}`, true);
    document.getElementById('basis-note').textContent = '수도권 빌라·단독 전월세 시세';
  }
})();
