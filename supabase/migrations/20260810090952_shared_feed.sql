-- Viewer-independent feed source for the Phase 5.5 Redis cache. Every caller
-- gets identical rows, so one cached blob can serve everyone.
--
-- security definer means posts' RLS does not run here. The 36h window and the
-- moderation check below are therefore the ONLY thing enforcing them on this
-- path — do not remove them without moving that enforcement somewhere else.
-- Deliberately NOT ported from "select own or live posts": the block subquery
-- and the user_id = auth.uid() owner bypass. Both are viewer-specific and are
-- handled client-side by design (see front-server-caching-decisions.md).
--
-- The anonymity strip is unconditional — no auth.uid() anywhere — so an
-- anonymous author's identity never reaches Redis. posts_feed keeps its
-- conditional strip for the per-viewer paths (post detail, friends feed).
-- photo_url is intentionally NOT stripped: since the Phase 4.5 anon-photo
-- rework the path is a bare <uuid>.jpg and carries no author identity.
create or replace function public.feed_shared(
  variant     text,
  region_code text        default null,
  cursor_ts   timestamptz default null,
  page_size   int         default 20
)
returns setof public.posts_feed
language sql
stable
security definer
set search_path = public
as $$
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
    and (variant <> 'state'   or p.region_state_code   = region_code)
    and (variant <> 'country' or p.region_country_code = region_code)
    and (cursor_ts is null or p.created_at < cursor_ts)
  order by
    case when variant = 'most_liked' then p.like_count end desc nulls last,
    p.created_at desc
  limit page_size
$$;

-- functions are granted to PUBLIC by default; on a security definer function
-- that would hand elevated-privilege execution to anon
revoke execute on function public.feed_shared(text, text, timestamptz, int) from public;
grant  execute on function public.feed_shared(text, text, timestamptz, int) to authenticated;
