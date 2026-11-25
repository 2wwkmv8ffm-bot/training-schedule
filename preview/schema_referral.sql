-- 🎁 ZONE 친구 초대(추천인) · 🎟️ 멤버십 쿠폰 · 💎 코칭 멤버십 (한 번만 실행 · 여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → New query → 전부 붙여 넣고 Run
--
-- 쿠폰(멤버십 30일) 받는 방법 3가지 — 모두 운영자가 승인해야 쓸 수 있고, 회원이 원할 때 [사용하기]를 누르면 30일이 시작돼요
--   ① 추천 10명마다 1장 (그 10명은 다시 안 세요)
--   ② 월간 좋아요 1등: 그달에 올린 글 중 좋아요가 가장 많은 글의 주인 (동점이면 먼저 올린 글)
--   ③ 팔로워 1등: 매달 1장
--   ※ 팔로워 1등이 그달 좋아요 1등까지 하면, 좋아요 쿠폰은 좋아요 2등에게 가요
--   ※ 운영자 계정 · 이용 정지된 회원 · 숨겨진 글 · 스토리는 1등에서 빠져요

-- 1) 추천 기록: 한 사람(referee)은 평생 한 번만 추천인을 가질 수 있어요
create table if not exists public.referrals (
  referee uuid primary key references auth.users(id) on delete cascade,
  referrer uuid not null references auth.users(id) on delete cascade,
  coupon_id bigint,
  created_at timestamptz not null default now(),
  constraint referrals_not_self check (referee <> referrer)
);
create index if not exists referrals_referrer_idx on public.referrals(referrer);

-- 2) 쿠폰함
create table if not exists public.coupons (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('referral', 'likes', 'followers')),
  period text,                      -- 1등 쿠폰: 몇 월 1등인지 (예: 2027-02)
  note text,                        -- 예: 좋아요 37개 · 팔로워 120명
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'used')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  used_at timestamptz
);
create unique index if not exists coupons_one_per_month on public.coupons(source, period) where source <> 'referral';

-- 3) 멤버십 신청서 (이름 · 연락처)
create table if not exists public.membership_requests (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  contact text not null check (char_length(contact) between 3 and 60),
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);

-- 4) 멤버십 기간 (끝나는 날)
create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ends_on date not null,
  updated_at timestamptz not null default now()
);

alter table public.referrals enable row level security;
alter table public.coupons enable row level security;
alter table public.membership_requests enable row level security;
alter table public.memberships enable row level security;

