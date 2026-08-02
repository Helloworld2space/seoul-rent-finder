const { Router } = require('express');
const { REGIONS, DISTRICTS, CODE_TO_POLYGON, POLYGON_TO_CODES } = require('./districts');
const { fetchRaw } = require('./molit-client');
const { normalizeAll, PROPERTY_TYPE_LABELS } = require('./normalize');
const broker = require('./broker-client');
const priceStats = require('./price-stats');
const { CRON_SECRET } = require('./config');

const router = Router();

// GET /api/districts — 지역(시·도) 목록과 구 목록(region 포함)
router.get('/districts', (_req, res) => {
  res.json({ regions: REGIONS, districts: DISTRICTS });
});

// GET /api/search?districts=11680,11650&months=3&types=apt,rh
router.get('/search', async (req, res) => {
  // 파라미터 파싱
  const districtCodes = parseDistricts(req.query.districts);
  const months = parseMonths(req.query.months);
  const types = parseTypes(req.query.types);

  if (months === null) {
    return res.status(400).json({ error: 'months는 1~12 사이 정수여야 합니다.' });
  }
  if (types === null) {
    return res.status(400).json({ error: `types는 ${Object.keys(PROPERTY_TYPE_LABELS).join(',')} 중에서 콤마로 지정하세요.` });
  }

  const monthList = recentMonths(months); // ["202406", "202405", ...]
  // 미지정 시 서울 전체 (기존 호환 — 프론트는 항상 명시적으로 보냄)
  const targets =
    districtCodes.length > 0
      ? districtCodes
      : DISTRICTS.filter((d) => d.region === 'seoul').map((d) => d.code);

  // 구 × 월 × 유형 조합 병렬 호출
  const tasks = targets.flatMap((code) =>
    monthList.flatMap((ym) =>
      types.map((type) =>
        fetchRaw(code, ym, type).then((items) => normalizeAll(items, code, type))
      )
    )
  );

  let results;
  try {
    const batches = await Promise.all(tasks);
    results = batches.flat();
  } catch (err) {
    console.error('[routes] /api/search 오류:', err.message);
    return res.status(502).json({ error: '공공 API 호출에 실패했습니다. 인증키를 확인하세요.' });
  }

  res.json({
    count: results.length,
    monthsQueried: monthList,
    typesQueried: types,
    results,
  });
});

// GET /api/brokers?district=11710&dong=마천동
// 해당 동의 영업중 중개업소 목록. 동에 결과가 없으면 같은 구 전체로 폴백.
router.get('/brokers', async (req, res) => {
  if (!broker.isEnabled()) {
    return res.status(503).json({
      error:
        '중개업소 조회가 비활성 상태입니다. data.seoul.go.kr에서 인증키를 발급받아 .env에 SEOUL_API_KEY로 추가하세요.',
    });
  }

  const code = String(req.query.district ?? '').trim();
  if (!DISTRICTS.some((d) => d.code === code)) {
    return res.status(400).json({ error: 'district는 유효한 자치구 코드여야 합니다.' });
  }
  const dong = String(req.query.dong ?? '').trim();

  let inDistrict;
  try {
    inDistrict = await broker.fetchBrokers(code);
  } catch (err) {
    console.error('[routes] /api/brokers 오류:', err.message);
    return res.status(502).json({ error: '중개업소 정보 조회에 실패했습니다.' });
  }

  const inDong = dong ? inDistrict.filter((b) => b.dong === dong) : [];
  const brokers = inDong.length > 0 ? inDong : inDistrict;

  res.json({
    count: brokers.length,
    scope: inDong.length > 0 ? 'dong' : 'district', // 폴백 여부 표시
    brokers,
  });
});

// GET /api/health — 배포·설정 진단용.
// 어떤 커밋이 돌고 있는지, 필요한 환경변수가 서버에 도달했는지만 알려준다.
// 값은 절대 노출하지 않고 설정 여부(true/false)만 응답한다.
router.get('/health', async (_req, res) => {
  const out = {
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    env: {
      SERVICE_KEY: Boolean(process.env.SERVICE_KEY),
      SEOUL_API_KEY: Boolean(process.env.SEOUL_API_KEY),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
    },
  };
  if (priceStats.isEnabled()) {
    try {
      await priceStats.lastUpdated();
      out.supabase = 'ok';
    } catch (err) {
      out.supabase = err.message.slice(0, 200);
    }
  }
  res.json(out);
});

