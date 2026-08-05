// 수도권 시·도(지역)와 법정동코드 앞 5자리 매핑. 데이터만, 로직 없음.
// 출처: 행정안전부 법정동코드 + 국토부 실거래가 API 실호출 전수 검증(2026-07-09)
//  - 화성시: 2026-02 만세·효행·병점·동탄 4개 구 신설 반영 (41590 폐기)
//  - 인천: 2026-07-01 개편 반영 — 중·동구 → 제물포구, 중구 섬 → 영종구,
//    서구 → 서해구(남부)+검단구(북부). 구 코드(28110/28140/28260) 폐기.
const REGIONS = [
  { id: 'seoul', name: '서울' },
  { id: 'gyeonggi', name: '경기' },
  { id: 'incheon', name: '인천' },
];

const DISTRICTS = [
  // ── 서울 25구 ──
  { code: '11110', name: '종로구', region: 'seoul' },
  { code: '11140', name: '중구', region: 'seoul' },
  { code: '11170', name: '용산구', region: 'seoul' },
  { code: '11200', name: '성동구', region: 'seoul' },
  { code: '11215', name: '광진구', region: 'seoul' },
  { code: '11230', name: '동대문구', region: 'seoul' },
  { code: '11260', name: '중랑구', region: 'seoul' },
  { code: '11290', name: '성북구', region: 'seoul' },
  { code: '11305', name: '강북구', region: 'seoul' },
  { code: '11320', name: '도봉구', region: 'seoul' },
  { code: '11350', name: '노원구', region: 'seoul' },
  { code: '11380', name: '은평구', region: 'seoul' },
  { code: '11410', name: '서대문구', region: 'seoul' },
  { code: '11440', name: '마포구', region: 'seoul' },
  { code: '11470', name: '양천구', region: 'seoul' },
  { code: '11500', name: '강서구', region: 'seoul' },
  { code: '11530', name: '구로구', region: 'seoul' },
  { code: '11545', name: '금천구', region: 'seoul' },
  { code: '11560', name: '영등포구', region: 'seoul' },
  { code: '11590', name: '동작구', region: 'seoul' },
  { code: '11620', name: '관악구', region: 'seoul' },
  { code: '11650', name: '서초구', region: 'seoul' },
  { code: '11680', name: '강남구', region: 'seoul' },
  { code: '11710', name: '송파구', region: 'seoul' },
  { code: '11740', name: '강동구', region: 'seoul' },

  // ── 경기 (47) ──
  { code: '41111', name: '수원시 장안구', region: 'gyeonggi' },
  { code: '41113', name: '수원시 권선구', region: 'gyeonggi' },
  { code: '41115', name: '수원시 팔달구', region: 'gyeonggi' },
  { code: '41117', name: '수원시 영통구', region: 'gyeonggi' },
  { code: '41131', name: '성남시 수정구', region: 'gyeonggi' },
  { code: '41133', name: '성남시 중원구', region: 'gyeonggi' },
  { code: '41135', name: '성남시 분당구', region: 'gyeonggi' },
  { code: '41150', name: '의정부시', region: 'gyeonggi' },
  { code: '41171', name: '안양시 만안구', region: 'gyeonggi' },
  { code: '41173', name: '안양시 동안구', region: 'gyeonggi' },
  { code: '41192', name: '부천시 원미구', region: 'gyeonggi' },
  { code: '41194', name: '부천시 소사구', region: 'gyeonggi' },
  { code: '41196', name: '부천시 오정구', region: 'gyeonggi' },
  { code: '41210', name: '광명시', region: 'gyeonggi' },
  { code: '41220', name: '평택시', region: 'gyeonggi' },
  { code: '41250', name: '동두천시', region: 'gyeonggi' },
  { code: '41271', name: '안산시 상록구', region: 'gyeonggi' },
  { code: '41273', name: '안산시 단원구', region: 'gyeonggi' },
  { code: '41281', name: '고양시 덕양구', region: 'gyeonggi' },
  { code: '41285', name: '고양시 일산동구', region: 'gyeonggi' },
  { code: '41287', name: '고양시 일산서구', region: 'gyeonggi' },
  { code: '41290', name: '과천시', region: 'gyeonggi' },
  { code: '41310', name: '구리시', region: 'gyeonggi' },
  { code: '41360', name: '남양주시', region: 'gyeonggi' },
  { code: '41370', name: '오산시', region: 'gyeonggi' },
  { code: '41390', name: '시흥시', region: 'gyeonggi' },
  { code: '41410', name: '군포시', region: 'gyeonggi' },
  { code: '41430', name: '의왕시', region: 'gyeonggi' },
  { code: '41450', name: '하남시', region: 'gyeonggi' },
  { code: '41461', name: '용인시 처인구', region: 'gyeonggi' },
  { code: '41463', name: '용인시 기흥구', region: 'gyeonggi' },
  { code: '41465', name: '용인시 수지구', region: 'gyeonggi' },
  { code: '41480', name: '파주시', region: 'gyeonggi' },
  { code: '41500', name: '이천시', region: 'gyeonggi' },
  { code: '41550', name: '안성시', region: 'gyeonggi' },
  { code: '41570', name: '김포시', region: 'gyeonggi' },
  { code: '41591', name: '화성시 만세구', region: 'gyeonggi' },
  { code: '41593', name: '화성시 효행구', region: 'gyeonggi' },
  { code: '41595', name: '화성시 병점구', region: 'gyeonggi' },
  { code: '41597', name: '화성시 동탄구', region: 'gyeonggi' },
  { code: '41610', name: '광주시', region: 'gyeonggi' },
  { code: '41630', name: '양주시', region: 'gyeonggi' },
  { code: '41650', name: '포천시', region: 'gyeonggi' },
  { code: '41670', name: '여주시', region: 'gyeonggi' },
  { code: '41800', name: '연천군', region: 'gyeonggi' },
  { code: '41820', name: '가평군', region: 'gyeonggi' },
  { code: '41830', name: '양평군', region: 'gyeonggi' },

  // ── 인천 (11) ──
  { code: '28125', name: '인천 제물포구', region: 'incheon' },
  { code: '28155', name: '인천 영종구', region: 'incheon' },
  { code: '28177', name: '인천 미추홀구', region: 'incheon' },
  { code: '28185', name: '인천 연수구', region: 'incheon' },
  { code: '28200', name: '인천 남동구', region: 'incheon' },
  { code: '28237', name: '인천 부평구', region: 'incheon' },
  { code: '28245', name: '인천 계양구', region: 'incheon' },
  { code: '28275', name: '인천 서해구', region: 'incheon' },
  { code: '28290', name: '인천 검단구', region: 'incheon' },
  { code: '28710', name: '인천 강화군', region: 'incheon' },
  { code: '28720', name: '인천 옹진군', region: 'incheon' },
];

