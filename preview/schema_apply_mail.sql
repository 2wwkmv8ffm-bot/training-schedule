-- 💎 멤버십 신청 → 회원에게 코치 연락처 메일 (신청마다 한 번만 보내려고 '보낸 때' 칸 추가 · 여러 번 실행해도 안전)
alter table public.membership_requests add column if not exists mailed_at timestamptz;
