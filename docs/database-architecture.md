# Database Architecture — DayRate

This document describes the Supabase/Postgres backend **as actually built**,
not an aspirational design. Where something is decided but not yet applied,
that's called out explicitly (see §7). For a more
granular, frequently-updated build log, see `memory/project-phase-status.md`
— treat that as the more current source if the two ever disagree; this doc is
the settled reference once a phase's decisions stop moving.

For the **reasoning** behind how feeds are served, cached, personalized, and
kept anonymous (the front server, Redis, the anonymity strip-at-DB decision,
moderation of anonymous posts, the friends feed) — see
`docs/feed-and-caching-architecture.md`. That's the *why*; this doc stays the
schema/RLS *what*.

---

## 1. Roles overview

| Role | Who uses it | What it can see |
|---|---|---|
| `anon` | Unauthenticated app requests | Nothing — no anon read policy exists on `posts` |
| `authenticated` | Logged-in users, via the app | Own posts (any age) + everyone's live (last-36h, approved) posts on `posts`; everyone's `id`/`username`/`display_name`/`avatar_url` via the `profiles_public` view (own `profiles` row only via the base table); own like rows on `likes` (insert/delete/select own only — no "who liked this" reader); everyone's comments on any post they can see (insert own only; no update/delete yet) |
| `service_role` | Not yet used — no Edge Functions or admin tooling exist yet | Would bypass RLS entirely if used |
| Postgres superuser (dashboard) | You personally, for schema changes and manual ops | Everything |

**Hard rule:** `service_role` key and the direct Postgres connection string
must never appear in the Expo app bundle or any client-shipped code — they'd
live only in server-side environment variables (Edge Function secrets),
whenever that tooling gets built.

---

## 2. Core tables

```sql
-- posts (Phase 1; region_country_code/region_state_code added Phase 5)
id                  uuid primary key default gen_random_uuid()
user_id             uuid references profiles(id) not null
rating              int not null
message             text not null
local_date          date not null
created_at          timestamptz default now()
location            geography(Point, 4326)   -- present, permanently unused: Phase 5 never stores raw coordinates, see below
photo_url           text                     -- storage *path* in the private 'post-photos' bucket, not a public URL
photo_thumb_url     text
moderation_status   text                     -- drives Phase 3's "live" visibility condition; no moderation workflow sets/transitions it yet
is_anonymous        boolean not null default false  -- Phase 4.5; drives the posts_feed anonymity strip below, not RLS itself
like_count          int default 0            -- kept in sync by a trigger (Phase 4, §4)
comment_count       int default 0            -- kept in sync by a trigger (Phase 4, §4)
place_label         text                     -- human-readable label from resolve_region(), e.g. "Victoria, Australia"
region_country_code text                     -- from resolve_region(); null if the post's point matched no boundary
region_state_code   text                     -- from resolve_region(); null if only the country tier matched (or no state exists)

unique (user_id, local_date)
index posts_user_id_created_at_idx on (user_id, created_at desc)  -- Phase 4.5 prep; marginal help for user_id-scoped scans (usePostHistory)
```

```sql
-- profiles (Phase 0), auto-created via a trigger on auth.users insert
id                       uuid primary key references auth.users
username                 text
display_name             text
avatar_url               text
bio                      text
role                     text
is_suspended             boolean default false
notification_preferences jsonb
reminder_time            time
timezone                 text   -- backfilled client-side on first sign-in (hooks/useEnsureTimezone.ts) since onboarding doesn't collect it
tier                     text not null default 'free'  -- paywall insurance, unused; 'free' | 'premium'. Deliberately NOT in profiles_public (see below) so it stays private
created_at               timestamptz default now()
```

Both tables have RLS enabled.

```sql
-- profiles_public (Phase 3) — a view, not a table
id            uuid
username      text
display_name  text
avatar_url    text
```

Plain view (`create view ... as select id, username, display_name, avatar_url from profiles;`) with `grant select ... to authenticated`, and no `security_invoker`. That last part matters: a view without `security_invoker` runs as its *creator*, not the querying user — which is what lets it read every row of the owner-only-RLS `profiles` table and expose just these four columns to any signed-in user, without touching `profiles`'s own RLS at all. The column list is the entire privacy boundary here; there's no RLS check on the view itself, so anything added to that `select` becomes public immediately. Deliberately excludes `bio`, `role`, `is_suspended`, `notification_preferences`, `reminder_time`, `timezone`, `tier`.

```sql
-- likes (Phase 4)
id          uuid primary key default gen_random_uuid()
post_id     uuid references posts(id) on delete cascade not null
user_id     uuid references profiles(id) on delete cascade not null
created_at  timestamptz default now()

unique (post_id, user_id)   -- also serves as the index on post_id (leading column)
```

RLS enabled. `like_count` on `posts` is kept in sync by a trigger, not by the client — see §4.

```sql
-- comments (Phase 4) — top-level only so far; parent_comment_id
-- exists ahead of the replies concept but nothing writes to it yet
id                 uuid primary key default gen_random_uuid()
post_id            uuid references posts(id) on delete cascade not null
user_id            uuid references profiles(id) on delete cascade not null
parent_comment_id  uuid references comments(id) on delete cascade   -- nullable, unused until replies
body               text not null
created_at         timestamptz default now()

index on post_id   -- no unique(post_id, user_id) here, unlike likes: one user can post many comments
```

RLS enabled. `comment_count` on `posts` is kept in sync by a trigger, same mechanism as `like_count` — see §4. **Replies are now built** (Phase 4): `parent_comment_id` is written, with a client-enforced 2-level cap (a reply-to-a-reply resolves back to the top-level parent, never a 3rd tier — see `components/CommentThread.tsx`). No schema change was needed for replies; the counter trigger already counts every row regardless of `parent_comment_id`.

