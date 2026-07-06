const { Router } = require('express');
const { DISTRICTS } = require('./districts');
const { fetchRaw } = require('./molit-client');
const { normalizeAll } = require('./normalize');
const broker = require('./broker-client');

const router = Router();

// GET /api/districts
router.get('/districts', (_req, res) => {
  res.json(DISTRICTS);
});

// GET /api/search?districts=11680,11650&months=3
router.get('/search', async (req, res) => {
  // 파라미터 파싱
  const districtCodes = parseDistricts(req.query.districts);
  const months = parseMonths(req.query.months);

  if (months === null) {
    return res.status(400).json({ error: 'months는 1~12 사이 정수여야 합니다.' });
  }

  const monthList = recentMonths(months); // ["202406", "202405", ...]
  const targets = districtCodes.length > 0 ? districtCodes : DISTRICTS.map((d) => d.code);

  // 구 × 월 조합 병렬 호출
  const tasks = targets.flatMap((code) =>
    monthList.map((ym) => fetchRaw(code, ym).then((items) => normalizeAll(items, code)))
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
