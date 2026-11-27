-- 🛡️ 운영자 메일 폭탄 막기: 메일 보낸 기록 표 (여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → 칸을 비우고 전부 붙여 넣고 Run
--
-- 메일 함수(dynamic-processor)가 이 표에 '누가·언제 보냈는지'를 적고,
-- 한 사람이 너무 많이 보내거나 하루 전체 한도를 넘으면 더 안 보내요.
-- 서버(메일 함수)만 쓰는 표라서 앱에서는 읽거나 쓸 수 없어요.

create table if not exists public.email_log (
  id bigserial primary key,
  who uuid,
  created_at timestamptz not null default now()
);
create index if not exists email_log_who_time on public.email_log(who, created_at);
create index if not exists email_log_time on public.email_log(created_at);

alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;
-- 정책을 하나도 안 만들면: RLS가 켜진 상태라 일반 사용자는 한 줄도 못 읽고 못 써요. (서버 함수만 접근)
