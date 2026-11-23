-- 🛡️ 운영자 신고 보기 설정 (한 번만 실행)
-- 수파베이스 → SQL 편집기(SQL Editor) → 새 쿼리 → 이 내용을 전부 붙여 넣고 실행(Run)
-- 여러 번 실행해도 안전해요.

-- 1) 신고 표에 '언제' · '처리했는지' 칸 (없으면 만들기)
alter table public.post_reports add column if not exists created_at timestamptz not null default now();
alter table public.post_reports add column if not exists handled boolean not null default false;
alter table public.post_reports enable row level security;

-- 2) 운영자(app_admins 표에 있는 계정)만 신고 목록을 보고, '처리 완료'로 바꿀 수 있어요
drop policy if exists "admins read reports" on public.post_reports;
create policy "admins read reports" on public.post_reports
  for select to authenticated
  using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

drop policy if exists "admins update reports" on public.post_reports;
create policy "admins update reports" on public.post_reports
  for update to authenticated
  using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

-- 3) 운영자는 신고된 글을 지울 수 있어요
drop policy if exists "admins delete posts" on public.posts;
create policy "admins delete posts" on public.posts
  for delete to authenticated
  using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
