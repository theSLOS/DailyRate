-- (a) the column. Base table only — never stripped here or anywhere.
alter table posts
  add column is_anonymous boolean not null default false;

-- (b) the read view. security_invoker keeps posts' own RLS (36h + block) applying;
--     the CASEs withhold identity for anonymous posts from non-authors.
create view posts_feed with (security_invoker = on) as
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
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else p.photo_url end           as photo_url,
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else pub.username end          as author_username,
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else pub.display_name end      as author_display_name,
  case when p.is_anonymous and p.user_id <> auth.uid()
       then null else pub.avatar_url end        as author_avatar_url
from posts p
left join profiles_public pub on pub.id = p.user_id;

-- (c) new objects don't inherit grants (same as profiles_public / likes).
grant select on posts_feed to authenticated;
