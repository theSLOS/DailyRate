-- (a) write-side: authorize by bucket, since the path no longer carries auth.uid()
create policy "authenticated can upload post photos" on storage.objects
for insert to authenticated
with check (bucket_id = 'post-photos');

-- (b) stop nulling photo_url in the view — the random path is safe to expose.
--     keep the user_id / author strips (those still protect identity).
create or replace view posts_feed with (security_invoker = on) as
select
  p.id,
  p.rating,
  p.message,
  p.local_date,
  p.created_at,
  p.like_count,
  p.comment_count,
  p.moderation_status,
  p.is_anonymous,
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else p.user_id end            as user_id,
  p.photo_url,
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else pub.username end          as author_username,
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else pub.display_name end      as author_display_name,
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else pub.avatar_url end        as author_avatar_url
from posts p
left join profiles_public pub on pub.id = p.user_id;

