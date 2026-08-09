# Rent.li (수도권 전월세 실거래가 탐색기) — 설계 문서

조건 입력 → 목록 출력 웹앱. 국토교통부 아파트 전월세 실거래가(공공데이터포털)를
합법적으로 활용해, 서울 25개 자치구의 실거래 기록을 조건에 맞춰 탐색한다.

---

## 1. 핵심 제약과 그로 인한 구조

이 앱의 구조는 단 하나의 제약에서 출발한다.

- 공공 API **인증키는 브라우저에 노출되면 안 된다.**
- 브라우저에서 공공 API를 **직접 호출하면 CORS에 막힌다.**

→ 그래서 프론트와 공공 API 사이에 **백엔드(프록시)가 반드시 필요**하다.
3-tier 구조가 선택이 아니라 필연인 이유다.

```
[브라우저/프론트]  →  [백엔드(Express)]  →  [국토부 공공 API]
   조건 입력            인증키 보관             실거래 원본
   필터·정렬·표시        수집·정규화             (구 × 월 조회)
```

### 책임 분배 (확정)

| 작업           | 위치     | 이유                                            |
|----------------|----------|-------------------------------------------------|
| 데이터 수집    | 백엔드   | 인증키 보호 + CORS 회피 + 느린 호출 격리        |
| 정규화         | 백엔드   | 원본 필드명이 지저분 → 깨끗한 계약으로 변환      |
| 필터링         | 프론트   | 조건 변경 시 재호출 없이 즉시 반영               |
| 정렬           | 프론트   | 위와 동일                                       |

**경계 규칙:** "지역(구)·기간·주거유형"을 바꿀 때만 서버를 다시 부른다(재수집).
보증금·면적·키워드·정렬·지역별 평균은 받아둔 데이터 안에서 프론트가 처리한다.

**범위:** 수도권 — 서울 25구, 경기 47시군구(화성 4구 신설 반영), 인천 11군구(2026-07 개편 반영).
주거유형은 국토부 API가 유형별로 분리돼 있어(apt/rh/sh/offi) 각각 활용신청이 필요하며,
미승인 유형은 빈 결과로 격리된다. (구,월,유형) 단위 인메모리 캐시로 일 1,000건 쿼터를 보호한다
(당월 1시간, 과거월 24시간 TTL).

---

## 2. 데이터 모델 — RentDeal (프론트·백엔드 공통 계약)

공공 API 응답은 필드명이 한/영 혼재하고 신·구 스펙이 섞여 있다.
앱 내부는 아래 단일 타입만 사용한다. 이 변환은 normalize.js의 책임.

```
RentDeal {
  district     string   지역(구)명       예: "강남구", "수원시 장안구", "인천 연수구"
  dong         string   법정동           예: "역삼동"
  aptName      string   건물명           예: "래미안…" ※ 단독다가구는 "단독/다가구"
  propertyType enum     "아파트" | "연립다세대" | "단독다가구" | "오피스텔"
  rentType     enum     "전세" | "월세"   ※ 월세금액>0 이면 월세
  deposit      number   보증금 (만원)
  monthlyRent  number   월세 (만원)       ※ 전세는 0
  area         number   면적 (㎡)         ※ 단독다가구만 계약면적, 나머지 전용면적
  pyeong       number   평수 (파생: area/3.305785)
  floor        number   층 ※ 단독다가구는 미제공 → 0
  buildYear    number   건축년도
  dealDate     string   계약일 "YYYY-MM-DD"
  contractType string   "신규" | "갱신" (있을 때만)
}
```

**못박아 둘 규칙**
- 전세/월세는 API가 직접 안 준다 → `monthlyRent > 0` 으로 판별.
- 금액 단위는 **만원** (UI에서 30000 = 3억 으로 표기).
- 면적 단위는 **전용면적 ㎡**.
- 동/호 정보는 공공 데이터에서 제공되지 않음(개인정보 보호).

---

## 3. 모듈 분해 — 역할별 분리

원칙: **공공 API의 존재를 아는 모듈은 `molit-client.js` 단 하나.**
이 격리 덕분에 나중에 유료 매물 API를 붙여도 형제 모듈 하나만 추가하면 된다.

