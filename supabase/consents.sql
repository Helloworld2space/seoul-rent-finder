-- 동의 기록 + 회원 탈퇴 — Supabase SQL Editor에서 1회 실행

-- 1) 동의 기록: 누가·언제·어떤 버전의 어떤 항목에 동의했는지 (분쟁 시 입증용)
create table user_consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  consent_key text not null,   -- age14 | terms | privacy | cross_border | analytics
  agreed      boolean not null,
  version     text not null,   -- 약관 버전 (예: '2026-07-11')
  created_at  timestamptz default now()
);
alter table user_consents enable row level security;
create policy "own rows" on user_consents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert on public.user_consents to authenticated;

-- 2) [사용 안 함] 아래 RPC로는 회원 탈퇴가 동작하지 않는다 —
--    postgres 롤에도 auth.users DELETE 권한이 없어(Supabase 보안 정책) 항상 실패한다.
--    실제 탈퇴는 supabase/functions/delete-account (Edge Function, service_role 사용)가 처리한다.
--    이미 이 함수를 만들어뒀다면 정리용으로 아래 한 줄만 실행해도 된다 (없어도 무해함):
-- drop function if exists delete_user();
