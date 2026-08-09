-- 동네 리포트용 컬럼 추가 — Supabase SQL Editor에서 1회 실행
--
-- 기존 price_stats는 "얼마인가"만 담았다. 동네 성격("작은 집 위주", "노후 주택 많음")을
-- 말하려면 면적·준공년도가 필요하다. 수집 시 이미 받아오는 값이라 API 호출은 늘지 않는다.

alter table price_stats
  add column if not exists area_avg         numeric(6,1) not null default 0,  -- 평균 전용면적 ㎡
  add column if not exists build_year_avg   int          not null default 0,  -- 평균 준공년도
  add column if not exists build_year_count int          not null default 0;  -- 준공년도가 있는 거래 수
                                                                              -- (결측이 있어 가중평균 분모로 별도 보관)
