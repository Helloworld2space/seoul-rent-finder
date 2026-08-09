/**
 * 동네 리포트 — 구를 고르면 그 안의 동별 성격을 보여준다.
 *
 * 판정은 profile.js의 순수함수가, 데이터는 저장된 시세 통계가 담당한다.
 * 공공 API를 직접 부르지 않으므로 쿼터를 쓰지 않는다.
 */

const REGION_LABEL = { seoul: '서울', gyeonggi: '경기', incheon: '인천' };

/* ── 유틸 (앱 전체 표기 규칙과 동일) ───────────── */
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

/* ── 지역 목록 ────────────────────────────────── */
async function loadDistricts() {
  const res = await fetch('/api/districts');
  if (!res.ok) throw new Error('지역 목록을 불러오지 못했습니다.');
  const { regions, districts } = await res.json();

  const select = document.getElementById('district-select');
  // 지역별로 묶어서 고르기 쉽게
  regions.forEach((r) => {
    const group = document.createElement('optgroup');
    group.label = r.name;
    districts
      .filter((d) => d.region === r.id)
      .forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.code;
        opt.textContent = d.name;
        opt.dataset.region = d.region;
        group.appendChild(opt);
      });
    select.appendChild(group);
  });
}

/* ── 리포트 ───────────────────────────────────── */
function renderReport(districtName, region, dongs) {
  const list = document.getElementById('report-list');
  const report = buildReport(dongs);

  document.getElementById('report-section').classList.remove('hidden');
  document.getElementById('report-title').textContent = `${districtName} 동네 리포트`;

  if (report.length === 0) {
    document.getElementById('report-sub').textContent = '';
    list.innerHTML = '<p class="modal-msg">최근 3개월 빌라·단독 거래 자료가 없습니다.</p>';
    return;
  }

  const totalDeals = report.reduce((s, d) => s + d.total, 0);
  document.getElementById('report-sub').textContent =
    `${REGION_LABEL[region] ?? ''} · ${report.length}개 동 · 최근 3개월 거래 ${totalDeals.toLocaleString()}건`;

  list.innerHTML = report
    .map((d) => {
      const tags = d.tags
        .map((t) => `<span class="badge ${t === '표본 적음' ? 'badge-prop' : 'badge-tag'}">${esc(t)}</span>`)
        .join('');
      // 시세는 있는 것만 보여준다(전세만 있는 동, 월세만 있는 동이 흔하다)
      const prices = [];
      if (d.jeonseCount > 0) prices.push(`전세 ${fmtAmount(d.jeonseAvgDeposit)} <small>(${d.jeonseCount}건)</small>`);
      if (d.wolseCount > 0) prices.push(`월세 ${fmtAmount(d.wolseAvgDeposit)}/${fmtAmount(d.wolseAvgRent)} <small>(${d.wolseCount}건)</small>`);

      return `
        <article class="report-card${d.enough ? '' : ' sparse'}">
          <div class="report-head">
            <h3 class="report-dong">${esc(d.dong)}</h3>
            <div class="report-tags">${tags}</div>
          </div>
          <p class="report-summary">${esc(d.summary)}</p>
          <div class="report-prices">${prices.join(' · ')}</div>
        </article>`;
    })
    .join('');
}

async function selectDistrict(code, name, region) {
  setStatus('불러오는 중…');
  document.getElementById('report-section').classList.add('hidden');
  try {
    const res = await fetch(`/api/prices?district=${encodeURIComponent(code)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `조회 실패 (${res.status})`);
    clearStatus();
    renderReport(name, region, body.dongs ?? []);
    Analytics.track('report_view_district', { district: code });
    document.getElementById('report-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    setStatus(err.message, true);
  }
}

/* ── 이벤트 ───────────────────────────────────── */
document.getElementById('district-select').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (!opt || !opt.value) {
    document.getElementById('report-section').classList.add('hidden');
    return;
  }
  selectDistrict(opt.value, opt.textContent, opt.dataset.region);
});

/* ── 초기화 ───────────────────────────────────── */
(async () => {
  try {
    await loadDistricts();
    clearStatus();
    Analytics.track('report_view');
  } catch (err) {
    setStatus(err.message, true);
  }
})();
