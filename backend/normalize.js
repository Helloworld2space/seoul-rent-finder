const { CODE_TO_NAME } = require('./districts');

// 유형 코드 → 표시명. molit-client의 MOLIT_ENDPOINTS 키와 동일 체계.
const PROPERTY_TYPE_LABELS = {
  apt: '아파트',
  rh: '연립다세대',
  sh: '단독다가구',
  offi: '오피스텔',
};

/**
 * 공공 API 원본 item 하나를 RentDeal로 변환한다.
 * 순수함수 — 외부 상태 없음.
 *
 * 유형별 필드 차이(rh/sh/offi는 활용신청 승인 후 실응답으로 검증 필요):
 *  - apt: aptNm / excluUseAr / floor
 *  - rh(연립다세대): mhouseNm / excluUseAr / floor
 *  - sh(단독다가구): 건물명·층 미제공 / totalFloorAr(계약면적)
 *  - offi(오피스텔): offiNm / excluUseAr / floor
 *
 * @param {object} item  공공 API 응답의 item 객체
 * @param {string} lawdCd  법정동코드 앞 5자리 (district 식별용)
 * @param {string} type  'apt' | 'rh' | 'sh' | 'offi' (기본 'apt')
 * @returns {RentDeal|null}  변환 실패 시 null
 */
function normalize(item, lawdCd, type = 'apt') {
  try {
    // 보증금: "20,000" 형태 → 숫자
    const deposit = parseAmount(item['보증금액'] ?? item['deposit'] ?? '0');
    const monthlyRent = parseAmount(
      item['월세금액'] ?? item['monthlyRent'] ?? '0'
    );

    // 면적: sh는 전용면적 대신 계약면적(totalFloorAr)
    const area = parseFloat(
      item['전용면적'] ?? item['excluUseAr'] ?? item['계약면적'] ?? item['totalFloorAr'] ?? '0'
    );

    // 층 (sh는 미제공 → 0)
    const floor = parseInt(item['층'] ?? item['floor'] ?? '0', 10);

    // 건축년도
    const buildYear = parseInt(
      item['건축년도'] ?? item['buildYear'] ?? '0',
      10
    );

    // 계약일: 년(4) + 월(2) + 일(2)
    const year = String(item['년'] ?? item['dealYear'] ?? '').trim();
    const month = String(item['월'] ?? item['dealMonth'] ?? '').trim().padStart(2, '0');
    const day = String(item['일'] ?? item['dealDay'] ?? '').trim().padStart(2, '0');
    const dealDate = year && month && day ? `${year}-${month}-${day}` : '';

    // 갱신 여부
    const rawType = item['계약구분'] ?? item['contractType'] ?? '';
    const contractType = rawType.includes('갱신') ? '갱신' : rawType.includes('신규') ? '신규' : undefined;

    const dong = String(item['법정동'] ?? item['dong'] ?? item['umdNm'] ?? '').trim();

    // 건물명: 유형별 필드 흡수. sh는 건물명이 없어 유형명으로 대체.
    const rawName = String(
      item['아파트'] ?? item['aptNm'] ??
      item['연립다세대'] ?? item['mhouseNm'] ??
      item['오피스텔'] ?? item['offiNm'] ?? ''
    ).trim();
    const aptName = type === 'sh' ? (rawName || '단독/다가구') : rawName;

    const district = CODE_TO_NAME[lawdCd] ?? lawdCd;

    if (!aptName || area <= 0 || deposit < 0) return null;

    return {
      district,
      dong,
      aptName,
      propertyType: PROPERTY_TYPE_LABELS[type] ?? type,
      rentType: monthlyRent > 0 ? '월세' : '전세',
      deposit,
      monthlyRent,
      area: Math.round(area * 100) / 100,
      pyeong: Math.round((area / 3.305785) * 10) / 10,
      floor,
      buildYear,
      dealDate,
      ...(contractType ? { contractType } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * "20,000" 또는 "20000" 형태의 금액 문자열을 숫자(만원)로 변환.
 */
function parseAmount(raw) {
  if (typeof raw === 'number') return raw;
  return parseInt(String(raw).replace(/,/g, '').trim(), 10) || 0;
}

/**
 * item 배열 전체를 RentDeal[]로 변환. null은 제거.
 */
function normalizeAll(items, lawdCd, type = 'apt') {
  return items.map((item) => normalize(item, lawdCd, type)).filter(Boolean);
}

module.exports = { normalize, normalizeAll, parseAmount, PROPERTY_TYPE_LABELS };
