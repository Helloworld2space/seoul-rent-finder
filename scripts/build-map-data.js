/**
 * 수도권 시군구 경계 GeoJSON 생성 (1회성 / 갱신 시 재실행).
 *   node scripts/build-map-data.js
 *
 * 출처: southkorea-maps (통계청 2018) — 라이선스 "Free to share or remix".
 * 원본은 전국 18MB라 그대로 쓸 수 없어, 수도권만 잘라내고 좌표를 줄여 커밋한다.
 *
 * 주의 — 통계청 코드는 법정동코드와 다르다 (종로구: 통계청 11010 vs 법정동 11110).
 * 그래서 이름으로 매칭하고, 2018 경계에 없는 2026 신설 구는 아래 규칙으로 근사한다.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SRC =
  'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-geo.json';
const OUT = path.join(__dirname, '..', 'frontend', 'data', 'sudogwon.geo.json');

// 통계청 코드 앞 2자리: 11=서울, 23=인천, 31=경기
const SUDOGWON_PREFIX = new Set(['11', '23', '31']);

const { polygonLabel } = require('../backend/districts');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return fetchJson(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

/** Douglas-Peucker — 화면 표시에 영향 없는 점을 걷어낸다 */
function simplifyRing(points, tol) {
  if (points.length <= 3) return points;
  let maxDist = 0;
  let idx = 0;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const denom = Math.hypot(dx, dy) || 1;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const dist = Math.abs(dy * px - dx * py + bx * ay - by * ax) / denom;
    if (dist > maxDist) {
      maxDist = dist;
      idx = i;
    }
  }
  if (maxDist <= tol) return [points[0], points[points.length - 1]];
  return [
    ...simplifyRing(points.slice(0, idx + 1), tol).slice(0, -1),
    ...simplifyRing(points.slice(idx), tol),
  ];
}

const round = (v, p = 4) => Math.round(v * 10 ** p) / 10 ** p;

function processRing(ring, tol) {
  // 닫힌 링은 시작점=끝점이라 Douglas-Peucker를 그대로 못 쓴다(기준선 길이가 0).
  // 시작점에서 가장 먼 점을 찾아 둘로 쪼갠 뒤 각각 단순화한다.
  let farIdx = 0;
  let farDist = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farDist) {
      farDist = d;
      farIdx = i;
    }
  }
  const simplified =
    farIdx > 0
      ? [
          ...simplifyRing(ring.slice(0, farIdx + 1), tol).slice(0, -1),
          ...simplifyRing(ring.slice(farIdx), tol),
        ]
      : simplifyRing(ring, tol);
  // 폴리곤은 닫혀 있어야 한다
  const out = simplified.map(([x, y]) => [round(x), round(y)]);
  if (out.length < 4) return null;
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  return out;
}

// 서해 5도(백령·대청·연평 등)는 본토에서 100km 넘게 떨어져 있어, 함께 그리면
// 수도권 본토가 화면 구석으로 밀려 아주 작아진다. 이 경도 서쪽에만 있는 섬은 뺀다.
// 옹진군·강화군 모두 가까운 섬(영흥도·강화도 등)이 남아 지도에서 선택할 수 있다.
const WEST_CUTOFF_LNG = 126.2;

function processGeometry(geom, tol) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const kept = [];
  for (const poly of polys) {
    if (Math.max(...poly[0].map(([x]) => x)) < WEST_CUTOFF_LNG) continue; // 먼 섬
    const outer = processRing(poly[0], tol);
    if (!outer) continue; // 단순화로 사라진 아주 작은 섬은 버린다
    kept.push([outer]); // 내부 구멍(호수 등)은 표시에 불필요하므로 제외
  }
  if (kept.length === 0) return null;
  return { type: 'MultiPolygon', coordinates: kept };
}

(async () => {
  console.log('통계청 시군구 경계 내려받는 중… (18MB, 시간이 걸립니다)');
  const src = await fetchJson(SRC);

  const TOL = 0.0008; // 약 80m — 전국 지도 축척에서 눈에 띄지 않는 수준
  const features = [];

  for (const f of src.features) {
    const code = f.properties.code;
    if (!SUDOGWON_PREFIX.has(code.slice(0, 2))) continue;
    const geometry = processGeometry(f.geometry, TOL);
    if (!geometry) continue;
    features.push({
      type: 'Feature',
      // 표시명은 통계청 원본이 아니라 앱의 정식 지역명을 쓴다
      // (원본은 인천에 시 이름이 없어 서울 중구와 겹치고, 2026 개편·띄어쓰기도 반영 안 됨)
      properties: { id: code, name: polygonLabel(code) || f.properties.name },
      geometry,
    });
  }

  const out = { type: 'FeatureCollection', features };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));

  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`완료: ${features.length}개 폴리곤, ${kb}KB → ${path.relative(process.cwd(), OUT)}`);
})();