```
backend/
  config.js        환경변수, 상수(API URL, 페이지 크기, 포트, 인증키 로드)
  districts.js     서울 25구 ↔ 법정동코드 매핑. 데이터만, 로직 없음
  molit-client.js  (lawdCd, ym) → 원본 item[]
                   책임: 페이지네이션, 인증오류 감지, 부분실패 격리
                   ★ 공공 API를 아는 유일한 모듈
  normalize.js     원본 item → RentDeal
                   책임: 필드명 흡수, 전세/월세 판별, 평수 파생
                   ★ 순수함수 — 단위 테스트 1순위
  routes.js        /api/districts, /api/search
                   책임: 파라미터 검증, client + normalize 조립
  server.js        express 인스턴스 + 정적 서빙 + routes 마운트

frontend/
  index.html       구조(뼈대)
  styles.css       디자인 토큰 + 스타일
  app.js
    ├ state        rawDeals[], 필터조건, 정렬조건
    ├ api          fetchDistricts, fetchDeals (백엔드 호출만)
    ├ filterSort   rawDeals → 화면용 배열 (★ 순수함수)
    └ render       DOM 갱신
```

---

## 4. API 계약 (프론트 ↔ 내 백엔드)

필터를 프론트가 맡으므로 백엔드는 얇다. 두 엔드포인트면 충분.

### `GET /api/districts`
지역·구 목록 반환 (탭/칩 렌더링용).
```json
{
  "regions": [ { "id": "seoul", "name": "서울" }, ... ],
  "districts": [ { "code": "11680", "name": "강남구", "region": "seoul" }, ... ]
}
```

### `GET /api/search`
필터 파라미터를 받지 않는다. **구 + 기간 + 주거유형**만 받아 원본 전체를 정규화해 내려준다.

요청
```
?districts=11680,41135   // 콤마 구분 법정동코드. 비면 서울 전체
&months=3                // 최근 N개월 (1~12)
&types=apt,rh            // apt|rh|sh|offi 콤마 구분. 비면 apt
```

응답
```json
{
  "count": 1234,
  "monthsQueried": ["202606", "202605", "202604"],
  "typesQueried": ["apt", "rh"],
  "results": [ RentDeal, ... ]   // 필터·정렬 안 된 원본
}
```

---

## 5. 데이터 흐름

```
구·기간 선택
  → fetchDeals() → GET /api/search
    → routes: 구 × 월 조합 생성
      → molit-client: 각 조합 호출 (병렬, 부분실패 무시)
      → normalize: item[] → RentDeal[]
    → RentDeal[] 반환
  → state.rawDeals 저장

보증금·면적·정렬 조정
  → filterSort(rawDeals) → render   ※ 서버 안 탐
```

---

## 6. 스택

- 백엔드: **Node.js + Express** (라우팅·정적서빙 간결)
- 프론트: 바닐라 HTML/CSS/JS (빌드 스텝 없음)
- 의존성: express, dotenv 둘뿐
- 실행: `.env`에 인증키 넣고 `npm start`

---

## 7. 향후 확장 여지

- **유료 매물 API**: `listing-client.js`를 molit-client의 형제로 추가,
  같은 RentDeal로 정규화하면 routes·프론트 무수정.
- **캐싱**: 같은 구·월 재요청 시 메모리/디스크 캐시로 공공 API 호출 절감.
- **지도 뷰**: RentDeal에 좌표를 붙이면 목록 ↔ 지도 전환 가능.

---

## 8. 계정·관심 거래 (Supabase)

- 구글 로그인·저장소는 **twinforge와 같은 Supabase 프로젝트**를 공유(같은 계정 체계).
- 백엔드 무관여: 브라우저가 supabase-js(CDN UMD)로 직접 인증·CRUD.
  `favorites` 테이블 스키마·RLS는 `supabase/favorites.sql`.
