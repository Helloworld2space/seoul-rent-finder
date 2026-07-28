const https = require('https');
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  STATS_TYPES,
  STATS_MONTHS,
} = require('./config');
const { DISTRICTS } = require('./districts');
const { fetchRaw } = require('./molit-client');
const { normalizeAll } = require('./normalize');

/**
 * "오늘의 집값은?" 지역별 시세 집계.
 * ★ 공공 API는 하루 1회 수집 시에만 호출한다. 페이지 조회는 저장된 값만 읽는다.
 */

/* ── 집계 (순수함수 — 단위 테스트 대상) ─────────── */

/**
 * RentDeal[] → price_stats 행 배열.
 * 구 전체 합계는 dong='' 행으로 함께 낸다.
 *
 * @param {RentDeal[]} deals  한 (구, 월, 유형) 조합의 거래 목록
 * @param {{ym: string, districtCode: string, propertyType: string}} meta
 * @returns {object[]}  price_stats 테이블 행
 */
function aggregate(deals, meta) {
  const buckets = new Map(); // dong → 누적치 ('' = 구 전체)

  const bucketFor = (dong) => {
    let b = buckets.get(dong);
    if (!b) {
      b = { jCount: 0, jDeposit: 0, wCount: 0, wDeposit: 0, wRent: 0 };
      buckets.set(dong, b);
    }
    return b;
  };

  for (const d of deals) {
    // 동 단위와 구 전체(''), 두 곳에 동시에 누적한다
    for (const key of [d.dong || '(미상)', '']) {
      const b = bucketFor(key);
      if (d.rentType === '전세') {
        b.jCount++;
        b.jDeposit += d.deposit;
      } else {
        b.wCount++;
        b.wDeposit += d.deposit;
        b.wRent += d.monthlyRent;
      }
    }
  }

  const avg = (sum, n) => (n > 0 ? Math.round(sum / n) : 0);

  return [...buckets.entries()].map(([dong, b]) => ({
    ym: meta.ym,
    district_code: meta.districtCode,
    dong,
    property_type: meta.propertyType,
    jeonse_count: b.jCount,
    jeonse_avg_deposit: avg(b.jDeposit, b.jCount),
    wolse_count: b.wCount,
    wolse_avg_deposit: avg(b.wDeposit, b.wCount),
    wolse_avg_rent: avg(b.wRent, b.wCount),
  }));
}

/**
 * 여러 행(월·유형이 다른 같은 지역)을 하나로 합친다.
 * 평균의 평균이 아니라 건수 가중으로 재계산한다.
 * 지도에서 3개월×2유형을 한 값으로 보여줄 때 사용.
 *
 * @param {object[]} rows  price_stats 행들
 * @returns {{jeonseCount, jeonseAvgDeposit, wolseCount, wolseAvgDeposit, wolseAvgRent}}
 */
function mergeRows(rows) {
  let jCount = 0, jDeposit = 0, wCount = 0, wDeposit = 0, wRent = 0;
  for (const r of rows) {
    jCount += r.jeonse_count;
    jDeposit += r.jeonse_avg_deposit * r.jeonse_count;
    wCount += r.wolse_count;
    wDeposit += r.wolse_avg_deposit * r.wolse_count;
    wRent += r.wolse_avg_rent * r.wolse_count;
  }
  const avg = (sum, n) => (n > 0 ? Math.round(sum / n) : 0);
  return {
    jeonseCount: jCount,
    jeonseAvgDeposit: avg(jDeposit, jCount),
    wolseCount: wCount,
    wolseAvgDeposit: avg(wDeposit, wCount),
    wolseAvgRent: avg(wRent, wCount),
  };
}

/** 오늘 기준 최근 n개월 "YYYYMM" 배열 (routes.js의 recentMonths와 동일 규칙) */
function recentMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return out;
}

/* ── Supabase REST (새 의존성 없이 raw https) ───── */

function isEnabled() {
  return Boolean(SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseRequest(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      url,
      {
        method,
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Supabase ${res.statusCode}: ${raw.slice(0, 300)}`));
          }
          try {
            resolve(raw ? JSON.parse(raw) : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** 같은 키(ym,구,동,유형)는 덮어쓴다 — 재수집해도 중복되지 않는다 */
function upsertStats(rows) {
  if (rows.length === 0) return Promise.resolve();
  return supabaseRequest('POST', 'price_stats', rows, {
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

/** 최근 STATS_MONTHS개월치 조회. districtCode를 주면 그 구의 동별, 없으면 전 구 합계. */
async function readStats({ districtCode } = {}) {
  const months = recentMonths(STATS_MONTHS);
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('ym', `in.(${months.join(',')})`);
  if (districtCode) {
    params.set('district_code', `eq.${districtCode}`);
    params.set('dong', 'neq.'); // 동별 행만 (구 합계 제외)
  } else {
    params.set('dong', 'eq.'); // 구 합계 행만
  }
  const rows = await supabaseRequest('GET', `price_stats?${params}`);
  return rows ?? [];
}

/** 저장된 데이터의 마지막 갱신 시각 */
async function lastUpdated() {
  const rows = await supabaseRequest(
    'GET',
    'price_stats?select=updated_at&order=updated_at.desc&limit=1'
  );
  return rows?.[0]?.updated_at ?? null;
}

/* ── 수집 (하루 1회) ──────────────────────────── */

/**
 * 지정 월의 전 자치구 × 대상 유형을 수집해 저장한다.
 * 호출 수 = 자치구 83 × 유형 수(2) = 166회 (일 한도 1,000의 17%).
 *
 * @param {string} ym  'YYYYMM' (미지정 시 당월)
 */
async function refreshMonth(ym) {
  if (!isEnabled()) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  const targetYm = ym || recentMonths(1)[0];

  let apiCalls = 0;
  let allRows = [];

  // 공공 API에 한꺼번에 몰리지 않도록 유형별로 순차, 구는 소규모 병렬
  for (const type of STATS_TYPES) {
    for (let i = 0; i < DISTRICTS.length; i += 8) {
      const batch = DISTRICTS.slice(i, i + 8);
      const results = await Promise.all(
        batch.map(async (d) => {
          const items = await fetchRaw(d.code, targetYm, type);
          apiCalls++;
          const deals = normalizeAll(items, d.code, type);
          return aggregate(deals, { ym: targetYm, districtCode: d.code, propertyType: type });
        })
      );
      allRows.push(...results.flat());
    }
  }

  // Supabase 요청 크기 제한을 피하려 나눠 보낸다
  for (let i = 0; i < allRows.length; i += 500) {
    await upsertStats(allRows.slice(i, i + 500));
  }

  console.log(`[price-stats] ${targetYm} 수집 완료 — API ${apiCalls}회, ${allRows.length}행 저장`);
  return { ym: targetYm, apiCalls, rows: allRows.length };
}

module.exports = {
  aggregate, mergeRows, recentMonths,   // 순수함수
  isEnabled, readStats, lastUpdated, refreshMonth,
};
