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

-- 2) 회원 탈퇴: 로그인한 본인 계정을 삭제한다.
--    favorites·user_consents는 FK on delete cascade로 함께 파기된다.
create or replace function delete_user()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function delete_user() from public, anon;
grant execute on function delete_user() to authenticated;