- **키 구분 주의**: `frontend/auth.js`의 anon key는 브라우저 공개를 전제로 설계된
  키로, 보안 경계는 RLS다. 국토부·서울시 `SERVICE_KEY`류(백엔드 전용, 절대 노출 금지)와
  다른 종류이므로 §1의 "인증키는 백엔드에만" 원칙과 충돌하지 않는다.
- 실거래엔 고유 ID가 없어 `deal_key`(필드 조인 자연키)로 중복 저장을 방지한다.
- **맞춤 검색**: 저장된 거래에서 선호(빈도 상위 지역, 유형 집합, 전/월세 다수결,
  보증금·면적 min~max ±15%)를 추출해 검색 조건을 자동 세팅 — `frontend/prefs.js`
  순수함수(테스트: `tests/prefs.test.js`). 새 API 없음, 기존 수집/필터 경계 그대로.

## 9. 랜딩 · 이용 데이터

- 진입 시 항상 index.html의 랜딩 섹션을 먼저 표시("시작하기"로 본문 진입). 단, 구글 로그인 복귀(URL의 access_token/code)에는 랜딩을 건너뛴다.
- 이용 데이터: Vercel Analytics(트래픽, 대시보드에서 Enable 필요) + PostHog(행동 이벤트,
  `frontend/analytics.js`의 `POSTHOG_KEY`가 비어 있으면 전체 no-op).
  수집 이벤트: landing_start, search, favorite_added, action_click, custom_search, login_click.

## 10. 동의·약관·탈퇴

- 로그인 전 동의 모달(필수: 만14세·이용약관·개인정보 수집이용·국외이전 / 선택: 행태 분석).
  선택은 PostHog opt-in/out으로 반영. 동의 선택은 sessionStorage에 보관했다가 OAuth 복귀 후
  `user_consents`에 버전과 함께 기록(입증용). 기존 가입자는 로그인 시 재동의 요구, 거부하면 로그아웃.
- 약관 `terms.html`(중개업 아님·면책), 처리방침 `privacy.html`(국외이전 표·보호책임자) — 푸터 상시 노출.
- **회원 탈퇴**: `auth.users`는 postgres 롤에도 DELETE 권한이 없어(Supabase 보안 정책)
  SQL RPC로는 지울 수 없다 — service_role 키가 필요한 Admin API를
  `supabase/functions/delete-account`(Edge Function)에서만 호출. 요청자 신원은
  anon 클라이언트 + 사용자 토큰으로 먼저 검증한 뒤, admin 클라이언트로 삭제한다.
  favorites·user_consents는 FK cascade로 함께 파기. `supabase/consents.sql`의
  옛 RPC는 사용하지 않음(문서만 남김). 버전 갱신 시 auth.js의 CONSENT_VERSION과
  두 HTML의 시행일을 함께 올릴 것.

## 11. "오늘의 집값은?" 시세 지도 (today.html)

수도권 시군구 지도에서 시세를 색으로 비교하고, 구를 클릭하면 동별 표를 보여준다.
대상은 **빌라·단독 전월세**(1인 가구 타깃, 아파트 제외). 매매는 API 미승인이라 보류.

**핵심 제약과 구조**: 공공 API 일 1,000회 한도 때문에 페이지가 직접 호출할 수 없다.
→ `Vercel Cron`이 하루 1회 `/api/cron/refresh-prices`(CRON_SECRET 보호)를 호출해
83구 × 2유형 = **166회**만 수집하고 `price_stats`에 저장한다. 페이지는 저장값만 읽는다.
과거 월은 재수집하지 않고(당월만 갱신), 표시는 **최근 3개월 누적**으로 동별 표본을 확보한다.

- 집계 순수함수 `backend/price-stats.js`의 `aggregate`/`mergeRows` (테스트: `tests/price-stats.test.js`).
  평균을 다시 평균 내지 않고 **건수 가중**으로 합친다.
