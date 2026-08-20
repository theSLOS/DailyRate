-- Closes unauthenticated read access to live posts, and the deanonymization
-- that came with it. Found 2026-08-20 by putting a real post inside the 36h
-- window and querying with only the publishable key: `posts`, `posts_feed` and
-- `feed_shared` all returned it, and `posts_feed` named the author of an
-- `is_anonymous` post.
--
-- Every previous anon check returned [] and was read as proof of safety. It
-- wasn't — nothing was inside the 36h window at the time. An empty result set
-- proves nothing about a policy.
--
-- Three independent fixes. Each closes the hole on its own for the surface it
-- covers; none is load-bearing for the others.

-- 1. posts' SELECT policy: the live branch never checked identity.
--
-- With auth.uid() null the block subquery matches zero rows, so `not exists`
-- is TRUE and the whole branch passes. Anon has therefore been able to read
-- every live post since 20260713074345. Adding the null check is enough: the
-- first branch (user_id = auth.uid()) is already NULL-safe, since `= NULL`
-- yields NULL rather than true.
--
-- This transitively re-closes `comments` (its policy gates on an `exists`
-- against posts, which applies posts' RLS), `posts_feed` and
-- `posts_feed_friends` (both security_invoker, so they inherit this policy).
drop policy "select own or live posts" on public.posts;

create policy "select own or live posts" on public.posts
for select using (
  user_id = auth.uid()
  or (
    auth.uid() is not null
    and created_at > now() - interval '36 hours'
    and moderation_status = 'approved'
    and not exists (
      select 1 from public.blocks
      where (blocker_id = auth.uid() and blocked_id = posts.user_id)
         or (blocker_id = posts.user_id and blocked_id = auth.uid())
    )
  )
);

-- 2. The anonymity strip was not NULL-safe, in both views.
--
-- `is_anonymous and user_id <> auth.uid()` evaluates to NULL when auth.uid()
-- is null (`user_id <> NULL` is NULL, and `true and NULL` is NULL), so the
-- CASE fell through to ELSE and returned the real author. Verified: an anon
-- read of an is_anonymous post returned its user_id and display_name.
--
-- `is distinct from` is the NULL-safe comparison: it returns true rather than
-- NULL when one side is null, so the strip fires for a viewer with no
-- identity. Kept as defence in depth — fix 1 already stops anon reaching these
-- rows, but this is the layer that holds if anon read is ever opened
-- deliberately, and "the feed is public" must never imply "anonymous authors
-- are named".
--
-- create or replace view cannot reorder or drop columns, so both column lists
-- are reproduced in full and unchanged.
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
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::uuid else p.user_id end as user_id,
  p.photo_url,
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::text else pub.username end as author_username,
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::text else pub.display_name end as author_display_name,
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::text else pub.avatar_url end as author_avatar_url,
  p.region_country_code,
  p.region_state_code,
  p.place_label
from posts p
left join profiles_public pub on pub.id = p.user_id;

create or replace view public.posts_feed_friends
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
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::uuid else p.user_id end as user_id,
  p.photo_url,
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::text else pub.username end as author_username,
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::text else pub.display_name end as author_display_name,
  case when p.is_anonymous and p.user_id is distinct from auth.uid() then null::text else pub.avatar_url end as author_avatar_url,
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

-- 3. feed_shared needs its own guard: security definer bypasses fix 1 entirely.
--
-- It was language sql, which cannot raise, so it could not carry the in-body
-- auth.uid() guard this project requires of every security definer function
-- (see docs/database-architecture.md §4) — and the accompanying
-- `revoke execute ... from public` does not bind anon on this project, the
-- standing finding confirmed four times before this one.
--
-- Rewritten as plpgsql for the guard alone; the query is unchanged. Raising
-- rather than returning zero rows is deliberate: an empty feed is
-- indistinguishable from a quiet day, and that ambiguity is exactly what hid
-- this bug for five weeks.
create or replace function public.feed_shared(
  variant     text,
  region_code text        default null,
  cursor_ts   timestamptz default null,
  page_size   int         default 20
)
returns setof public.posts_feed
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
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
    case when p.is_anonymous then null::uuid else p.user_id end        as user_id,
    p.photo_url,
    case when p.is_anonymous then null::text else pub.username end     as author_username,
    case when p.is_anonymous then null::text else pub.display_name end as author_display_name,
    case when p.is_anonymous then null::text else pub.avatar_url end   as author_avatar_url,
    p.region_country_code,
    p.region_state_code,
    p.place_label
  from posts p
  left join profiles_public pub on pub.id = p.user_id
  where p.created_at > now() - interval '36 hours'
    and p.moderation_status = 'approved'
    and (feed_shared.variant <> 'state'   or p.region_state_code   = feed_shared.region_code)
    and (feed_shared.variant <> 'country' or p.region_country_code = feed_shared.region_code)
    and (feed_shared.cursor_ts is null or p.created_at < feed_shared.cursor_ts)
  order by
    case when feed_shared.variant = 'most_liked' then p.like_count end desc nulls last,
    p.created_at desc
  limit feed_shared.page_size;
end;
$$;