```sql
-- blocks (Phase 4)
blocker_id  uuid not null references profiles(id) on delete cascade
blocked_id  uuid not null references profiles(id) on delete cascade
created_at  timestamptz default now()

primary key (blocker_id, blocked_id)   -- composite PK, no surrogate id: nothing references a block by id
check (blocker_id <> blocked_id)       -- self-blocking impossible at the DB layer
```

RLS enabled — see §4 for its deliberately asymmetric policy (you can see who you blocked; no one can discover who blocked them).

```sql
-- reports (Phase 4)
id           uuid primary key default gen_random_uuid()
reporter_id  uuid references profiles(id) not null
target_type  text not null   -- check: 'post' | 'comment' | 'user'  ('user' added Phase 4.7)
target_id    uuid not null   -- polymorphic across posts/comments — deliberately NO FK
reason       text
status       text default 'pending'   -- check: 'pending' | 'reviewed' | 'dismissed'
reviewed_by  uuid references profiles(id) on delete set null   -- not cascade: losing an admin shouldn't delete reports
reviewed_at  timestamptz
created_at   timestamptz default now()
```

RLS enabled — insert-only for regular users, no select/update/delete (§4). The admin review workflow (reading/transitioning reports) is deferred; data capture exists now.

```sql
-- friend_requests (Phase 4.7)
requester_id  uuid not null references profiles(id) on delete cascade
addressee_id  uuid not null references profiles(id) on delete cascade
created_at    timestamptz not null default now()

primary key (requester_id, addressee_id)   -- composite PK, no surrogate id: a request is addressed by its pair
check (requester_id <> addressee_id)       -- self-friending impossible at the DB layer

unique index friend_requests_pair_idx on (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
                                           -- first expression index in the repo; the PK stops a duplicate A→B,
                                           -- this stops a reverse B→A while A→B is still pending
index friend_requests_addressee_idx on (addressee_id)
                                           -- "requests sent to me" — the PK's index can't serve it (wrong leading column)
```

A **pending queue, not a relationship**: directional, and every row is destined for deletion (accept consumes it, reject/cancel deletes it). Unlike `blocks` — which is superficially the same two-uuid shape — friend requests are *not* legitimately directional as a pair, which is the entire reason for the normalising unique index. RLS enabled; see §4.

```sql
-- friendships (Phase 4.7)
user_id     uuid not null references profiles(id) on delete cascade
friend_id   uuid not null references profiles(id) on delete cascade
created_at  timestamptz not null default now()

primary key (user_id, friend_id)   -- composite PK, no surrogate id
check (user_id <> friend_id)       -- guards against a bug in the accept RPC, not against a client (no client write path exists)
```

**Mirrored: two rows per accepted pair**, both `(A,B)` and `(B,A)`. Deliberate trade-off for an undirected graph — pay 2× storage and one atomic two-row write on the rare accept event, so every friend-list read (which happens on every friends-feed load) is a trivial `where user_id = auth.uid()` index scan instead of an `OR` across two columns. Has **no client write path at all**: mutations only happen through the two `security definer` RPCs in §4.

```sql
-- posts_feed (Phase 4.5) — a view, security_invoker = on
id, rating, message, local_date, created_at, like_count, comment_count,
moderation_status, is_anonymous, photo_url, region_country_code,
region_state_code, place_label,
user_id             -- null when is_anonymous and user_id <> auth.uid()
author_username     -- same null-when-anonymous projection, from profiles_public
author_display_name -- "
author_avatar_url   -- "
```

The Explore feed's actual read path — `security_invoker = on` means it runs as the *querying* user, so `posts`' own RLS (§4, the 36h/owner rule) still applies underneath, unlike `profiles_public`. On top of that it does the **anonymity strip**: for a row where `is_anonymous` and the viewer isn't the author, `user_id`/`author_username`/`author_display_name`/`author_avatar_url` are projected as `null` in the `select` itself — not filtered out, the row still returns, just de-identified. `photo_url` is deliberately **not** stripped (see `20260725080735_anon_photo_path_rework.sql` in §6: the storage path is a random UUID that carries no identity once upload authorization moved to bucket-scoped rather than path-scoped). This same case-when shape is why a shared cache blob is safe to serve to every viewer identically — see `docs/feed-and-caching-architecture.md` §3-4.

```sql
-- posts_feed_friends (Phase 4.8) — a view, security_invoker = on
-- same column list and anonymity-strip projection as posts_feed, plus:
where exists (
  select 1 from friendships f
  where f.user_id = auth.uid() and f.friend_id = p.user_id
)
```

Same projection as `posts_feed`, restricted to the viewer's friends. The `where` clause filters on the **real** `p.user_id` (not the nulled projection), which is what lets a friend's anonymous post reach this feed at all — a client-side `.in('user_id', friendIds)` run against `posts_feed` would silently drop every anonymous friend post, since their `user_id` already reads `null` by the time the client sees it. This is also the mechanism behind the friends-feed soft-anonymity trade-off — see `memory/friends-feature-decisions.md`.

```sql
-- region_boundaries (Phase 5) — bundled reference data, not user-generated
id            serial primary key
admin_level   text not null check (admin_level in ('country', 'state'))
country_code  text not null
state_code    text                     -- null when admin_level = 'country'
name          text not null
geom          geography(MultiPolygon, 4326) not null

check ((admin_level = 'country') = (state_code is null))
index region_boundaries_geom using gist (geom)   -- makes ST_Covers() below an index scan, not a full-table one
```

