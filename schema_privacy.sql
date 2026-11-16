-- 🔒 ZONE 개인정보 잠금 (2026-11-16) — 꼭 실행하세요
-- 문제: 훈련 일정(training_sessions)과 선수 프로필(athlete_profiles)이 '누구나 보기·쓰기·지우기'로 열려 있었어요.
--       로그인하지 않아도 모든 사람의 일정·프로필(나이·체중·심박 등)을 읽을 수 있었어요.
-- 해결: 이제 '내 것만' 보고·쓰고·지울 수 있어요. 로그인하지 않은 사람은 아무것도 못 봐요.
-- 실행: Supabase 대시보드 → SQL Editor → New query → 이 파일 전체를 붙여넣고 Run. (여러 번 실행해도 안전해요)

-- 1) 훈련 일정: 내 일정만
alter table public.training_sessions enable row level security;
alter table public.training_sessions add column if not exists user_id uuid default auth.uid();
alter table public.training_sessions alter column user_id set default auth.uid();
drop policy if exists "public read"   on public.training_sessions;
drop policy if exists "public insert" on public.training_sessions;
drop policy if exists "public update" on public.training_sessions;
drop policy if exists "public delete" on public.training_sessions;
drop policy if exists "ts own read"   on public.training_sessions;
drop policy if exists "ts own insert" on public.training_sessions;
drop policy if exists "ts own update" on public.training_sessions;
drop policy if exists "ts own delete" on public.training_sessions;
create policy "ts own read"   on public.training_sessions for select to authenticated using (user_id = auth.uid());
create policy "ts own insert" on public.training_sessions for insert to authenticated with check (user_id = auth.uid());
create policy "ts own update" on public.training_sessions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ts own delete" on public.training_sessions for delete to authenticated using (user_id = auth.uid());
revoke all on public.training_sessions from anon;
grant select, insert, update, delete on public.training_sessions to authenticated;

-- 2) 선수 프로필: 내 프로필만 (프로필 id = 내 계정 id)
alter table public.athlete_profiles enable row level security;
drop policy if exists "public read"   on public.athlete_profiles;
drop policy if exists "public insert" on public.athlete_profiles;
drop policy if exists "public update" on public.athlete_profiles;
drop policy if exists "public delete" on public.athlete_profiles;
drop policy if exists "prof own read"   on public.athlete_profiles;
drop policy if exists "prof own insert" on public.athlete_profiles;
drop policy if exists "prof own update" on public.athlete_profiles;
drop policy if exists "prof own delete" on public.athlete_profiles;
create policy "prof own read"   on public.athlete_profiles for select to authenticated using (id = auth.uid()::text);
create policy "prof own insert" on public.athlete_profiles for insert to authenticated with check (id = auth.uid()::text);
create policy "prof own update" on public.athlete_profiles for update to authenticated using (id = auth.uid()::text) with check (id = auth.uid()::text);
create policy "prof own delete" on public.athlete_profiles for delete to authenticated using (id = auth.uid()::text);
revoke all on public.athlete_profiles from anon;
grant select, insert, update, delete on public.athlete_profiles to authenticated;

-- 3) 사진 저장소: 올리기는 로그인한 사람만, 지우기·바꾸기는 올린 본인만 (보기는 게시물에 필요해서 그대로)
drop policy if exists "media upload" on storage.objects;
drop policy if exists "media update" on storage.objects;
drop policy if exists "media delete" on storage.objects;
create policy "media upload" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "media update" on storage.objects for update to authenticated using (bucket_id = 'media' and owner_id = auth.uid()::text);
create policy "media delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and owner_id = auth.uid()::text);

notify pgrst, 'reload schema';

-- ✅ 확인: 아래를 실행해서 결과가 모두 '내 것만' 정책으로 나오면 끝이에요.
-- select tablename, policyname, roles, cmd from pg_policies where tablename in ('training_sessions','athlete_profiles') order by 1,2;
