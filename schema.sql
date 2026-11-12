-- 훈련 스케줄 프로그램 테이블
-- Supabase 대시보드 → SQL Editor → New query 에 전체 붙여넣고 Run 하세요.

create table if not exists public.training_sessions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  date         date not null,
  start_time   time,
  title        text not null,
  category     text not null default '기타',
  duration_min integer check (duration_min is null or duration_min >= 0),
  intensity    text check (intensity is null or intensity in ('낮음', '보통', '높음')),
  notes        text,
  completed    boolean not null default false
);

create index if not exists training_sessions_date_idx
  on public.training_sessions (date);

-- 행 수준 보안(RLS) 켜기
alter table public.training_sessions enable row level security;

-- 공개키(publishable key)로 읽기/쓰기 허용
-- 주의: 사이트 주소와 공개키를 아는 사람은 누구나 일정을 보고 수정할 수 있습니다.
--       혼자 쓰거나 팀 내부용일 때만 이렇게 두고, 공개 배포 전에는 로그인 기반 정책으로 바꾸세요.
drop policy if exists "public read"   on public.training_sessions;
drop policy if exists "public insert" on public.training_sessions;
drop policy if exists "public update" on public.training_sessions;
drop policy if exists "public delete" on public.training_sessions;

create policy "public read"   on public.training_sessions for select to anon, authenticated using (true);
create policy "public insert" on public.training_sessions for insert to anon, authenticated with check (true);
create policy "public update" on public.training_sessions for update to anon, authenticated using (true) with check (true);
create policy "public delete" on public.training_sessions for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.training_sessions to anon, authenticated;