Seeded once from Natural Earth boundary polygons via `20260801064023_seed_region_boundaries.sql`, generated offline with `ogr2ogr` and committed as a one-time SQL import; the app never re-derives or updates this data. RLS enabled, `select` open to any `authenticated` user (it's reference data, not per-user). **Country tier (1:110m) is full world coverage, 177 countries. State tier (1:50m) is not**: 294 features covering only 9 countries (`RU, US, IN, ID, CN, BR, CA, AU, ZA`) — accepted 2026-08-03 rather than reseeding from 1:10m, see §8's verification entry below and `memory/anonymity-and-proximity-decisions.md`.

`resolve_region(lng, lat) returns (country_code, state_code, place_label)` — a `stable` (not `security definer`) function, `authenticated`-only via `revoke`/`grant execute`. One `ST_Covers`-driven scan against `region_boundaries`, conditionally aggregated to get both the country and (if one exists) the state tier in a single pass rather than two queries. Returns **zero rows**, not an error, when the point matches no boundary (open ocean, coverage gaps) — the caller's fallback-to-Most-liked logic depends on being able to tell "no region" apart from an error. Called once per post at creation time; the result is persisted onto `posts.region_country_code`/`region_state_code`/`place_label` — **no raw coordinates are ever written to `posts`** (`posts.location` stays permanently unused, see above). Full proximity design and the sparse-region fallback: `memory/anonymity-and-proximity-decisions.md`.

---

## 3. Entry-window rule

Product-specific rule, replacing a naive "±1 day of `created_at`" check: a
day's entry can only be **created** starting 4pm local time on that day, and
remains **editable** until noon the next day (both edges inclusive); 12pm–4pm
is a dead zone with no active posting window.

Enforced server-side by a shared SQL function `get_entry_date(ts, tz)`, used
by both the insert-validation trigger and the update RLS policy, and mirrored
client-side in `utils/getEntryDate.ts` for UI branching (dead-zone messaging,
create-vs-edit switching). Both must stay in sync if the window definition
ever changes.

The exact SQL for `get_entry_date`, the insert trigger, and the update policy
was applied by hand via the dashboard SQL editor and hasn't been captured as
a migration file yet — see §6.

---

## 4. Row-level security policies

**Current, applied (as of 2026-07-13):**
- SELECT: `select own or live posts` — `user_id = auth.uid()` OR
  (`created_at > now() - interval '36 hours'` AND `moderation_status = 'approved'`).
  Replaces the original owner-only `select own posts` policy, adding public
  visibility for the Explore feed (Phase 3). Applied via
  `supabase/migrations/20260713074345_extend_posts_select_policy.sql`.
- INSERT: owner-only, gated by the entry-window trigger (§3).
- UPDATE: owner-only, gated by `get_entry_date` (§3).

```sql
drop policy "select own posts" on posts;
create policy "select own or live posts" on posts
for select using (
  user_id = auth.uid()
  or (created_at > now() - interval '36 hours' and moderation_status = 'approved')
);
```

**Updated again in Phase 4** (`20260721053057_block_exclusion_visibility.sql`):
the *cross-user* branch gained a two-way block exclusion — the same live post is
hidden if a block exists in either direction between the requester and the
post's owner. The `user_id = auth.uid()` (own content) branch is untouched:
blocking never hides your own posts from yourself.

```sql
-- the cross-user branch now also requires:
and not exists (
  select 1 from blocks
  where (blocker_id = auth.uid() and blocked_id = posts.user_id)
     or (blocker_id = posts.user_id and blocked_id = auth.uid())
)
```

**Verified end-to-end** — both DB-level (direct REST calls with two real
test accounts) and app-level (through the actual UI). See §8.

**Important:** RLS defines what a query is *allowed* to return for the
requester — it doesn't scope a query to what a specific screen wants. Any
query against `posts` can return other users' live posts unless the query
adds its own explicit filter. `hooks/usePosts.ts` and
`hooks/usePostHistory.ts` add an explicit `.eq('user_id', userId)` to narrow
back down to "just mine"; `hooks/useExploreFeed.ts` adds the inverse —
`.neq('user_id', userId)` — since RLS makes others' posts visible but
doesn't hide your own from a feed that shouldn't include them.
`hooks/usePost.ts` (single post by id, for the detail screen) adds neither
filter, since it deliberately wants the *full* RLS-permitted set for one id.

**`likes` (Phase 4):**
- SELECT/INSERT: `user_id = auth.uid()` AND `exists(select 1 from posts where posts.id = likes.post_id)`.
  Neither policy is `security definer`, so that `posts` subquery runs under
  the *invoking* user's own privileges — meaning it's automatically filtered
  by `posts`' own SELECT policy above. A like on a post the requester
  couldn't otherwise see is rejected by this `exists(...)` check, which is
  what makes likes "drop out of reach" alongside an expired post, per spec.
  Deliberately scoped to "your own like status only" — no policy exists for
  reading *other* users' individual like rows (no "who liked this" feature
  is built).
- DELETE: `user_id = auth.uid()` only, no visibility gate — unliking your
  own past like is harmless even once its post has aged out of public view.
- **Counter trigger** (`handle_like_count_change`, fires after insert/delete
  on `likes`): `update posts set like_count = like_count ± 1 where id = ...`.
  Marked `security definer` with `set search_path = public` — required,
  not optional. `posts`' UPDATE policy is owner-only, and a liker is almost
  never a post's owner; without `security definer` the trigger's own
  `UPDATE` would run as the *liker*, get filtered out by that owner-only
  policy, and silently affect 0 rows — no error, just a counter that never
  moves for likes from anyone but the post's own author. `security definer`
  makes the trigger run as its owner instead, bypassing that check — same
  mechanism `profiles_public` already uses to bypass `profiles`' RLS.
  **Verified cross-user** 2026-07-20 (see §8): test1 liking a post owned by
  test2 correctly incremented that post's `like_count`, which would be
  impossible without the `security definer` bypass.
- `likes` needed its own `grant select, insert, delete ... to authenticated`
  for the same reason `profiles_public` did — `auto_expose_new_tables` is
  unset in `supabase/config.toml`, so new tables aren't reachable via the
  Data API without an explicit grant.

**`comments` (Phase 4):**
- SELECT: `exists(select 1 from posts where posts.id = comments.post_id)` —
  **no `user_id` restriction**, unlike `likes`. This is the meaningful
  difference from the likes policy: a comment thread only works if everyone
  who can see the post can read *everyone's* comments on it, not just their
  own. The visibility gate (comment drops out of reach with an expired post)
  works the same way as likes — same non-`security definer` subquery
  composition, automatically filtered by `posts`' own SELECT policy.
