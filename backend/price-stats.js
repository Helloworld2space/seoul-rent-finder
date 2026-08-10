const https = require('https');
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  STATS_TYPES,
  STATS_MONTHS,
  STATS_PARTS,
} = require('./config');
const { DISTRICTS } = require('./districts');
const { fetchRaw, failureStats } = require('./molit-client');
const { normalizeAll } = require('./normalize');

/**
 * "오늘의 전/월세 평균" 지역별 시세 집계.
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
      b = {
        jCount: 0, jDeposit: 0, wCount: 0, wDeposit: 0, wRent: 0,
        // 동네 성격용 — 면적·준공년도
        areaSum: 0, areaCount: 0, yearSum: 0, yearCount: 0,
      };
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
      if (d.area > 0) {
        b.areaSum += d.area;
        b.areaCount++;
      }
      // 준공년도는 일부 거래에 없다(약 2%) — 있는 것만 평균낸다
      if (d.buildYear > 0) {
        b.yearSum += d.buildYear;
        b.yearCount++;
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
    // 동네 성격용
    area_avg: b.areaCount > 0 ? Math.round((b.areaSum / b.areaCount) * 10) / 10 : 0,
    build_year_avg: avg(b.yearSum, b.yearCount),
    build_year_count: b.yearCount,
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
  let areaSum = 0, areaCount = 0, yearSum = 0, yearCount = 0;
  for (const r of rows) {
    jCount += r.jeonse_count;
    jDeposit += r.jeonse_avg_deposit * r.jeonse_count;
    wCount += r.wolse_count;
    wDeposit += r.wolse_avg_deposit * r.wolse_count;
    wRent += r.wolse_avg_rent * r.wolse_count;

    // 면적은 거래 건수로, 준공년도는 값이 있던 건수로 각각 가중한다
    const dealCount = r.jeonse_count + r.wolse_count;
    areaSum += (r.area_avg ?? 0) * dealCount;
    areaCount += (r.area_avg ?? 0) > 0 ? dealCount : 0;
    yearSum += (r.build_year_avg ?? 0) * (r.build_year_count ?? 0);
    yearCount += r.build_year_count ?? 0;
  }
  const avg = (sum, n) => (n > 0 ? Math.round(sum / n) : 0);
  return {
    jeonseCount: jCount,
    jeonseAvgDeposit: avg(jDeposit, jCount),
    wolseCount: wCount,
    wolseAvgDeposit: avg(wDeposit, wCount),
    wolseAvgRent: avg(wRent, wCount),
    areaAvg: areaCount > 0 ? Math.round((areaSum / areaCount) * 10) / 10 : 0,
    buildYearAvg: avg(yearSum, yearCount),
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
        // 한글이 청크 경계에서 잘려 깨지지 않도록 버퍼로 모아 한 번에 디코딩한다
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
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

/**
 * 이름이 깨진 행을 지운다.
 *
 * 과거에 응답 청크를 문자열로 이어붙여(=한글이 경계에서 잘려) 저장된 동 이름에는
 * U+FFFD(대체 문자)가 섞여 있다. dong이 기본키의 일부라 재수집 upsert로는
 * 덮어써지지 않고 잘못된 이름의 행이 그대로 남으므로 따로 지워야 한다.
 * 멱등하며, 정상 데이터에는 U+FFFD가 들어갈 수 없어 오삭제 위험이 없다.
 *
 * @returns {Promise<number>} 지운 행 수
 */
async function cleanupCorruptedNames() {
  const rows = await supabaseRequest(
    'DELETE',
    `price_stats?dong=like.*${encodeURIComponent('�')}*`,
    null,
    { Prefer: 'return=representation' }
  );
  return rows?.length ?? 0;
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

/**
 * 특정 월(+선택적으로 특정 자치구 묶음)의 마지막 갱신 시각. 중복 수집 방지용.
 * @param {string} ym
 * @param {string[]} [districtCodes]  주면 그 자치구들만 본다(분할 수집의 한 조각)
 */
async function lastUpdatedForYm(ym, districtCodes) {
  let path = `price_stats?select=updated_at&ym=eq.${encodeURIComponent(ym)}`;
  if (districtCodes?.length) {
    path += `&district_code=in.(${districtCodes.join(',')})`;
  }
  const rows = await supabaseRequest('GET', `${path}&order=updated_at.desc&limit=1`);
  return rows?.[0]?.updated_at ?? null;
}

/**
 * 분할 수집용 자치구 조각. 국토부 API가 느려(구 하나에 수 초) 83개를 한 번에
 * 처리하면 서버리스 실행 시간을 초과한다. 며칠에 걸쳐 한 바퀴 돈다.
 * @returns {{districts: object[], part: number, parts: number}}
 */
function districtSlice(part, parts = STATS_PARTS) {
  const p = Number.isInteger(part) ? ((part % parts) + parts) % parts : dayBasedPart(parts);
  const size = Math.ceil(DISTRICTS.length / parts);
  return { districts: DISTRICTS.slice(p * size, (p + 1) * size), part: p, parts };
}

/** 날짜에 따라 조각을 돌아가며 고른다(크론이 매일 다른 구간을 맡도록) */
function dayBasedPart(parts) {
  const daysSinceEpoch = Math.floor(Date.now() / 86400000);
  return daysSinceEpoch % parts;
}

/* ── 수집 (하루 1회) ──────────────────────────── */

/**
 * 지정 월의 전 자치구 × 대상 유형을 수집해 저장한다.
 * 호출 수 = 자치구 83 × 유형 수(2) = 166회 (일 한도 1,000의 17%).
 *
 * @param {string} ym  'YYYYMM' (미지정 시 당월)
 */
async function refreshMonth(ym, part) {
  if (!isEnabled()) throw new Error('SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  const targetYm = ym || recentMonths(1)[0];
  const slice = districtSlice(part);

  const failuresBefore = failureStats().count;
  let apiCalls = 0;
  let allRows = [];

  // 국토부 API가 느리므로 조각 안에서는 최대한 병렬로 (유형은 순차)
  for (const type of STATS_TYPES) {
    const results = await Promise.all(
      slice.districts.map(async (d) => {
        const items = await fetchRaw(d.code, targetYm, type);
        apiCalls++;
        const deals = normalizeAll(items, d.code, type);
        return aggregate(deals, { ym: targetYm, districtCode: d.code, propertyType: type });
      })
    );
    allRows.push(...results.flat());
  }

  // Supabase 요청 크기 제한을 피하려 나눠 보낸다
  for (let i = 0; i < allRows.length; i += 500) {
    await upsertStats(allRows.slice(i, i + 500));
  }

  console.log(
    `[price-stats] ${targetYm} ${slice.part + 1}/${slice.parts}조각 수집 완료 — API ${apiCalls}회, ${allRows.length}행 저장`
  );
  const f = failureStats();
  return {
    ym: targetYm,
    part: slice.part,
    parts: slice.parts,
    districts: slice.districts.length,
    apiCalls,
    rows: allRows.length,
    failures: f.count - failuresBefore,   // 0건일 때 "거래 없음"과 "API 실패"를 구분
    lastFailure: f.count > failuresBefore ? f.last : null,
  };
}

module.exports = {
  aggregate, mergeRows, recentMonths,   // 순수함수
  isEnabled, readStats, lastUpdated, lastUpdatedForYm, refreshMonth, districtSlice,
  cleanupCorruptedNames,
};
