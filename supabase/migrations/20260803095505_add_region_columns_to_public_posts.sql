alter table public.posts
  add column region_country_code text,
  add column region_state_code text;

create or replace view public.posts_feed
with (security_invoker = on) as
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
  case when p.is_anonymous and p.user_id <> auth.uid() then null::uuid else p.user_id end as user_id,
  p.photo_url,
  case when p.is_anonymous and p.user_id <> auth.uid() then null::text else pub.username end as author_username,
  case when p.is_anonymous and p.user_id <> auth.uid() then null::text else pub.display_name end as author_display_name,
  case when p.is_anonymous and p.user_id <> auth.uid() then null::text else pub.avatar_url end as author_avatar_url,
  p.region_country_code,
  p.region_state_code,
  p.place_label
from posts p
left join profiles_public pub on pub.id = p.user_id;