// GET /api/prices              → 지도용: 폴리곤별 시세 (최근 3개월 누적)
// GET /api/prices?district=11440 → 그 구의 동별 시세
// 저장된 통계만 읽는다 — 공공 API를 호출하지 않으므로 쿼터와 무관하다.
router.get('/prices', async (req, res) => {
  if (!priceStats.isEnabled()) {
    return res.status(503).json({
      error: '시세 데이터가 아직 준비되지 않았습니다. 관리자 설정이 필요합니다.',
    });
  }

  const districtCode = String(req.query.district ?? '').trim();
  if (districtCode && !DISTRICTS.some((d) => d.code === districtCode)) {
    return res.status(400).json({ error: 'district는 유효한 자치구 코드여야 합니다.' });
  }

  try {
    const rows = await priceStats.readStats(districtCode ? { districtCode } : {});

    if (districtCode) {
      // 동별: 같은 동의 여러 월·유형을 하나로 합친다
      const byDong = new Map();
      for (const r of rows) {
        if (!byDong.has(r.dong)) byDong.set(r.dong, []);
        byDong.get(r.dong).push(r);
      }
      const dongs = [...byDong.entries()]
        .map(([dong, rs]) => ({ dong, ...priceStats.mergeRows(rs) }))
        .filter((d) => d.jeonseCount + d.wolseCount > 0)
        .sort((a, b) => b.jeonseCount + b.wolseCount - (a.jeonseCount + a.wolseCount));
      return res.json({ district: districtCode, dongs });
    }

    // 지도용: 자치구 → 폴리곤으로 접어서 내려준다.
    // (부천 3구·화성 4구처럼 여러 구가 한 폴리곤을 쓰면 건수 가중으로 합쳐진다)
    const byPolygon = new Map();
    for (const r of rows) {
      const poly = CODE_TO_POLYGON[r.district_code];
      if (!poly) continue;
      if (!byPolygon.has(poly)) byPolygon.set(poly, []);
      byPolygon.get(poly).push(r);
    }
    const polygons = [...byPolygon.entries()].map(([id, rs]) => ({
      id,
      districtCodes: POLYGON_TO_CODES[id] ?? [],
      ...priceStats.mergeRows(rs),
    }));

    res.json({ polygons, updatedAt: await priceStats.lastUpdated() });
  } catch (err) {
    console.error('[routes] /api/prices 오류:', err.message);
    res.status(502).json({ error: '시세 데이터를 불러오지 못했습니다.' });
  }
});

// GET /api/cron/refresh-prices — 하루 1회 시세 수집 (Vercel Cron 전용)
// 공공 API를 166회 호출하므로 아무나 부르지 못하게 CRON_SECRET으로 막는다.
// 보호 방식 두 가지 —
//  ① CRON_SECRET이 설정돼 있으면 그 값을 요구한다(권장. Vercel Cron이 자동으로 붙여준다).
//  ② 설정돼 있지 않으면 열어두되, 같은 월을 12시간 안에 다시 수집하지 않도록 막는다.
//     환경변수가 빠져도 일일 갱신이 멈추지 않게 하기 위함이며, 최악의 경우에도
//     외부인이 할 수 있는 일은 "하루 한 번 공개 통계 갱신"뿐이라 피해가 없다.
const REFRESH_THROTTLE_MS = 12 * 60 * 60 * 1000;

router.get('/cron/refresh-prices', async (req, res) => {
  if (CRON_SECRET) {
    const auth = req.get('authorization') ?? '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: '인증 실패' });
    }
  }
  if (!priceStats.isEnabled()) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.' });
  }

  // ?ym=202605 로 과거 월 백필 가능 (미지정 시 당월)
  const ym = String(req.query.ym ?? '').trim();
  if (ym && !/^\d{6}$/.test(ym)) {
    return res.status(400).json({ error: 'ym은 YYYYMM 형식이어야 합니다.' });
  }
  const targetYm = ym || priceStats.recentMonths(1)[0];

  // ?part=0..3 으로 조각 지정 가능 (미지정 시 날짜에 따라 자동 선택)
  const rawPart = req.query.part;
  const part = rawPart === undefined ? undefined : Number(rawPart);
  if (part !== undefined && !Number.isInteger(part)) {
    return res.status(400).json({ error: 'part는 정수여야 합니다.' });
  }

  try {
    if (!CRON_SECRET) {
      // 조각 단위로 판정해야 백필(조각 0→1→2→3 연속 호출)이 막히지 않는다
      const slice = priceStats.districtSlice(part);
      const last = await priceStats.lastUpdatedForYm(
        targetYm,
        slice.districts.map((d) => d.code)
      );
      if (last && Date.now() - new Date(last).getTime() < REFRESH_THROTTLE_MS) {
        return res.json({
          ym: targetYm, part: slice.part, skipped: true,
          reason: '12시간 내 이미 수집됨', lastUpdated: last,
        });
      }
    }
    res.json(await priceStats.refreshMonth(targetYm, part));
  } catch (err) {
    console.error('[routes] /api/cron/refresh-prices 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 쿼리스트링 districts 파싱.
 * "11680,11650" → ["11680","11650"]
 * 유효하지 않은 코드는 걸러낸다.
 */
function parseDistricts(raw) {
  if (!raw) return [];
  const validCodes = new Set(DISTRICTS.map((d) => d.code));
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((c) => validCodes.has(c));
}

/**
 * types 쿼리 파싱. "apt,rh" → ["apt","rh"]. 미지정 시 ["apt"](기존 호환).
 * 허용값 밖이 섞여 있으면 null 반환.
 */
function parseTypes(raw) {
  if (!raw) return ['apt'];
  const valid = new Set(Object.keys(PROPERTY_TYPE_LABELS));
  const types = [...new Set(String(raw).split(',').map((s) => s.trim()).filter(Boolean))];
  if (types.length === 0 || types.some((t) => !valid.has(t))) return null;
  return types;
}

/**
 * months 쿼리 파싱. 1~12 범위가 아니면 null 반환.
 */
function parseMonths(raw) {
  const n = parseInt(raw ?? '3', 10);
  if (isNaN(n) || n < 1 || n > 12) return null;
  return n;
}

/**
 * 오늘 기준으로 최근 n개월의 "YYYYMM" 배열 반환.
 * 예) n=3, 오늘=2024-04 → ["202404","202403","202402"]
 */
function recentMonths(n) {
  const result = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym =
      String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
    result.push(ym);
  }
  return result;
}

module.exports = router;
