-- 🛡️ 운영자: 이용 정지 + 회원 수 통계 (한 번만 실행 · 여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → New query → 전부 붙여 넣고 Run

-- 1) 이용 정지한 회원 목록
create table if not exists public.banned_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text,
  banned_at timestamptz not null default now()
);
alter table public.banned_users enable row level security;

-- 앱이 '정지된 사람 글'을 빼려고 목록은 누구나 읽어요 (아이디만 있어요)
drop policy if exists "anyone reads bans" on public.banned_users;
create policy "anyone reads bans" on public.banned_users for select using (true);

-- 정지·해제는 운영자만
drop policy if exists "admins ban users" on public.banned_users;
create policy "admins ban users" on public.banned_users for insert to authenticated
  with check (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
drop policy if exists "admins unban users" on public.banned_users;
create policy "admins unban users" on public.banned_users for delete to authenticated
  using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

-- 2) 정지된 사람은 서버에서도 글·댓글을 못 올려요 (앱을 거치지 않아도 막혀요)
drop policy if exists "banned cannot post" on public.posts;
create policy "banned cannot post" on public.posts as restrictive for insert to authenticated
  with check (not exists (select 1 from public.banned_users b where b.user_id = auth.uid()));
drop policy if exists "banned cannot comment" on public.post_comments;
create policy "banned cannot comment" on public.post_comments as restrictive for insert to authenticated
  with check (not exists (select 1 from public.banned_users b where b.user_id = auth.uid()));

-- 3) 운영자 전용 회원 수: 전체 · 메일 인증 끝낸 사람 · 오늘(한국 시간) · 최근 7일
create or replace function public.admin_member_stats() returns json
language sql security definer set search_path = public as $$
  select case when exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then json_build_object(
    'total', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
    'today', (select count(*) from auth.users where created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')),
    'week', (select count(*) from auth.users where created_at >= now() - interval '7 days')
  ) else null end
$$;
revoke all on function public.admin_member_stats() from public, anon;
grant execute on function public.admin_member_stats() to authenticated;
