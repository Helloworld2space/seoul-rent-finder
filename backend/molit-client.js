const https = require('https');
const http = require('http');
const {
  SERVICE_KEY,
  MOLIT_ENDPOINTS,
  PAGE_SIZE,
  MOLIT_CACHE_TTL_CURRENT_MS,
  MOLIT_CACHE_TTL_PAST_MS,
} = require('./config');

// (type:lawdCd:ym) → { items, fetchedAt } — 일 1,000건 쿼터 보호용 캐시
const cache = new Map();

// 호출 실패 누적 횟수. 부분실패를 조용히 삼키는 구조라, 수집 결과가 0건일 때
// "거래가 없음"인지 "API가 죽었음"인지 구분할 단서가 필요하다.
let failureCount = 0;
let lastFailure = null;

/** 실패 통계 스냅샷 (수집 결과 진단용) */
function failureStats() {
  return { count: failureCount, last: lastFailure };
}

/**
 * 국토부 전월세 실거래가 API에서 한 (유형, 구, 월) 조합의 데이터를 모두 가져온다.
 * 페이지네이션을 처리해 전체 item[]을 반환. 결과는 TTL 동안 메모리 캐시.
 *
 * @param {string} lawdCd   법정동코드 앞 5자리 (예: "11680")
 * @param {string} ym       조회 연월 "YYYYMM" (예: "202403")
 * @param {string} type     'apt' | 'rh' | 'sh' | 'offi' (기본 'apt')
 * @returns {Promise<object[]>}  원본 item 배열. 실패 시 [] 반환(부분실패 격리).
 */
async function fetchRaw(lawdCd, ym, type = 'apt') {
  const key = `${type}:${lawdCd}:${ym}`;
  const ttl = ym === currentYm() ? MOLIT_CACHE_TTL_CURRENT_MS : MOLIT_CACHE_TTL_PAST_MS;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) return hit.items;

  const items = [];
  let pageNo = 1;
  let failed = false; // 오류로 중단된 부분 결과는 캐시하지 않는다

  while (true) {
    const url = buildUrl(lawdCd, ym, pageNo, type);
    let data;
    try {
      data = await getJson(url);
    } catch (err) {
      console.error(`[molit] 호출 실패 type=${type} lawdCd=${lawdCd} ym=${ym} page=${pageNo}:`, err.message);
      failureCount++;
      lastFailure = `${type}/${lawdCd}/${ym}: ${err.message}`;
      failed = true;
      break; // 부분실패 격리 (미승인 유형의 HTTP 403 포함)
    }

    const body = data?.response?.body;
    if (!body) {
      console.error(`[molit] 응답 형식 오류 type=${type} lawdCd=${lawdCd} ym=${ym}`, JSON.stringify(data).slice(0, 200));
      failureCount++;
      lastFailure = `${type}/${lawdCd}/${ym}: 응답 형식 오류`;
      failed = true;
      break;
    }

    // 인증 오류 감지 (성공 코드: "00", "000", "0000")
    const header = data?.response?.header;
    const code = String(header?.resultCode ?? '');
    const isSuccess = !code || /^0+$/.test(code); // "00", "000", "0000", "" 모두 성공
    if (!isSuccess) {
      // apt는 키 자체의 문제이므로 상위에서 502 처리하도록 throw.
      // 그 외 유형은 활용신청 미승인일 수 있어 격리 — 한 유형이 전체 검색을 죽이지 않게.
      if (type === 'apt') {
        throw new Error(`공공 API 오류 [${code}]: ${header.resultMsg}`);
      }
      console.warn(`[molit] ${type} 유형 API 오류 [${code}] ${header.resultMsg} — 활용신청 여부를 확인하세요. 빈 결과로 처리.`);
      failureCount++;
      lastFailure = `${type}/${lawdCd}/${ym}: [${code}] ${header.resultMsg}`;
      failed = true;
      break;
    }

    const rawItems = toArray(body?.items?.item);
    items.push(...rawItems);

    const totalCount = parseInt(body.totalCount ?? '0', 10);
    if (items.length >= totalCount || rawItems.length === 0) break;
    pageNo++;
  }

  if (!failed) cache.set(key, { items, fetchedAt: Date.now() });
  return items;
}

function currentYm() {
  const now = new Date();
  return String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0');
}

function buildUrl(lawdCd, ym, pageNo, type) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    LAWD_CD: lawdCd,
    DEAL_YMD: ym,
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
  });
  return `${MOLIT_ENDPOINTS[type]}?${params.toString()}`;
}

/** XML 응답을 JSON으로 변환 없이 호출 — API가 JSON 옵션을 지원하면 그대로 사용 */
function getJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, { headers: { Accept: 'application/json' } }, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          // HTTP 오류 상태 코드 처리
          if (res.statusCode >= 400) {
            console.error(`[molit] HTTP ${res.statusCode} 오류. 응답:`, raw.slice(0, 300));
            return reject(new Error(`공공 API HTTP 오류 ${res.statusCode}: 인증키를 확인하거나 잠시 후 재시도하세요.`));
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            // JSON 파싱 실패 → XML 응답
            if (process.env.DEBUG_API) {
              console.log('[molit] XML 원본(앞 500자):', raw.slice(0, 500));
            }
            // HTML 오류 페이지 감지
            if (raw.trim().startsWith('<HTML') || raw.trim().startsWith('<!DOCTYPE')) {
              return reject(new Error('공공 API가 HTML 오류 페이지를 반환했습니다. 인증키가 아직 활성화되지 않았거나 잘못된 키일 수 있습니다.'));
            }
            resolve(parseXmlFallback(raw));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * 공공 API가 XML을 내려줄 때 최소한의 파싱.
 * 정규식 기반으로 item 리스트를 추출한다.
 */
function parseXmlFallback(xml) {
  // resultCode / resultMsg
  const resultCode = xmlTag(xml, 'resultCode');
  const resultMsg = xmlTag(xml, 'resultMsg');
  const totalCount = xmlTag(xml, 'totalCount') ?? '0';

  // <item>...</item> 목록 추출
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const items = itemMatches.map((m) => xmlItemToObject(m[1]));

  return {
    response: {
      header: { resultCode: resultCode ?? '00', resultMsg: resultMsg ?? 'OK' },
      body: {
        totalCount,
        items: { item: items },
      },
    },
  };
}

function xmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
  return m ? m[1].trim() : null;
}

function xmlItemToObject(itemXml) {
  const obj = {};
  for (const [, tag, value] of itemXml.matchAll(/<([^>]+)>([^<]*)<\/[^>]+>/g)) {
    obj[tag.trim()] = value.trim();
  }
  return obj;
}

/** item 또는 item[] 모두를 배열로 정규화 */
function toArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

module.exports = { fetchRaw, failureStats };
