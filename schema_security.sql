-- 🔒 ZONE 보안 설정: 파일 올리기 제한 + 글자 수 제한 (한 번만 실행 · 여러 번 실행해도 안전)
-- 수파베이스 → SQL Editor → New query → 전부 붙여 넣고 Run

-- 1) 사진·영상 저장 공간(media): 사진·영상 종류만, 파일 하나 20MB까지
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
                               'video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v']
where id = 'media';

-- 2) 자기 폴더에만 올리고·바꾸고·지울 수 있어요 (남의 파일을 덮어쓰거나 지울 수 없어요)
--    글 posts/내아이디/… · 스토리 stories/내아이디/… · 프로필 사진 avatars/내아이디.jpg · 내 운동 사진 활동번호/…(내 활동만)
create or replace function public.media_path_is_mine(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    ((storage.foldername(path))[1] in ('posts', 'stories') and (storage.foldername(path))[2] = auth.uid()::text)
    or path = 'avatars/' || auth.uid()::text || '.jpg'
    or exists (select 1 from public.activities a where a.id::text = (storage.foldername(path))[1] and a.user_id = auth.uid())
  )
$$;

drop policy if exists "media only own folder insert" on storage.objects;
create policy "media only own folder insert" on storage.objects as restrictive for insert
  with check (bucket_id <> 'media' or public.media_path_is_mine(name));
drop policy if exists "media only own folder update" on storage.objects;
create policy "media only own folder update" on storage.objects as restrictive for update
  using (bucket_id <> 'media' or public.media_path_is_mine(name))
  with check (bucket_id <> 'media' or public.media_path_is_mine(name));
drop policy if exists "media only own folder delete" on storage.objects;
create policy "media only own folder delete" on storage.objects as restrictive for delete
  using (bucket_id <> 'media' or public.media_path_is_mine(name)
         or exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

-- 3) 글자 수 제한 (앱보다 넉넉하게: 글 2,000자 · 댓글 1,000자 · 닉네임 30자)
--    'not valid' = 이미 있는 글은 검사하지 않고, 앞으로 올리는 글만 검사해요
alter table public.posts drop constraint if exists posts_body_len;
alter table public.posts add constraint posts_body_len check (body is null or char_length(body) <= 2000) not valid;
alter table public.post_comments drop constraint if exists comments_body_len;
alter table public.post_comments add constraint comments_body_len check (char_length(body) <= 1000) not valid;
alter table public.members drop constraint if exists members_nick_len;
alter table public.members add constraint members_nick_len check (nickname is null or char_length(nickname) <= 30) not valid;
