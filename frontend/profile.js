/**
 * 동네 성격 판정 — 순수함수.
 * 숫자(월세비중·면적·준공년도)를 사람이 읽는 문장으로 바꾼다.
 *
 * 지금은 규칙 기반이다. 나중에 이 자리를 LLM으로 바꾸면 같은 입력으로
 * 더 자연스러운 요약을 낼 수 있다 — 그래서 판정과 표현을 한곳에 모아둔다.
 *
 * ⚠️ 표현 원칙: 동네를 평가·서열화하지 않는다("살기 나쁨" 같은 말 금지).
 *    관찰된 사실만 중립적으로 전한다. 특정 지역에 대한 부정적 단정은 분쟁 소지가 있다.
 */

/** 표본이 이보다 적으면 성격을 단정하지 않는다 */
const MIN_SAMPLE = 10;

/** 판정 기준값 — 한곳에 모아 조정하기 쉽게 */
const T = {
  wolseHeavy: 65,     // 월세 비중(%) 이상이면 월세 위주
  jeonseHeavy: 55,    // 전세 비중(%) 이상이면 전세 위주
  smallArea: 33,      // ㎡ 이하면 작은 집 위주 (약 10평)
  largeArea: 60,      // ㎡ 이상이면 넓은 집 많음
  oldYears: 25,       // 준공 후 경과 연수 이상이면 노후
  newYears: 10,       // 이하면 신축 많음
};

/**
 * @param {object} d  { dong, jeonseCount, wolseCount, jeonseAvgDeposit,
 *                      wolseAvgDeposit, wolseAvgRent, areaAvg, buildYearAvg }
 * @param {number} [thisYear]  기준 연도 (테스트에서 고정하기 위해 주입 가능)
 * @returns {{ tags: string[], summary: string, total: number, wolseRatio: number, enough: boolean }}
 */
function describeDong(d, thisYear = new Date().getFullYear()) {
  const total = (d.jeonseCount ?? 0) + (d.wolseCount ?? 0);
  const wolseRatio = total > 0 ? Math.round((d.wolseCount / total) * 100) : 0;
  const enough = total >= MIN_SAMPLE;

  if (total === 0) {
    return { tags: [], summary: '최근 3개월 거래가 없습니다.', total: 0, wolseRatio: 0, enough: false };
  }
  if (!enough) {
    return {
      tags: ['표본 적음'],
      summary: `최근 3개월 거래가 ${total}건뿐이라 동네 성격을 말하기 어렵습니다.`,
      total, wolseRatio, enough: false,
    };
  }

  const tags = [];
  const parts = [];

  // 1) 전월세 구성 — 원룸촌인지 정착형인지 가르는 가장 강한 신호
  if (wolseRatio >= T.wolseHeavy) {
    tags.push('월세 위주');
    parts.push(`거래의 ${wolseRatio}%가 월세로, 단기 거주가 많은 동네입니다`);
  } else if (100 - wolseRatio >= T.jeonseHeavy) {
    tags.push('전세 위주');
    parts.push(`전세 비중이 ${100 - wolseRatio}%로 높아, 오래 머무는 세입자가 많은 편입니다`);
  } else {
    parts.push(`전세와 월세가 ${100 - wolseRatio}:${wolseRatio}로 비슷하게 섞여 있습니다`);
  }

  // 2) 집 크기
  const area = d.areaAvg ?? 0;
  if (area > 0) {
    const pyeong = Math.round((area / 3.305785) * 10) / 10;
    if (area <= T.smallArea) {
      tags.push('작은 집 위주');
      parts.push(`평균 ${area}㎡(약 ${pyeong}평)로 1인 가구에 맞는 크기가 많습니다`);
    } else if (area >= T.largeArea) {
      tags.push('넓은 집 많음');
      parts.push(`평균 ${area}㎡(약 ${pyeong}평)로 가족 단위도 살 만한 크기가 많습니다`);
    } else {
      parts.push(`평균 ${area}㎡(약 ${pyeong}평) 정도입니다`);
    }
  }

  // 3) 건물 연식
  const year = d.buildYearAvg ?? 0;
  if (year > 0) {
    const age = thisYear - year;
    if (age >= T.oldYears) {
      tags.push('오래된 주택 많음');
      parts.push(`평균 준공 ${year}년으로 지은 지 ${age}년쯤 된 건물이 많습니다`);
    } else if (age <= T.newYears) {
      tags.push('신축 많음');
      parts.push(`평균 준공 ${year}년으로 비교적 새 건물이 많습니다`);
    } else {
      parts.push(`평균 준공 ${year}년입니다`);
    }
  }

  return {
    tags,
    summary: parts.join('. ') + '.',
    total,
    wolseRatio,
    enough: true,
  };
}

/** 거래가 많은 동부터 정렬해 한 구의 동별 리포트를 만든다 */
function buildReport(dongs, thisYear) {
  if (!dongs) return [];
  return dongs
    .map((d) => ({ ...d, ...describeDong(d, thisYear) }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { describeDong, buildReport, MIN_SAMPLE, T };
}
