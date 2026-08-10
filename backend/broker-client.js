const http = require('http');
const {
  SEOUL_API_KEY,
  SEOUL_BROKER_BASE_URL,
  SEOUL_BROKER_SERVICE,
  BROKER_PAGE_SIZE,
  BROKER_CACHE_TTL_MS,
} = require('./config');

/**
 * 서울 열린데이터광장 「서울시 부동산 중개업소 정보」(landBizInfo) 클라이언트.
 * ★ 이 API를 아는 유일한 모듈 (molit-client.js의 형제).
 *
 * API가 구·동 필터를 지원하지 않아(위치 파라미터 1번 = 등록번호 전용)
 * 서울 전체를 한 번 수집한 뒤 메모리에 캐시하고, 필터는 호출부에서 한다.
 */

/** Broker — 중개업소 데이터 계약 */
// {
//   name      string  상호            예: "반석공인중개사사무소"
//   agentName string  대표(중개업자)  예: "조성수"
//   phone     string  전화번호        예: "02-407-6677" ("" 가능)
//   address   string  도로명 주소
//   sggCode   string  자치구 코드(법정동코드 앞 5자리) — districts.js와 동일 체계
//   dong      string  법정동명        예: "마천동"
// }

let cache = { rows: null, fetchedAt: 0, pending: null };

/**
 * 지정한 자치구의 영업중 중개업소 목록을 반환한다.
 * 전체 데이터는 TTL 동안 메모리 캐시. 동시 요청은 한 번의 수집을 공유한다.
 *
 * @param {string} sggCode  법정동코드 앞 5자리 (예: "11680")
 * @returns {Promise<Broker[]>}
 */
async function fetchBrokers(sggCode) {
  if (!SEOUL_API_KEY) {
    throw new Error('SEOUL_API_KEY가 설정되지 않았습니다.');
  }
  const all = await loadAll();
  return all.filter((b) => b.sggCode === sggCode);
}

async function loadAll() {
  const fresh = cache.rows && Date.now() - cache.fetchedAt < BROKER_CACHE_TTL_MS;
  if (fresh) return cache.rows;
  if (cache.pending) return cache.pending;

  cache.pending = fetchAllPages()
    .then((rows) => {
      cache = { rows, fetchedAt: Date.now(), pending: null };
      return rows;
    })
    .catch((err) => {
      cache.pending = null;
      throw err;
    });
  return cache.pending;
}

async function fetchAllPages() {
  // 1건 조회로 전체 건수 파악 후 나머지 페이지 병렬 수집
  const first = await getPage(1, 1);
  const total = first.total;
  if (total === 0) return [];

  const pageCount = Math.ceil(total / BROKER_PAGE_SIZE);
  const tasks = [];
  for (let i = 0; i < pageCount; i++) {
    const start = i * BROKER_PAGE_SIZE + 1;
    const end = Math.min((i + 1) * BROKER_PAGE_SIZE, total);
    tasks.push(getPage(start, end).then((p) => p.rows));
  }
  const pages = await Promise.all(tasks);
  const brokers = pages.flat().map(normalizeBroker).filter(Boolean);
  console.log(`[broker] 서울 전체 중개업소 ${brokers.length}건 수집 완료 (원본 ${total}건)`);
  return brokers;
}

/** start~end 범위 한 페이지 조회 → { total, rows } */
function getPage(start, end) {
  const url = `${SEOUL_BROKER_BASE_URL}/${encodeURIComponent(SEOUL_API_KEY)}/json/${SEOUL_BROKER_SERVICE}/${start}/${end}/`;
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        // 한글이 청크 경계에서 잘려 깨지지 않도록 버퍼로 모아 한 번에 디코딩한다
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            return reject(new Error(`서울 열린데이터 HTTP 오류 ${res.statusCode}`));
          }
          let data;
          try {
            data = JSON.parse(raw);
          } catch {
            return reject(new Error('서울 열린데이터 응답 파싱 실패: ' + raw.slice(0, 200)));
          }
          const svc = data[SEOUL_BROKER_SERVICE];
          if (!svc) {
            // 인증 오류 등은 최상위 RESULT로 온다
            const msg = data?.RESULT?.MESSAGE ?? JSON.stringify(data).slice(0, 200);
            return reject(new Error(`서울 열린데이터 오류: ${msg}`));
          }
          resolve({
            total: parseInt(svc.list_total_count ?? '0', 10),
            rows: svc.row ?? [],
          });
        });
      })
      .on('error', reject);
  });
}

/**
 * 원본 row → Broker. 영업중이 아니거나 상호가 없으면 null.
 * 순수함수 — 단위 테스트 대상.
 */
function normalizeBroker(row) {
  try {
    const status = String(row['STTS_SE'] ?? '').trim();
    if (status !== '영업중') return null;

    const name = String(row['BZMN_CONM'] ?? '').trim();
    if (!name) return null;

    return {
      name,
      agentName: String(row['MDT_BSNS_NM'] ?? '').trim(),
      phone: String(row['TELNO'] ?? '').trim(),
      address: String(row['ADDR'] ?? '').trim(),
      sggCode: String(row['SGG_CD'] ?? '').trim(),
      dong: String(row['LGL_DONG_NM'] ?? '').trim(),
    };
  } catch {
    return null;
  }
}

/** 기능 활성 여부 — 라우트에서 503 분기용 */
function isEnabled() {
  return Boolean(SEOUL_API_KEY);
}

module.exports = { fetchBrokers, normalizeBroker, isEnabled };
