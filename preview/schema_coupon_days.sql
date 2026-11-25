-- 🎟️ 쿠폰 기간 고르기: 1개월(30일) · 1년(365일) — 운영자 선물 쿠폰 (여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → 칸을 비우고 전부 붙여 넣고 Run

-- 1) 쿠폰마다 '며칠짜리'인지 (지금까지 만든 쿠폰은 모두 30일)
alter table public.coupons add column if not exists days int not null default 30;
alter table public.coupons drop constraint if exists coupons_days_check;
alter table public.coupons add constraint coupons_days_check check (days between 1 and 366);

-- 2) 멤버십 n일 더하기 (안에서만 쓰는 함수 · 앱에서 직접 못 불러요)
create or replace function public.zone_add_days(target uuid, n int) returns date
language plpgsql security definer set search_path = public as $$
declare d date; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  insert into public.memberships(user_id, ends_on) values (target, today + n)
  on conflict (user_id) do update set ends_on = greatest(public.memberships.ends_on, today) + n, updated_at = now()
  returning ends_on into d;
  return d;
end $$;
revoke all on function public.zone_add_days(uuid, int) from public, anon, authenticated;

-- 3) 쿠폰 사용: 그 쿠폰의 기간만큼 (1개월 쿠폰 = 30일, 1년 쿠폰 = 365일)
create or replace function public.use_coupon(cid bigint) returns date
language plpgsql security definer set search_path = public as $$
declare u uuid; n int;
begin
  update public.coupons set status = 'used', used_at = now()
    where id = cid and user_id = auth.uid() and status = 'approved' returning user_id, days into u, n;
  if u is null then return null; end if;
  return public.zone_add_days(u, coalesce(n, 30));
end $$;

-- 4) 운영자 선물 쿠폰: 기간을 골라서 (30 또는 365)
create or replace function public.admin_give_coupon(target uuid, why text, n int) returns bigint
language plpgsql security definer set search_path = public as $$
declare cid bigint;
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then raise exception 'admin only'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'no user'; end if;
  if n not in (30, 365) then raise exception 'days must be 30 or 365'; end if;
  insert into public.coupons(user_id, source, note, status, decided_at, days)
    values (target, 'gift', left(coalesce(nullif(btrim(why), ''), '운영자 선물'), 60), 'approved', now(), n)
    returning id into cid;
  return cid;
end $$;
revoke all on function public.admin_give_coupon(uuid, text, int) from public, anon;
grant execute on function public.admin_give_coupon(uuid, text, int) to authenticated;