- 지도는 외부 라이브러리·타일 없이 GeoJSON을 SVG path로 직접 그린다(빌드 스텝 없는 원칙 유지).
- 경계 데이터 `frontend/data/sudogwon.geo.json`은 `scripts/build-map-data.js`로 생성
  (통계청 2018, "free to share or remix"). 175KB.
  - 서해 5도처럼 본토에서 먼 섬은 제외 — 함께 그리면 본토가 화면 구석으로 밀린다.
    옹진·강화는 가까운 섬이 남아 선택 가능.
  - **코드 체계 주의**: 통계청 코드 ≠ 법정동코드(종로구 11010 vs 11110).
    `districts.js`의 `CODE_TO_POLYGON`이 잇는다.
  - 2018 경계라 2026 개편분은 근사: 화성 4구·부천 3구 → 시 단위 1폴리곤(가중평균),
    인천 제물포→동구, 영종→중구, 서해·검단→서구. 페이지 각주로 밝힌다.

## 12. 간단검색 (simple.html)

기존 검색이 "지역을 고르고 조건을 좁히는" 방향이라면, 여기는 반대다 —
**예산에서 출발해 갈 수 있는 지역을 찾는다.** 살 곳을 아직 못 정한 사용자를 위한 입구.

- **단계형 흐름**: 실거래 검색이 조건을 한 화면에 펼쳐놓는 반면, 여기는 질문을 하나씩 던진다.
  전세/월세 → 보증금 → (월세면) 월세 → 지역 순이며, 선택형은 누르는 즉시 다음으로 넘어간다.
  마지막 답이 끝나면 질문 화면을 감추고 **결과만** 남긴다("조건 바꾸기"로 처음부터 다시).
  월세를 고르면 단계가 3개에서 4개로 늘어나며 진행 표시도 함께 바뀐다.
- 출력: 조건에 맞는 자치구 목록(예산 여유가 큰 순) → 실거래·지도로 연결
- 조건에 맞는 곳이 없으면 **가장 근접한 5곳**을 "얼마 부족"과 함께 보여줘 빈 화면을 피한다
- 판정은 `frontend/match.js`의 순수함수(`matchDistricts`/`nearMisses`, 테스트: `tests/match.test.js`).
  표본 3건 미만 지역은 평균을 신뢰하기 어려워 제외한다.
- **공공 API를 호출하지 않는다** — `/api/prices?by=district`로 저장된 통계만 읽으므로 쿼터 소모 0.
- 결과 카드의 "실거래 보기"는 `index.html?district=코드`로 연결되며, 해당 구가 선택된 채 바로 조회된다.

## 13. 전월세 계산기 (calc.html)

"전세가 싼가, 월세가 싼가"를 같은 잣대로 답한다. 공공 API도 로그인도 쓰지 않는 독립 페이지.

- **핵심 관점**: 전세는 월세를 안 내는 게 아니라 **대출이자 + 묶인 돈의 기회비용**을 낸다.
  둘을 "월 실부담"으로 환산해 비교한다. 전세 보증금은 만기에 돌려받으므로 원금은 비용에 넣지 않는다.
- 계산은 `frontend/finance.js` 순수함수 (테스트: `tests/finance.test.js`).
- **법정 전월세전환율 상한 = min(10%, 기준금리 + 2%)** — 시행령 제9조.
  `BASE_RATE`(기준금리)를 바꾸면 상한도 따라 바뀐다. **기준금리가 변경되면 이 상수를 갱신하고
  화면의 기준일 표기도 함께 고칠 것.** 상한 초과 입력 시 경고를 띄운다(기존 계약 전환에만 적용).
- 대출 상품은 **금리 프리셋 버튼**으로만 제공하고 자격 판정은 하지 않는다 —
  상품 조건이 수시로 바뀌어 유지보수 부담이 크고, 개인화된 금융상품 추천은 규제 영역이기 때문.
  자격·한도는 마이홈포털·주택도시기금 공식 링크로 넘긴다.
- 대출 한도 경고는 청년 버팀목 기준(보증금 80%·최대 2억)을 참고값으로만 쓴다.

## 14. 합법성 메모

- 데이터 출처: 국토교통부 아파트 전월세 실거래가 (공공데이터포털 공식 API).
- "현재 매물"이 아니라 "계약 완료·신고된 거래" 기록. 시세 파악·후보 좁히기 용도.
- 네이버/직방 등 매물 플랫폼은 공식 공개 API가 없어 제외(ToS·법적 리스크).
```