// code → name / region 빠른 조회용
const CODE_TO_NAME = Object.fromEntries(DISTRICTS.map((d) => [d.code, d.name]));
const CODE_TO_REGION = Object.fromEntries(DISTRICTS.map((d) => [d.code, d.region]));

/**
 * 법정동코드 → 지도 폴리곤 ID(통계청 코드) 매핑.
 * 지도 경계는 통계청 2018년 자료라 코드 체계가 다르고(종로구: 11110 vs 11010),
 * 2026년 개편으로 신설된 구는 아직 폴리곤이 없다. 아래 3가지 방식으로 잇는다.
 *   ① 1:1 대응 (72개) — 이름이 같은 구
 *   ② 여러 구 → 한 폴리곤: 화성 4구→화성시, 부천 3구→부천시 (표시할 땐 건수 가중평균)
 *   ③ 근사 대응: 인천 개편분 — 제물포구→동구, 영종구→중구, 서해구·검단구→서구
 * ②③은 지도에서 근사임을 각주로 밝힌다.
 */
const CODE_TO_POLYGON = {
  // ── 서울 25구 (1:1) ──
  11110: '11010', 11140: '11020', 11170: '11030', 11200: '11040', 11215: '11050',
  11230: '11060', 11260: '11070', 11290: '11080', 11305: '11090', 11320: '11100',
  11350: '11110', 11380: '11120', 11410: '11130', 11440: '11140', 11470: '11150',
  11500: '11160', 11530: '11170', 11545: '11180', 11560: '11190', 11590: '11200',
  11620: '11210', 11650: '11220', 11680: '11230', 11710: '11240', 11740: '11250',

  // ── 경기 (1:1) ──
  41111: '31011', 41113: '31012', 41115: '31013', 41117: '31014',
  41131: '31021', 41133: '31022', 41135: '31023',
  41150: '31030', 41171: '31041', 41173: '31042',
  41210: '31060', 41220: '31070', 41250: '31080',
  41271: '31091', 41273: '31092',
  41281: '31101', 41285: '31103', 41287: '31104',
  41290: '31110', 41310: '31120', 41360: '31130', 41370: '31140',
  41390: '31150', 41410: '31160', 41430: '31170', 41450: '31180',
  41461: '31191', 41463: '31192', 41465: '31193',
  41480: '31200', 41500: '31210', 41550: '31220', 41570: '31230',
  41610: '31250', 41630: '31260', 41650: '31270', 41670: '31280',
  41800: '31350', 41820: '31370', 41830: '31380',
  // 경기 ② 여러 구 → 한 폴리곤
  41192: '31050', 41194: '31050', 41196: '31050',                  // 부천 3구 → 부천시
  41591: '31240', 41593: '31240', 41595: '31240', 41597: '31240',  // 화성 4구 → 화성시

  // ── 인천 (1:1) ──
  28177: '23030', 28185: '23040', 28200: '23050', 28237: '23060', 28245: '23070',
  28710: '23310', 28720: '23320',
  // 인천 ③ 2026 개편 근사
  28125: '23020', // 제물포구 ← 옛 동구
  28155: '23010', // 영종구   ← 옛 중구
  28275: '23080', // 서해구   ← 옛 서구
  28290: '23080', // 검단구   ← 옛 서구
};

