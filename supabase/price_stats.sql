-- 지역별 시세 통계("오늘의 집값은?" 페이지) — Supabase SQL Editor에서 1회 실행
--
-- 공공 API가 일 1,000회 제한이라 페이지에서 직접 부를 수 없다.
-- 하루 1회 수집(Vercel Cron)해 여기 저장하고, 페이지는 이 표만 읽는다.

create table price_stats (
  ym            text not null,          -- 계약연월 '202607'
  district_code text not null,          -- 법정동코드 앞 5자리
  dong          text not null default '',-- '' 이면 그 구 전체 합계
  property_type text not null,          -- rh(연립다세대) | sh(단독다가구)

  jeonse_count       int not null default 0,
  jeonse_avg_deposit int not null default 0,   -- 만원
  wolse_count        int not null default 0,
  wolse_avg_deposit  int not null default 0,   -- 만원
  wolse_avg_rent     int not null default 0,   -- 만원

  -- 매매는 API 활용신청 후 채운다(지금은 0으로 남김)
  sale_count     int not null default 0,
  sale_avg_price int not null default 0,       -- 만원

  updated_at timestamptz not null default now(),
  primary key (ym, district_code, dong, property_type)
);

create index price_stats_lookup on price_stats (ym, district_code);

-- 시세 통계는 공개 정보 — 로그인 없이 누구나 읽을 수 있다.
alter table price_stats enable row level security;
create policy "public read" on price_stats for select using (true);
grant select on public.price_stats to anon, authenticated;

-- 수집(백엔드)용 권한. service_role은 RLS는 우회하지만 테이블 GRANT는 별도로 필요하다
-- (이 프로젝트는 기본 GRANT가 없어 빠뜨리면 "permission denied for table"이 난다).
-- upsert는 INSERT ... ON CONFLICT DO UPDATE라 insert와 update가 모두 필요.
grant select, insert, update on public.price_stats to service_role;
-- anon·authenticated에는 쓰기 권한을 주지 않는다.