- INSERT: `user_id = auth.uid()` AND the same visibility `exists(...)` check
  — you can only comment as yourself, and only on a post you can see.
- **No UPDATE or DELETE policy at all** — deliberate scope decision, not an
  oversight. Nothing in the Phase 4 spec calls for editing or deleting
  comments, only creating them; building that now would be solving a
  problem that isn't asked for. `grant` only covers `select, insert`
  accordingly (no `delete`/`update` granted).
- **Counter trigger** (`handle_comment_count_change`) — identical mechanism
  and identical `security definer` reasoning to `like_count`'s trigger.
  Counts *every* row in `comments` regardless of `parent_comment_id`, so
  once replies exist they'll count toward the total too (matches how a
  "47 comments" total normally includes the whole thread, not just
  top-level) — no changes needed to this trigger when replies are built.
- Comments' SELECT policy gained its **own** two-way block-exclusion clause
  (on `comments.user_id`) in the same Phase 4 migration, independent of the
  post's own visibility — so a blocked person's individual comment disappears
  even on a post you still own and can see.

**`blocks` (Phase 4):** RLS is intentionally **asymmetric**, unlike every other
table. SELECT is scoped to `blocker_id = auth.uid()` only — you can see who
*you* blocked, but **no policy lets anyone discover who has blocked them** (a
deliberate privacy decision; verified: the blocked user's `select *` returns
`[]`, not a permission error and not the row). INSERT/DELETE are both gated by
`blocker_id = auth.uid()`; no UPDATE policy (a block either exists or doesn't).

**`reports` (Phase 4, widened Phase 4.7):** **insert-only for regular users — no
SELECT, UPDATE, or DELETE policy at all** (the reporter can't even read their own
reports back). The insert `with check` branches on `target_type`, and the three
branches do **not** all mean the same thing:
- `'post'` / `'comment'` — an `exists` against `posts` / `comments`, which
  transitively inherits both the 36h window and the block exclusion. Here the
  check really is a *visibility* gate.
- `'user'` (Phase 4.7) — an `exists` against **`profiles_public`**, plus
  `target_id <> auth.uid()`. This is an **existence check, not a visibility
  check**: `profiles_public` carries no window and no block clause, so a user
  stays reportable even if they have blocked you. Deliberate — otherwise
  blocking someone would make you unreportable by them.
- It must reference `profiles_public`, **never `profiles`**. A policy subquery
  runs as the invoker and `profiles` RLS is owner-only, so `exists (select 1 from
  profiles ...)` would match only the reporter's own row — silently rejecting
  every report of another user while allowing self-reports. Verified both
  directions 2026-07-28 (see §8).

The admin review UI is deferred; only data capture exists now.

**`friend_requests` (Phase 4.7):**
- SELECT: `requester_id = auth.uid() or addressee_id = auth.uid()` — **either
  party**. Both directions are needed: you must see requests sent *to* you to
  act on them, and requests *from* you to cancel them. Verified a third,
  uninvolved account gets `[]`.
- INSERT: `requester_id = auth.uid()` — you can't fabricate a request from
  someone else.
- DELETE: **either party**, one policy covering both "reject the request sent
  to me" and "cancel the request I sent" — they're the same row operation seen
  from opposite ends.
- No UPDATE policy (a request either exists or it doesn't).

**`friendships` (Phase 4.7):**
- SELECT: `user_id = auth.uid()` **only**. You read your own row's `friend_id`;
  you never need the mirrored other-direction row. Keeping this narrow is what
  makes the mirrored design pay off — the friend-list read never needs an `OR`.
- **No INSERT, UPDATE or DELETE policy at all.** This is the table's entire
  security model: mutation is impossible from a client because no policy
  authorises it, and the only writers are the two RPCs below. Verified — a
  direct `DELETE`/`PATCH` affects **zero rows** (both mirror rows survive) and
  a direct `INSERT` returns `42501`.

**`accept_friend_request(other_user_id)` / `remove_friendship(other_user_id)`
(Phase 4.7):** both `security definer` with `set search_path = public` — the
repo's **first client-callable RPCs** and first non-trigger use of the pattern.
The bypass is required because both operations must write the *other* user's
row (`friendships` is mirrored), which no policy running as the calling user
can authorise. The critical consequence: `security definer` turns RLS off
inside the body, so **the function body is the only access check that exists**.

- `accept_friend_request` **deletes the `friend_requests` row first, then
  checks `found`, and only then inserts.** The delete *is* the authorization
  check — if it matched nothing, no request existed and the caller has no
  right to be there (`raise ... errcode = 'P0001'`). Ordering also matters for
  concurrency: `DELETE` takes the row lock, so exactly one of two simultaneous
  callers wins; insert-first would let both reach the insert and collide on the
  PK. A `select ... exists` pre-check would be wrong — `SELECT` takes no row
  lock under READ COMMITTED, leaving a TOCTOU gap.
  - The predicate is **strictly directional** (`requester_id = other_user_id
    and addressee_id = auth.uid()`), so you can only accept a request sent *to*
    you. A symmetric predicate would let a requester accept their own outbound
    request and self-serve a friendship — collapsing mutual consent into a
    one-way follow. **Attack-tested both ways** (force-friend with no request,
    and requester self-accepting): both correctly raise `P0001`.
  - `on conflict do nothing` on the mirrored insert guards a stranding case: a
    request can exist between two people who are already friends, and without
    it the PK collision would roll back the delete too, leaving that request
    permanently unacceptable.
- `remove_friendship` uses a **symmetric** predicate, which is correct *here*
  because every disjunct pins one side to `auth.uid()` — the caller can only
  delete a pair they belong to. No `found` guard: unfriending a non-friend is a
  deliberate silent no-op, since there's no precondition the user needs told
  about (unlike accept).
- Both carry a null-`auth.uid()` guard (`errcode = '28000'`). Both are
  `revoke execute ... from public` then `grant execute ... to authenticated` —
  because **`CREATE FUNCTION` grants EXECUTE to PUBLIC by default**. No earlier
  migration needed this, since the repo's only other functions are triggers that
  nothing calls directly.

**`friend_count(target_user_id)` (Phase 4.7):** also `security definer`, for a
different reason from the two above — it isn't writing anything, it's *reading*
past `friendships`' `user_id = auth.uid()` SELECT policy, which makes another
user's count unreadable by any query a client could write. Because the table is
mirrored, `count(*) where user_id = <them>` is exactly their friend count with no
`OR`. `plpgsql` rather than `language sql` specifically so it can `raise` the
null-`auth.uid()` guard. Publishes a **count, never a list** — friend identities
stay behind the unchanged policy, verified both ways in §8. See §7 for the
accepted inference channel.

> **Correction (verified 2026-07-28): the `revoke execute ... from public` does
> not actually bind `anon` on this project.** An anon call to either RPC returns
> `28000` — which is raised from *inside* the function body, meaning the call got
> past the EXECUTE check. If the revoke were binding, it would fail at the
> privilege check with `42501` and never reach the body. Confirmed directly:
> `get_entry_date`, which has no revoke and no guard, executes fine as `anon` and
> returns a result. So `anon` holds EXECUTE on public functions independently of
> the `PUBLIC` pseudo-role — the same root cause as the table-grants finding
> below.
>
> **Consequence: the in-body `auth.uid() is null` guard is the only thing keeping
> `anon` out of these functions.** Keep writing the revoke — it is correct,
> portable and free — but never let it be the sole defence. Every `security
> definer` function in this project needs the guard.

> **Important correction to the mental model of `grant` in this repo
> (verified 2026-07-28).** The per-verb `grant` lines in these migrations do
> **not** restrict anything on the remote project: `reports` was granted
> *insert only*, yet a `SELECT` returns `200 []` and a `DELETE` returns `204`;
> `blocks` accepts an `UPDATE` despite having neither an update grant nor an
> update policy. `authenticated` holds broad table privileges regardless, so
> **RLS is the sole enforcement layer** — `enable row level security` plus the
> set of policies does 100% of the work on every table. Keep writing narrow
> grants (they document intent, and they do bind locally where
> `auto_expose_new_tables` is unset in `supabase/config.toml`), but never treat
> one as a security boundary.
>
> Related trap when verifying: **RLS denies UPDATE/DELETE silently.** With RLS
> on and no policy for that verb, the operation matches zero rows and returns
> `204` — it does not error. Only INSERT raises (`42501`, "new row violates
> row-level security policy"). Assert on **row counts before/after**, not on
> status codes, when testing that a write is blocked.

---

## 5. Storage

Private bucket `post-photos` (not public), with policies scoped per-user
folder (exact policy SQL not yet captured as a migration — applied by hand).
`posts.photo_url` stores the storage *path*, not a public URL;
`utils/getSignedPhotoUrl.ts` + `hooks/useSignedPhotoUrl.ts` mint a fresh
signed URL at read time. Chosen over a public bucket specifically so photo
access can be revoked later (the 36h rule, blocking, moderation) — a
permanent public URL can't be taken back once shared.

**Cross-user photo visibility fix (Phase 4,
`20260721070228_photo_storage_cross_user_visibility.sql`):** the original
`storage.objects` policies were strictly owner-only and never mirrored the 36h
window, so no one could ever see anyone else's photos (a latent Phase 1 bug,
surfaced the first time a photo-bearing post was viewed cross-user). The fix
adds one permissive SELECT policy that allows a read when a `posts` row's
`photo_url` matches the object path **and** that post is currently visible by
the same rule `posts`' own SELECT policy uses (own, or live + approved + not
blocked either direction). **Known duplication risk, flagged:** that visibility
condition now lives in three places (`posts` policy, `comments` policy, this
storage policy) — if the rule changes, all three must change together.

**Phase 4.5 change (planned):** the current path embeds the uploader's
`user_id` as its first folder segment, which would deanonymize an anonymous
post via its photo URL. From 4.5, new uploads use a **non-identifying path
(random UUID)**, and the write-side policy moves off path-prefix identity — see
`memory/anonymity-and-proximity-decisions.md`. Existing photos are untouched
(all pre-4.5 posts are non-anonymous); the cross-user *read* policy above is
scheme-agnostic and unaffected.

---

## 6. Migration tracking

Started 2026-07-13, via the Supabase CLI (`npx supabase init`, then
`npx supabase migration new <name>` + `npx supabase db push`). Four
migrations so far:
- `supabase/migrations/20260713074345_extend_posts_select_policy.sql` — the
  SELECT policy change in §4.
- `supabase/migrations/20260713092053_add_profiles_public_view.sql` — the
  `profiles_public` view in §2.
- `supabase/migrations/20260720103540_add_likes_table_and_trigger.sql` —
  the `likes` table, its RLS, and the `security definer` counter trigger,
  both in §2/§4.
- `supabase/migrations/20260720115611_add_comments_table_and_trigger.sql`
  — the `comments` table, its RLS, and its `security definer` counter
  trigger, both in §2/§4.
- `supabase/migrations/20260721043156_blocker.sql` — the `blocks` table and
  its asymmetric RLS (§2/§4).
- `supabase/migrations/20260721053057_block_exclusion_visibility.sql` — two-way
  block exclusion added to `posts`' and `comments`' SELECT policies (§4).
- `supabase/migrations/20260721053608_add_reports_table.sql` — the `reports`
  table, insert-only RLS (§2/§4).
- `supabase/migrations/20260721070228_photo_storage_cross_user_visibility.sql`
  — the cross-user photo SELECT policy on `storage.objects` (§5).
- `supabase/migrations/20260725080735_anon_photo_path_rework.sql` — the
  bucket-scoped upload policy on `storage.objects` and the `create or replace`
  of `posts_feed` that stops nulling `photo_url` (§2/§5).
- `supabase/migrations/20260725141645_add_profiles_tier_and_posts_index.sql` —
  `profiles.tier` (paywall insurance) and the `posts_user_id_created_at_idx`
  index (§2).
- `supabase/migrations/20260725150000_add_is_anonymous_and_posts_feed_view.sql`
  — `posts.is_anonymous` and the `security_invoker` `posts_feed` view (§2/§4).
- `supabase/migrations/20260728093817_friends.sql` — the `friend_requests` and
  `friendships` tables, their RLS, and the `accept_friend_request` /
  `remove_friendship` `security definer` RPCs (§2/§4).
- `supabase/migrations/20260728110551_user_add_to_reports.sql` — widens
  `reports.target_type` to allow `'user'` and rewrites the insert policy with a
  third branch (§2/§4).
- `supabase/migrations/20260728110736_friend_count.sql` — the `friend_count`
  `security definer` function (§4/§7).
- `supabase/migrations/20260730050811_region_boundaries.sql` — the
  `region_boundaries` table, its GiST index, and RLS (§2).
- `supabase/migrations/20260730052915_region_boundries_policy_fix.sql` —
  rebinds `region_boundaries`' SELECT policy to `authenticated` explicitly
  (the original didn't specify a role).
- `supabase/migrations/20260801064023_seed_region_boundaries.sql` — the
  one-time Natural Earth boundary-polygon data import (§2).
- `supabase/migrations/20260803074846_resolve_region.sql` — the
  `resolve_region()` function (§2).
- `supabase/migrations/20260803095505_add_region_columns_to_public_posts.sql`
  — `posts.region_country_code`/`region_state_code`, and the `create or
  replace` of `posts_feed` that adds them to its projection (§2).
- `supabase/migrations/20260803110000_posts_feed_friends_view.sql` — the
  `posts_feed_friends` view (§2).

Everything before that (Phases 0–2: `posts`/`profiles` schema, the
entry-window trigger and function in §3, storage bucket policies in §5) was
applied by hand via the Supabase dashboard SQL editor and is **not** captured
as migration files — this document and `memory/project-phase-status.md`
remain the only record of that earlier state. Going forward, schema and
policy changes should go through a migration file rather than the dashboard,
so drift like this doesn't recur.

---

## 7. Not yet designed / explicitly deferred

- **`moderation_status` workflow** — the column exists and is read by the
  Phase 3 RLS policy, but nothing sets or transitions it yet; no moderation
  tooling exists (Phase 7).
- **Admin role / `service_role`-based moderation tooling** (Phase 7) — includes
  the `reports` review/transition UI (data capture exists; reading them does
  not).
- **Blocks do not gate friend requests** (Phase 7) — a blocked user can
  currently send a friend request to the person who blocked them, and since
  `friend_requests`' SELECT policy is "either party", it lands in the blocker's
  incoming list. Wider than it sounds: blocking also does **not** sever an
  existing friendship or pending request, and neither `friendships`' RLS nor
  the `profiles_public` view carries a block clause, so a blocked ex-friend
  stays visible *as a friend* with username, display name and avatar. Post
  content is already safe (`posts`' own SELECT policy carries the bidirectional
  block exclusion), so this is an **identity** leak, not a content leak. The
  right fix is an `after insert on blocks` trigger that deletes the mirrored
  `friendships` rows and any `friend_requests` row for the pair — cleaning up
  once on a rare event, rather than carrying a `not exists blocks` clause into
  every friends-list and friends-feed read forever. Deliberately deferred, not
  an oversight. `friend_count` (Phase 4.7) extends the same gap by one step —
  it has no block awareness either, so someone you blocked can read your count.
  Note the planned trigger fixes this for free: deleting the mirrored rows makes
  the count change, with no code change needed here.
- **`friend_count` is an edge-*creation* channel under polling** (Phase 4.7,
  accepted). Poll it for a set of users on a timer; when two counts increment in
  the same window, those two almost certainly just became friends, and
  decrements pair the same way on unfriend. That reconstructs part of a graph
  `friendships`' RLS deliberately refuses to serve. This app already polls every
  7s by design, so the client-side machinery exists. Accepted because public
  friend counts are near-universal and the attack needs sustained targeted
  polling — but recorded, not unexamined. If it ever needs to be cheaper, bucket
  the return (`0`, `1-5`, `6-20`, `20+`); that kills the correlation channel and
  is confined to this one function. Related standing rule: **never map
  `friend_count` over a list** — a friends list rendering "N friends" per row is
  an N+1 of RPC round trips, and that's the trigger to move to a denormalized
  `profiles.friend_count` column with a counter trigger, the `posts.like_count`
  pattern.

**⚠️ The following is a genuine open question, not an accepted trade-off —
don't mistake it for one more item in this "deferred by choice" list:**

- **`profiles_public` is readable by `anon`, unauthenticated** (found
  2026-07-28, pre-existing since `20260713092053`, **not yet decided**). A
  `GET /rest/v1/profiles_public` carrying only the publishable key and no
  `Authorization` header returns real rows — ids, usernames, display names,
  avatars. Every RLS-protected *table* correctly returns `[]` to anon (their
  policies all reference `auth.uid()`, which is null), but `profiles_public` is a
  plain view with no `security_invoker` and no `auth.uid()` check anywhere, so
  nothing gates it. **This means the full user directory is world-readable to
  anyone holding the publishable key, which ships in the Expo bundle** — and it
  contradicts §1's claim that anon sees nothing. Needs a deliberate call: accept
  it and correct §1, or add `security_invoker` / an `auth.uid() is not null`
  gate. Weigh that this is an app whose headline feature is anonymous posting.
- **Front server + Redis caching layer** (Phase 5.5) — see the caching
  principles in the project guide (`memory/CLAUDE.md`).
- **Rate limiting**: no per-request/per-minute limiter exists or is planned.
  The only write throttle is `unique(user_id, local_date)` + the entry window;
  there is **no rate-limit trigger** and **no `expires_at` column** (ephemerality
  is the computed 36h RLS window, and posts are never deleted on expiry).

**Now built (previously listed here as deferred):** replies (2-level cap),
realtime — scoped down to 7s polling + pull-to-refresh, not WebSockets —
all of blocking and reporting, anonymous posting (`posts.is_anonymous` + the
`posts_feed` view's strip, §2), the **friends schema and UI** (`friend_requests`,
`friendships`, the two `security definer` RPCs, the `useFriends` hook, and the
friends feed/tab via `posts_feed_friends` — anonymous posts appear there as
"Anonymous", soft anonymity, deliberately accepted, see
`memory/friends-feature-decisions.md`), and **region-matching proximity**
(`region_boundaries` + `resolve_region()`, §2 — not the `ST_DWithin` radius
design originally sketched here, see `memory/anonymity-and-proximity-decisions.md`).
`posts.location` remains permanently unused. See §2/§4/§5 and
`memory/project-phase-status.md`.

---

## 8. Verification checklist

Verify against the DB directly (SQL editor or API calls), not through the
app UI, before wiring up any screen:

- [x] Confirm the current SELECT policy is still owner-only before starting
      Phase 3 migration work.
- [x] After applying the Phase 3 SELECT policy: authenticated as user A,
      confirm a direct query returns all of A's own rows (any age) *plus*
      other users' rows only where `created_at > now() - interval '36 hours'`
      and `moderation_status = 'approved'`. **Verified 2026-07-13** via two
      real test accounts and direct `/rest/v1/posts` calls with each
      account's access token — see `memory/project-phase-status.md` Phase 3
      entry for the exact request/response pairs.
- [x] Confirm a >36h-old row from another user is excluded even if
      `moderation_status = 'approved'`. Verified in the same pass: user B's
      query did not include user A's 07-06/07-07 posts.
- [x] Confirm `hooks/usePosts.ts` and `hooks/usePostHistory.ts` still return
      only the signed-in user's own rows after the policy change, through
      the actual app UI — a regression check for the explicit `user_id`
      filter fix, distinct from the RLS-level check above. **Verified
      2026-07-13**: `test1`/`test2` each see only their own history and
      today's entry (no cross-user leakage, no `.maybeSingle()` crash on the
      same-`local_date` collision), and the loading gate shows a spinner
      throughout a throttled load rather than flashing empty content.
- [x] `hooks/useExploreFeed.ts` — confirm `.neq('user_id', userId)` correctly
      excludes the requester's own posts, and the `author:profiles_public(...)`
      embed returns data cross-user. **Verified 2026-07-13** via REST with
      both test accounts (self-exclusion both directions, embedding
      confirmed), and app-level through Expo Go (each account's Explore tab
      shows only the other's live post).
- [x] `profiles_public` — confirm it returns other users' rows while the
      base `profiles` table still returns none cross-user. **Verified
      2026-07-13** via REST: `profiles_public?id=eq.<other-user>` returned
      data as a different signed-in user; `profiles?id=eq.<other-user>`
      returned 0 rows for the same requester/target pair.
- [x] `hooks/usePost.ts` + `app/post/[id].tsx` — confirm own posts stay
      visible at any age, a nonexistent id resolves to not-found (not an
      error), and a post that ages past 36h between being seen and being
      requested by id also resolves to not-found. **Verified 2026-07-20**:
      own 7-day-old post returned correctly; a garbage id returned 0 rows;
      a cross-account post that had been live during the 2026-07-13 testing
      pass had since aged out and returned 0 rows, confirming the not-found
      path with real elapsed time rather than a constructed case. App-level:
      routing verified in isolation before the card was wired, then the full
      tap-to-detail loop, including hitting "This post is no longer
      available" organically on an expired cross-account post.
- [x] `likes` table + trigger — confirm insert/delete mechanics, the unique
      constraint, impersonation rejection, visibility-gated INSERT, and —
      critically — that the `security definer` trigger updates `like_count`
      for a post the liker doesn't own. **Verified 2026-07-20**: own-account
      insert/delete (`like_count` 0→1→0), duplicate like → `409`,
      impersonated `user_id` → `403`, liking a >36h-old cross-account post →
      rejected by the visibility `exists(...)` check (confirms likes drop
      out of reach with their parent post), and — the key test — test1
      liking a live post owned by test2 correctly moved that post's
      `like_count` 0→1, proving the cross-user `security definer` bypass
      actually works, not just compiles.
- [x] `hooks/useLikes.ts` + `components/LikeButton.tsx` — app-level, both
      test accounts: correct initial button state, optimistic
      increment/decrement on tap with persistence after reload, rollback on
      a forced error, and a decoupled cross-account check (test1 likes,
      test2 sees the updated count with their own button still correctly
      showing "Like"). **Verified 2026-07-20.** Known, deliberate gap: the
      Explore feed's cached `like_count` isn't optimistically updated (no
      like button exists on `ExplorePostCard`), so it only refreshes on that
      screen's next natural refetch (tab remount/refocus), not instantly —
      accepted trade-off, not a bug.
- [x] `comments` table + trigger — confirm insert mechanics, `comment_count`
      increments, impersonation rejection, visibility-gated INSERT, and —
      the meaningful difference from `likes` — that a *different* user can
      actually **read** a comment they didn't write (comments' SELECT has
      no `user_id` restriction). **Verified 2026-07-20**: own-account insert
      (`comment_count` 0→1), impersonated `user_id` → `403`, commenting on
      an out-of-visibility (>36h, cross-account) post → `403`, and test1
      successfully reading test2's comment via a direct `GET` — proving the
      open-to-anyone-who-can-see-the-post policy, not just the narrower
      self-only pattern `likes` uses.
- [x] `hooks/useComments.ts` + `components/CommentThread.tsx` — app-level:
      posting a comment appears in the thread, author fallback renders
      correctly. **Verified 2026-07-20** through the actual app.
- [x] `friend_requests` / `friendships` + both RPCs — **Verified 2026-07-28**,
      DB-level via REST with three dummy accounts (A/B/C), 27/27 cases
      (`scratchpad/verify_friends.py`). Constraints: self-request → `23514`;
      duplicate A→B → `23505`; **reverse B→A while A→B pending → `23505`**,
      proving the `(least, greatest)` expression index. RLS: forged
      `requester_id` → `403`; both parties see the request, an uninvolved
      third account gets `[]`; reject and cancel both `204`. The two attacks
      the `security definer` design exists to stop, tested explicitly and
      both correctly raising `P0001`: **force-friend with no request in
      existence** (zero rows created), and **a requester self-accepting their
      own outbound request** (proving the predicate is directional). Happy
      path: request consumed + *both* mirror rows present; double-accept →
      `P0001`; unfriend removes **both** mirror rows; unfriending a non-friend
      is a silent `204`; re-request after unfriend → `201` (no tombstone).
      Anon/no-JWT calls to both RPCs → `403`/`28000`. **Corrected 2026-07-28:
      that is the in-body guard firing, NOT the `revoke` — a bound revoke would
      give `42501` before the body ran. See the correction note in §4.**
      `friendships` lockdown confirmed by
      **row count, not status code** (see the §4 note): a direct `DELETE` and
      `PATCH` each affect zero rows with both mirrors surviving; direct
      `INSERT` → `42501`.
- [x] `reports` `'user'` target type + `friend_count` — **Verified 2026-07-28**,
      DB-level via REST with three dummy accounts, 16/16
      (`scratchpad/verify_reports_and_count.py`). New behaviour: reporting
      another user → `201`; **self-report → `403`** (the `target_id <>
      auth.uid()` clause); nonexistent uuid → `403` (the `profiles_public`
      existence check). Those first two are a **matched pair** and neither alone
      is diagnostic — had the policy referenced `profiles` instead of
      `profiles_public`, case 1 would fail *and* case 2 would succeed.
      **Regression checks on the recreated policy** (it was dropped and rebuilt,
      so this mattered more than the new feature): post reports, comment
      reports, nonexistent-post rejection, impersonated `reporter_id` → `403`,
      and reports still unreadable by their reporter — all unchanged. An
      unrecognised `target_type` is rejected by RLS (`42501`) before the check
      constraint sees it, same as Phase 4 found. `friend_count`: both parties'
      counts move 0→1 on accept and back on unfriend; **a third account can read
      the count but still gets `[]` for the friend list** — the public-count /
      private-edges boundary, which needs both assertions to demonstrate; a
      nonexistent uuid returns `0`, so it is not a user-existence oracle.
- [x] `resolve_region(lng, lat)` — **Verified 2026-08-03**, DB-level via REST,
      7/7 (`scratchpad/verify_resolve_region.py`). Sydney →
      `AU`/`AU-NSW`/"New South Wales, Australia"; Denver →
      `US`/`US-CO`/"Colorado, United States of America"; mid-Pacific
      `(-150, 0)` → `[]` (zero rows, not an error — the "no region" case);
      London/Paris → correct country with a null state (proving the label
      builder doesn't leave a stray leading comma); swapped lat/lng → `[]`.
      Anon-key call → `403`/`28000` via the function's own `auth.uid() is
      null` guard — confirmed load-bearing: `revoke execute ... from public`
      does **not** actually restrict `anon` (Supabase's default privilege
      grants override it, same finding as the friends RPCs), so the in-body
      check is the only real enforcement layer here, not the revoke.
      **Accepted, recorded gap**: only 9 of 177 countries have state-tier
      boundary coverage (Natural Earth 1:50m); the other ~168 fall straight
      through to the country tier. Australia is covered.
- [x] `posts_feed_friends` + `hooks/useFriendsFeed.ts` — **Verified
      2026-08-03**, DB-level via REST, 7/7
      (`scratchpad/verify_friends_feed.py`; one viewer, friends with two of
      three other accounts). Friend's normal post present; **friend's
      anonymous post present with `user_id`/author null** — the case the
      whole view design hinges on, since the anonymity strip lives in the
      `select` projection while the `where exists (select 1 from friendships
      ...)` clause still filters on the real `p.user_id`; a client-side
      `.in('user_id', friendIds)` against `posts_feed` instead would have
      silently dropped every anonymous friend post. Non-friend's post absent;
      own post absent (the mirrored `friendships` rows mean the `where`
      clause never matches yourself); anon key → 0 rows structurally (the
      `exists` subquery matches nothing when `auth.uid()` is null), not by
      policy — this view needed no anon-specific guard at all. Verified
      in-app on device afterwards, anonymous post rendering correctly.

---

## 9. Standing clarifications (common misconceptions to avoid)

Originally written to reconcile a separate session's planning doc
(`architecture-decisions-handoff.md`) against this schema — most of it was
written against a generic ephemeral-social-app model and got several things
wrong. That doc is long retired; these facts are kept because they're still
the kind of thing worth stating explicitly rather than re-deriving:

- **No `ratings` table** — it's `posts`.
- **No `expires_at` column, and posts are never deleted on expiry.**
  Ephemerality is the computed RLS condition
  `created_at > now() - interval '36 hours'`; expired posts freeze and drop out
  of public view, the row persists, the author still sees it. So there is no
  expiry-cascade for replies and no cache invalidation "tied to `expires_at`."
- **No rate-limit trigger.** The only write throttle is
  `unique(user_id, local_date)` + the entry window. A per-minute limiter is
  the wrong fit for a once-daily journal and was dropped.
- **Storage is private + signed URLs** (not public), and **blocking is
  enforced in RLS** (§4).
- **Shared-cache vs per-user RLS tension** (Phase 5.5 front server): full
  reasoning is `docs/feed-and-caching-architecture.md` §3-4, not here.
