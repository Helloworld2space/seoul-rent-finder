-- 관심 거래(favorites) 테이블 — Supabase SQL Editor에서 1회 실행
-- (twinforge와 공유하는 Supabase 프로젝트에 생성)
create table favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  deal_key   text not null,   -- 자연키: district|dong|aptName|propertyType|dealDate|deposit|monthlyRent|area|floor
  deal       jsonb not null,  -- RentDeal 스냅샷 (표시·맞춤 검색용)
  created_at timestamptz default now(),
  unique (user_id, deal_key)
);

-- RLS: 본인 행만 읽기/쓰기/삭제 가능 (anon key가 공개돼도 이 정책이 보안 경계)
alter table favorites enable row level security;
create policy "own rows" on favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 로그인 사용자 역할에 테이블 접근 권한 부여 (RLS가 행 단위를 거른다)
-- ※ 프로젝트에 따라 기본 GRANT가 없을 수 있어 명시적으로 필요
grant select, insert, delete on public.favorites to authenticated;
