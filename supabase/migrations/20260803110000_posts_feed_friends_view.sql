-- The anonymity strip lives in the SELECT projection, so the WHERE clause can still
-- filter on the real p.user_id. That is what lets a friend's anonymous post reach this
-- feed (as ANONYMOUS_POST_WARNING already promises) without any elevated privilege —
-- a client-side .in('user_id', friendIds) against posts_feed would drop them silently.
create view public.posts_feed_friends
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
left join profiles_public pub on pub.id = p.user_id
where exists (
  select 1
  from friendships f
  where f.user_id = auth.uid()
    and f.friend_id = p.user_id
);

grant select on public.posts_feed_friends to authenticated;
