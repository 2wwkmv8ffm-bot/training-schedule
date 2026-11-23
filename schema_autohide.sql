-- 🙈 신고 5명 이상이면 글 자동 숨김 (한 번만 실행 · 여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → New query → 전부 붙여 넣고 Run

-- 1) 숨겨진 글 목록
create table if not exists public.hidden_posts (
  post_id text primary key,
  hidden_at timestamptz not null default now()
);
alter table public.hidden_posts enable row level security;

-- 누구나 '숨겨진 글 목록'은 읽을 수 있어요 (앱이 피드에서 빼려고)
drop policy if exists "anyone reads hidden posts" on public.hidden_posts;
create policy "anyone reads hidden posts" on public.hidden_posts for select using (true);

-- 운영자만 숨김을 풀 수 있어요 ('문제없음 · 처리 완료')
drop policy if exists "admins unhide posts" on public.hidden_posts;
create policy "admins unhide posts" on public.hidden_posts for delete to authenticated
  using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

-- 2) 신고가 들어올 때마다: 아직 처리 안 한 신고를 한 '서로 다른 사람'이 5명 이상이면 숨김 목록에 넣어요
create or replace function public.auto_hide_reported() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(distinct reporter) from public.post_reports
      where post_id = new.post_id and coalesce(handled, false) = false) >= 5 then
    insert into public.hidden_posts(post_id) values (new.post_id::text) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_hide_reported on public.post_reports;
create trigger trg_auto_hide_reported after insert on public.post_reports
  for each row execute function public.auto_hide_reported();
