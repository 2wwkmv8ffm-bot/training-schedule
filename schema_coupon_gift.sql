-- 🎁 운영자가 고른 회원에게 쿠폰 직접 보내기 (여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → 칸을 비우고 전부 붙여 넣고 Run

-- 1) 쿠폰 종류에 '운영자 선물'(gift) 추가
alter table public.coupons drop constraint if exists coupons_source_check;
alter table public.coupons add constraint coupons_source_check check (source in ('referral', 'likes', 'followers', 'gift'));

-- 2) 운영자만: 고른 회원에게 승인된 쿠폰 1장 (회원 쿠폰함에 [사용하기]가 바로 생겨요)
create or replace function public.admin_give_coupon(target uuid, why text) returns bigint
language plpgsql security definer set search_path = public as $$
declare cid bigint;
begin
  if not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then raise exception 'admin only'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'no user'; end if;
  insert into public.coupons(user_id, source, note, status, decided_at)
    values (target, 'gift', left(coalesce(nullif(btrim(why), ''), '운영자 선물'), 60), 'approved', now())
    returning id into cid;
  return cid;
end $$;
revoke all on function public.admin_give_coupon(uuid, text) from public, anon;
grant execute on function public.admin_give_coupon(uuid, text) to authenticated;
