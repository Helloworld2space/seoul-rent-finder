const https = require('https');
const http = require('http');
const { SERVICE_KEY, MOLIT_BASE_URL, PAGE_SIZE } = require('./config');

/**
 * 국토부 아파트 전월세 실거래가 API에서 한 (구, 월) 조합의 데이터를 모두 가져온다.
 * 페이지네이션을 처리해 전체 item[]을 반환.
 *
 * @param {string} lawdCd   법정동코드 앞 5자리 (예: "11680")
 * @param {string} ym       조회 연월 "YYYYMM" (예: "202403")
 * @returns {Promise<object[]>}  원본 item 배열. 실패 시 [] 반환(부분실패 격리).
 */
async function fetchRaw(lawdCd, ym) {
  const items = [];
  let pageNo = 1;

  while (true) {
    const url = buildUrl(lawdCd, ym, pageNo);
    let data;
    try {
      data = await getJson(url);
    } catch (err) {
      console.error(`[molit] 호출 실패 lawdCd=${lawdCd} ym=${ym} page=${pageNo}:`, err.message);
      break; // 부분실패 격리
    }

    const body = data?.response?.body;
    if (!body) {
      console.error(`[molit] 응답 형식 오류 lawdCd=${lawdCd} ym=${ym}`, JSON.stringify(data).slice(0, 200));
      break;
    }

    // 인증 오류 감지 (성공 코드: "00", "000", "0000")
    const header = data?.response?.header;
    const code = String(header?.resultCode ?? '');
    const isSuccess = !code || /^0+$/.test(code); // "00", "000", "0000", "" 모두 성공
    if (!isSuccess) {
      throw new Error(`공공 API 오류 [${code}]: ${header.resultMsg}`);
    }

    const rawItems = toArray(body?.items?.item);
    items.push(...rawItems);

    const totalCount = parseInt(body.totalCount ?? '0', 10);
    if (items.length >= totalCount || rawItems.length === 0) break;
    pageNo++;
  }

  return items;
}

function buildUrl(lawdCd, ym, pageNo) {
  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    LAWD_CD: lawdCd,
    DEAL_YMD: ym,
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
  });
  return `${MOLIT_BASE_URL}?${params.toString()}`;
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

module.exports = { fetchRaw };