-- 읽기: 내 것만 (운영자는 전부). 쓰기는 아래 서버 함수로만 해요 (앱을 거치지 않아도 못 속여요)
drop policy if exists "ref read own" on public.referrals;
create policy "ref read own" on public.referrals for select to authenticated
  using (referrer = auth.uid() or referee = auth.uid() or exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
drop policy if exists "coupon read own" on public.coupons;
create policy "coupon read own" on public.coupons for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
drop policy if exists "msreq insert own" on public.membership_requests;
create policy "msreq insert own" on public.membership_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'new');
drop policy if exists "msreq read own" on public.membership_requests;
create policy "msreq read own" on public.membership_requests for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
drop policy if exists "msreq admin update" on public.membership_requests;
create policy "msreq admin update" on public.membership_requests for update to authenticated
  using (exists (select 1 from public.app_admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
drop policy if exists "ms read own" on public.memberships;
create policy "ms read own" on public.memberships for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
revoke all on public.referrals, public.coupons, public.memberships, public.membership_requests from anon;
grant select on public.referrals, public.coupons, public.memberships to authenticated;
grant select, insert, update on public.membership_requests to authenticated;
grant usage on sequence public.membership_requests_id_seq to authenticated;

-- 5) 멤버십 30일 더하기 (안에서만 쓰는 함수 · 앱에서 직접 못 불러요)
create or replace function public.zone_add_month(target uuid) returns date
language plpgsql security definer set search_path = public as $$
declare d date; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  insert into public.memberships(user_id, ends_on) values (target, today + 30)
  on conflict (user_id) do update set ends_on = greatest(public.memberships.ends_on, today) + 30, updated_at = now()
  returning ends_on into d;
  return d;
end $$;
revoke all on function public.zone_add_month(uuid) from public, anon, authenticated;

-- 6) 가입한 사람이 추천인 코드를 적으면: 코드 확인 → 기록 → 10명 차면 쿠폰 1장 (승인 대기)
--    코드 = Z + 계정 번호 앞 8자리 (예: Z3F2A9C41). 가입 후 7일 안에만, 평생 한 번만, 자기 자신은 안 돼요
create or replace function public.set_referrer(code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c text;
  ids uuid[];
  ref uuid;
  joined timestamptz;
  n int;
  cid bigint;
begin
  if me is null then return 'login'; end if;
  c := lower(regexp_replace(coalesce(code, ''), '[^0-9A-Za-z]', '', 'g'));
  if left(c, 1) = 'z' then c := substr(c, 2); end if;
  if c !~ '^[0-9a-f]{8}$' then return 'bad'; end if;
  if exists (select 1 from public.referrals where referee = me) then return 'already'; end if;
  select created_at into joined from auth.users where id = me;
  if joined is null or joined < now() - interval '7 days' then return 'late'; end if;
  select array_agg(id) into ids from auth.users where replace(id::text, '-', '') like c || '%';
  if ids is null or array_length(ids, 1) <> 1 then return 'notfound'; end if;
  ref := ids[1];
  if ref = me then return 'self'; end if;
  perform pg_advisory_xact_lock(hashtext(ref::text)); -- 동시에 여러 명이 가입해도 쿠폰이 두 번 생기지 않게
  insert into public.referrals(referee, referrer) values (me, ref) on conflict (referee) do nothing;
  if not found then return 'already'; end if;
  select count(*) into n from public.referrals where referrer = ref and coupon_id is null;
  if n >= 10 then
    insert into public.coupons(user_id, source, note) values (ref, 'referral', '친구 10명 초대') returning id into cid;
    update public.referrals set coupon_id = cid
      where referee in (select referee from public.referrals where referrer = ref and coupon_id is null order by created_at limit 10);
  end if;
  return 'ok';
end $$;

-- 7) 운영자: 그달(예: '2027-02') 좋아요 1등 · 팔로워 1등 쿠폰 만들기 (승인 대기로 · 여러 번 눌러도 한 번만 생겨요)
create or replace function public.admin_make_champion_coupons(month text) returns text
language plpgsql security definer set search_path = public as $$
declare
  m0 timestamptz; m1 timestamptz;
  fu uuid; fcnt int; lu uuid; lcnt int; made int := 0;
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then raise exception 'admin only'; end if;
  if month !~ '^\d{4}-\d{2}$' then return 'bad month'; end if;
  m0 := (month || '-01')::timestamp at time zone 'Asia/Seoul';
  m1 := ((month || '-01')::date + interval '1 month')::timestamp at time zone 'Asia/Seoul';
  if m1 > now() then return 'not finished'; end if; -- 그달이 끝난 뒤에만
  -- 팔로워 1등 (운영자 · 정지 회원 빼고, 동점이면 계정 번호 순)
  select f.followee, count(*) into fu, fcnt from public.follows f
    where f.followee not in (select user_id from public.app_admins)
      and f.followee not in (select user_id from public.banned_users)
    group by f.followee order by count(*) desc, f.followee limit 1;
  -- 좋아요 1등 글 (그달에 올린 글 · 스토리 · 숨긴 글 빼고, 동점이면 먼저 올린 글). 팔로워 1등이면 다음 사람에게
  select p.user_id, count(l.*) into lu, lcnt from public.posts p join public.post_likes l on l.post_id = p.id
    where p.created_at >= m0 and p.created_at < m1
      and coalesce(to_jsonb(p.media) ->> 0, '') not like 'stories/%'
      and p.id::text not in (select post_id from public.hidden_posts)
      and p.user_id not in (select user_id from public.app_admins)
      and p.user_id not in (select user_id from public.banned_users)
      and (fu is null or p.user_id <> fu)
    group by p.id, p.user_id, p.created_at order by count(l.*) desc, p.created_at limit 1;
  if fu is not null then
    insert into public.coupons(user_id, source, period, note) values (fu, 'followers', month, '팔로워 ' || fcnt || '명') on conflict do nothing;
    if found then made := made + 1; end if;
  end if;
  if lu is not null then
    insert into public.coupons(user_id, source, period, note) values (lu, 'likes', month, '글 좋아요 ' || lcnt || '개') on conflict do nothing;
    if found then made := made + 1; end if;
  end if;
  return 'made ' || made;
end $$;

-- 8) 운영자: 쿠폰 승인 또는 거절 (승인하면 회원 쿠폰함에 [사용하기]가 생겨요)
create or replace function public.admin_decide_coupon(cid bigint, ok boolean) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then raise exception 'admin only'; end if;
  update public.coupons set status = case when ok then 'approved' else 'rejected' end, decided_at = now()
    where id = cid and status = 'pending' returning user_id into u;
  return case when u is null then 'none' else 'ok' end;
end $$;

-- 9) 회원: 승인된 내 쿠폰 사용 → 멤버십 30일 (이미 멤버면 끝나는 날에서 30일 더)
create or replace function public.use_coupon(cid bigint) returns date
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  update public.coupons set status = 'used', used_at = now()
    where id = cid and user_id = auth.uid() and status = 'approved' returning user_id into u;
  if u is null then return null; end if;
  return public.zone_add_month(u);
end $$;

-- 10) 운영자: 결제 확인 후 멤버십 30일 주기
create or replace function public.admin_grant_month(target uuid) returns date
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then raise exception 'admin only'; end if;
  return public.zone_add_month(target);
end $$;

revoke all on function public.set_referrer(text) from public, anon;
revoke all on function public.admin_make_champion_coupons(text) from public, anon;
revoke all on function public.admin_decide_coupon(bigint, boolean) from public, anon;
revoke all on function public.use_coupon(bigint) from public, anon;
revoke all on function public.admin_grant_month(uuid) from public, anon;
grant execute on function public.set_referrer(text) to authenticated;
grant execute on function public.admin_make_champion_coupons(text) to authenticated;
grant execute on function public.admin_decide_coupon(bigint, boolean) to authenticated;
grant execute on function public.use_coupon(bigint) to authenticated;
grant execute on function public.admin_grant_month(uuid) to authenticated;
