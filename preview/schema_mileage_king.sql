-- 🏃 마일리지왕 (이번 달 운동 거리 1등) — 배지만, 쿠폰 없음 (여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → 칸을 비우고 전부 붙여 넣고 Run
--
-- 앱은 개인정보 보호 때문에 '다른 사람의 운동 기록'을 다 읽을 수 없어요.
-- 그래서 서버에서만 계산해서 '이번 달 거리 1등'의 아이디만 돌려줘요 (거리 숫자·개인 기록은 안 나가요).
-- 운영자 계정 · 이용 정지된 회원 · 스트라바에서 가져온 기록은 빼요.

create or replace function public.zone_mileage_king() returns uuid
language sql security definer set search_path = public stable as $$
  select a.user_id
  from public.activities a
  where a.started_at >= date_trunc('month', now() at time zone 'Asia/Seoul')
    and a.started_at <  (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')
    and coalesce(a.source, '') <> 'strava'
    and a.user_id not in (select user_id from public.app_admins)
    and a.user_id not in (select user_id from public.banned_users)
  group by a.user_id
  having coalesce(sum(a.distance_m), 0) > 0
  order by sum(a.distance_m) desc
  limit 1
$$;

revoke all on function public.zone_mileage_king() from public, anon;
grant execute on function public.zone_mileage_king() to authenticated;
