-- 🔗 스트라바 연결용 표 (한 번만 실행 · 여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → New query → 전부 붙여 넣고 Run
-- 두 표 모두 서버 기능(strava)만 읽고 써요. 앱이나 다른 사람은 볼 수 없어요 (보안 규칙만 켜고 허용 규칙은 만들지 않아요).

create table if not exists public.strava_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id bigint,
  athlete_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  updated_at timestamptz not null default now()
);
alter table public.strava_links enable row level security;

create table if not exists public.strava_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.strava_states enable row level security;
