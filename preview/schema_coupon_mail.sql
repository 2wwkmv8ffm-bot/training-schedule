-- 🎟️ 쿠폰 2단계: 팔로워 1등 자동 사용 · 추천 쿠폰 받기 · 이메일 알림 기록 (schema_referral.sql 다음에 실행 · 여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → New query → 전부 붙여 넣고 Run

-- 1) 쿠폰에 '받기 누른 때' · '메일 보낸 때' 칸
alter table public.coupons add column if not exists requested_at timestamptz;      -- 추천 쿠폰: 회원이 [쿠폰 받기]를 누른 때
alter table public.coupons add column if not exists mailed_request_at timestamptz; -- 운영자에게 '승인해 주세요' 메일 보낸 때
alter table public.coupons add column if not exists mailed_at timestamptz;         -- 회원에게 '쿠폰 받았어요' 메일 보낸 때

-- 2) 예전 운영자용 1등 쿠폰 함수는 아래 자동 함수로 바뀌어요
drop function if exists public.admin_make_champion_coupons(text);

-- 3) 매달 1일이 지나면 (누구든 앱을 처음 열 때) 지난달 1등 쿠폰을 만들어요 — 여러 번 불러도 한 번만 생겨요
--    팔로워 1등: 바로 사용돼서 멤버십 30일 시작 (승인 없음)
--    좋아요 1등: 운영자 승인 대기 (팔로워 1등과 같은 사람이면 좋아요 2등에게)
--    돌려주는 값: 메일을 보낼 쿠폰 목록 [{id, action}]  (auto = 회원+운영자에게 '무료 시작' 메일, review = 운영자에게 '승인해 주세요' 메일)
create or replace function public.zone_monthly_tick() returns json
language plpgsql security definer set search_path = public as $$
declare
  month text := to_char((now() at time zone 'Asia/Seoul') - interval '1 month', 'YYYY-MM');
  m0 timestamptz; m1 timestamptz;
  fu uuid; fcnt int; lu uuid; lcnt int; cid bigint;
  out json[] := '{}';
begin
  if auth.uid() is null then return '[]'::json; end if;
  if exists (select 1 from public.coupons where period = month and source = 'likes')
     and exists (select 1 from public.coupons where period = month and source = 'followers') then return '[]'::json; end if;
  perform pg_advisory_xact_lock(hashtext('zone_tick_' || month));
  m0 := (month || '-01')::timestamp at time zone 'Asia/Seoul';
  m1 := ((month || '-01')::date + interval '1 month')::timestamp at time zone 'Asia/Seoul';
  select f.followee, count(*) into fu, fcnt from public.follows f
    where f.followee not in (select user_id from public.app_admins)
      and f.followee not in (select user_id from public.banned_users)
    group by f.followee order by count(*) desc, f.followee limit 1;
  select p.user_id, count(l.*) into lu, lcnt from public.posts p join public.post_likes l on l.post_id = p.id
    where p.created_at >= m0 and p.created_at < m1
      and coalesce(to_jsonb(p.media) ->> 0, '') not like 'stories/%'
      and p.id::text not in (select post_id from public.hidden_posts)
      and p.user_id not in (select user_id from public.app_admins)
      and p.user_id not in (select user_id from public.banned_users)
      and (fu is null or p.user_id <> fu)
    group by p.id, p.user_id, p.created_at order by count(l.*) desc, p.created_at limit 1;
  if fu is not null then
    cid := null;
    insert into public.coupons(user_id, source, period, note, status, decided_at, used_at)
      values (fu, 'followers', month, '팔로워 ' || fcnt || '명', 'used', now(), now()) on conflict do nothing returning id into cid;
    if cid is not null then
      perform public.zone_add_month(fu);
      out := out || json_build_object('id', cid, 'action', 'auto');
    end if;
  end if;
  if lu is not null then
    cid := null;
    insert into public.coupons(user_id, source, period, note) values (lu, 'likes', month, '글 좋아요 ' || lcnt || '개')
      on conflict do nothing returning id into cid;
    if cid is not null then out := out || json_build_object('id', cid, 'action', 'review'); end if;
  end if;
  return to_json(out);
end $$;

-- 4) 회원: 추천 10명 쿠폰 [쿠폰 받기] → 운영자 승인 대기로 올라가요
create or replace function public.request_coupon(cid bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  update public.coupons set requested_at = now()
    where id = cid and user_id = auth.uid() and source = 'referral' and status = 'pending' and requested_at is null
    returning user_id into u;
  return u is not null;
end $$;

revoke all on function public.zone_monthly_tick() from public, anon;
revoke all on function public.request_coupon(bigint) from public, anon;
grant execute on function public.zone_monthly_tick() to authenticated;
grant execute on function public.request_coupon(bigint) to authenticated;