/** 여러 자치구가 한 폴리곤을 공유하는지 (지도 각주·가중평균 판단용) */
const POLYGON_TO_CODES = Object.entries(CODE_TO_POLYGON).reduce((acc, [code, poly]) => {
  (acc[poly] ??= []).push(code);
  return acc;
}, {});

/**
 * 지도 폴리곤에 표시할 지역명.
 * 통계청 2018년 원본 이름을 그대로 쓰면 실제와 어긋난다 —
 * 인천은 시 이름이 없어 서울 중구와 구분되지 않고(둘 다 "중구"),
 * 2026 개편분은 폐지된 옛 이름이며(동구→제물포구), 경기는 띄어쓰기가 없다(수원시장안구).
 * 그래서 앱이 관리하는 정식 이름(DISTRICTS)에서 만들어 쓴다.
 *
 * 한 폴리곤에 여러 자치구가 묶인 경우(부천 3구, 화성 4구 등)는 묶어서 표기한다.
 * @param {string} polygonId  통계청 코드
 * @returns {string}
 */
function polygonLabel(polygonId) {
  const names = (POLYGON_TO_CODES[polygonId] ?? []).map((c) => CODE_TO_NAME[c]).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];

  const heads = names.map((n) => n.split(' ')[0]);
  const sameHead = heads.every((h) => h === heads[0]);
  // 부천시 원미/소사/오정구, 화성시 만세/효행/… → 폴리곤이 곧 그 시 전체다
  if (sameHead && heads[0].endsWith('시')) return heads[0];
  // 인천 서해구·검단구처럼 앞말이 시가 아니면 뒷부분만 묶는다
  if (sameHead) {
    return `${heads[0]} ${names.map((n) => n.slice(heads[0].length).trim()).join('·')}`;
  }
  return names.join('·');
}

module.exports = {
  REGIONS, DISTRICTS, CODE_TO_NAME, CODE_TO_REGION,
  CODE_TO_POLYGON, POLYGON_TO_CODES, polygonLabel,
};
