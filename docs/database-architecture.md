# Database Architecture — DayRate

This document describes the Supabase/Postgres backend **as actually built**,
not an aspirational design. Where something is decided but not yet applied,
that's called out explicitly (see §7). For a more
granular, frequently-updated build log, see `memory/project-phase-status.md`
— treat that as the more current source if the two ever disagree; this doc is
the settled reference once a phase's decisions stop moving.

---

## 1. Roles overview

| Role | Who uses it | What it can see |
|---|---|---|
| `anon` | Unauthenticated app requests | Nothing — no anon read policy exists on `posts` |
| `authenticated` | Logged-in users, via the app | Own posts (any age) + everyone's live (last-36h, approved) posts on `posts`; everyone's `id`/`username`/`display_name`/`avatar_url` via the `profiles_public` view (own `profiles` row only via the base table) |
| `service_role` | Not yet used — no Edge Functions or admin tooling exist yet | Would bypass RLS entirely if used |
| Postgres superuser (dashboard) | You personally, for schema changes and manual ops | Everything |

**Hard rule:** `service_role` key and the direct Postgres connection string
must never appear in the Expo app bundle or any client-shipped code — they'd
live only in server-side environment variables (Edge Function secrets),
whenever that tooling gets built.

---

## 2. Core tables

```sql
-- posts (Phase 1)
id                uuid primary key default gen_random_uuid()
user_id           uuid references profiles(id) not null
rating            int not null
message           text not null
local_date        date not null
created_at        timestamptz default now()
location          geography(Point, 4326)   -- present, unused until Phase 5 proximity filtering
photo_url         text                     -- storage *path* in the private 'post-photos' bucket, not a public URL
photo_thumb_url   text
moderation_status text                     -- drives Phase 3's "live" visibility condition; no moderation workflow sets/transitions it yet
like_count        int default 0            -- column exists; no engagement feature built (Phase 4)
comment_count     int default 0            -- same
place_label       text                     -- human-readable location label; not yet wired to any UI

unique (user_id, local_date)
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

Plain view (`create view ... as select id, username, display_name, avatar_url from profiles;`) with `grant select ... to authenticated`, and no `security_invoker`. That last part matters: a view without `security_invoker` runs as its *creator*, not the querying user — which is what lets it read every row of the owner-only-RLS `profiles` table and expose just these four columns to any signed-in user, without touching `profiles`'s own RLS at all. The column list is the entire privacy boundary here; there's no RLS check on the view itself, so anything added to that `select` becomes public immediately. Deliberately excludes `bio`, `role`, `is_suspended`, `notification_preferences`, `reminder_time`, `timezone`.

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

---

## 5. Storage

Private bucket `post-photos` (not public), with policies scoped per-user
folder (exact policy SQL not yet captured as a migration — applied by hand).
`posts.photo_url` stores the storage *path*, not a public URL;
`utils/getSignedPhotoUrl.ts` + `hooks/useSignedPhotoUrl.ts` mint a fresh
signed URL at read time. Chosen over a public bucket specifically so photo
access can be revoked later (the 36h rule, blocking, moderation) — a
permanent public URL can't be taken back once shared.

---

## 6. Migration tracking

Started 2026-07-13, via the Supabase CLI (`npx supabase init`, then
`npx supabase migration new <name>` + `npx supabase db push`). Two migrations
so far:
- `supabase/migrations/20260713074345_extend_posts_select_policy.sql` — the
  SELECT policy change in §4.
- `supabase/migrations/20260713092053_add_profiles_public_view.sql` — the
  `profiles_public` view in §2.

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
  tooling exists (Phase 4/7).
- **Rate limiting** beyond the one-post-per-`local_date` uniqueness
  constraint.
- **Admin role / `service_role`-based moderation tooling** (Phase 7).
- **Proximity/geo queries** against `location` (Phase 5) — column exists,
  unused.
- **Engagement** (`like_count`, `comment_count`) — columns exist, no
  read/write path built (Phase 4).

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
