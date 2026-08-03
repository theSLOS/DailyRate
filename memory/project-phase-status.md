---
name: project-phase-status
description: Current build phase and what has been completed for DayRate app
metadata:
  type: project
---

Phase 0 is complete as of 2026-06-30. The following is working:
- Expo SDK 54 scaffold with TypeScript strict mode
- ESLint + Prettier + Husky pre-commit gate
- Supabase project wired up (URL + anon key in .env.local)
- Email auth (sign-in + sign-up) with auth gate via Redirect in route group layouts
- Web output set to "single" (SPA mode) to avoid SSR/WebSocket issues with Supabase Realtime
- Tested on web (browser) and native (Expo Go on device)

**Why:** Web SPA mode (`"output": "single"` in app.json) was needed because Supabase Realtime's WebSocket check crashes Node.js 20 during Expo Router's static rendering pass.

**How to apply:** If Supabase or Realtime issues arise on web, check app.json output mode first.

Phase 1 is complete as of 2026-07-06. The following is working:
- `profiles` table (was missing from Phase 0 despite being "done") + auto-create trigger on `auth.users` insert + RLS
- Client-side timezone backfill (`hooks/useEnsureTimezone.ts`) — `profiles.timezone` is set from the device on first sign-in, since onboarding doesn't collect it explicitly
- `posts` table with `unique(user_id, local_date)`, rating/message checks, PostGIS `location` column (unused until Phase 5), RLS scoped to owner-only (the "others can see" branch is deferred to Phase 3's Explore feed)
- **Custom entry-window rule, replacing the spec's simple ±1-day check:** a day's entry can only be created from 4pm on that day, and remains editable until noon the next day (both edges inclusive); 12pm–4pm is a dead zone with no active window. Implemented as one shared SQL function (`get_entry_date`) used by both the insert-validation trigger and the update RLS policy, plus a client-side mirror (`utils/getEntryDate.ts`) for UI branching.
- TanStack Query wired up (`lib/queryClient.ts` + `QueryClientProvider` in `app/_layout.tsx`); `hooks/usePosts.ts` (`useTodayPost`, `useUpsertPost`)
- Photo pipeline: pick/compress (`utils/pickAndCompressImage.ts`) → upload to a **private** Storage bucket (`post-photos`, policies scoped per-user folder) → `photo_url` column stores the storage *path*, not a URL → `utils/getSignedPhotoUrl.ts` + `hooks/useSignedPhotoUrl.ts` mint a fresh signed URL at read time. Chosen over a public bucket specifically so photo access can be revoked later (36h rule, blocking, moderation) — permanent public URLs can't be taken back once shared.
- NativeWind set up (wasn't done in Phase 0 despite CLAUDE.md mandating it) — Tailwind v3 pinned deliberately (NativeWind 4.2.6 isn't compatible with Tailwind v4)
- `components/ComposeForm.tsx` (presentational, no data fetching) + `app/(tabs)/index.tsx` as the Today screen (create ↔ edit switch, dead-zone messaging)
- Tested end-to-end on device: rating + message + photo all persist and reload correctly in edit mode

**Why (entry-window rule):** user-specified product decision, not derived from the spec — replaces spec §1.2's simpler "local_date within ±1 day of created_at" rule with a stricter time-of-day-gated window.

**How to apply:** if extending posting/editing rules later (e.g. Phase 3+ visibility rules), check `get_entry_date` (SQL) and `utils/getEntryDate.ts` (client) first — they're the single source of truth for "what day is it for this user," and both must stay in sync if the window definition ever changes.

Phase 2 is complete as of 2026-07-07. The following is working:
- `usePostHistory` hook (`hooks/usePostHistory.ts`) — fetches all of the current user's own posts, no time filter, relying on the existing owner-only RLS from Phase 1 rather than an explicit `user_id` filter (same convention as `useTodayPost`)
- Shared `Post` type extracted to `types/posts.ts` (was previously redeclared separately in each hook)
- "Your days" tab (`app/(tabs)/history.tsx`) — reverse-chronological `FlatList` of `PostHistoryCard` rows (`components/PostHistoryCard.tsx`), with loading/error/empty states
- Rating-over-time chart (`components/RatingHistoryChart.tsx`) using **Victory Native classic (`victory-native@^36`), not XL** — XL requires react-native-skia, which isn't available in Expo Go, so classic (SVG-based, via `react-native-svg`) was chosen specifically to keep native testing on Expo Go without a custom dev client
- Chart shows a week/month/all-time toggle (client-side slice via `utils/filterPostsByRange.ts`, day-window constants in `constants/chart.ts`) with a **fixed 1–10 y-axis domain** (not auto-scaled) so a flat week of similar ratings doesn't visually read as a dramatic swing
- Chart rendered as the history `FlatList`'s `ListHeaderComponent`, fed the full unfiltered post list (range-slicing happens inside the chart component, not the hook)

**Why (Victory classic over XL):** user-facing decision driven by keeping the existing Expo Go testing workflow from Phase 0/1 intact — switching to XL would force a custom EAS dev client.

**How to apply:** if a future phase (e.g. richer history analytics in §6 future ideas) needs more chart types, stick with `victory-native` classic components unless the Expo Go constraint is deliberately revisited.

Phase 3 is **complete as of 2026-07-20** (started 2026-07-08). All of RLS (36h + ownership), the Explore feed (query, card, screen, tab), the `profiles_public` author view, and the post detail screen are built and verified DB-level + app-level. Detail:
- **Applied on 2026-07-13.** `posts` SELECT RLS policy is now `select own or live posts`, replacing the owner-only `select own posts`:
  ```sql
  drop policy "select own posts" on posts;
  create policy "select own or live posts" on posts
  for select using (
    user_id = auth.uid()
    or (created_at > now() - interval '36 hours' and moderation_status = 'approved')
  );
  ```
  Lives at `supabase/migrations/20260713074345_extend_posts_select_policy.sql` and was pushed via the Supabase CLI (`npx supabase db push`), confirmed applied via `npx supabase migration list` (`remote` matches `local`). This is also the first entry in `supabase/migrations/` — migration tracking has started; schema changes before this one were still applied by hand via the dashboard SQL editor and aren't captured as files.
  - **Verified end-to-end on 2026-07-13** via direct REST API calls (two real test accounts, tokens fetched from `/auth/v1/token?grant_type=password`, queried `/rest/v1/posts` directly — bypassing the app entirely per the "verify against the DB, not through the app" convention). Confirmed both directions: user A's query returned all of A's own posts (including two >36h old, from 07-06 and 07-07) plus B's live today-post; user B's query returned B's own post plus A's live today-post, but *not* A's older posts. RLS policy is confirmed correct as applied.
- **Blocking prerequisite fixed as of 2026-07-13:** `usePostHistory` and `useTodayPost` (`hooks/usePosts.ts`, `hooks/usePostHistory.ts`) now both take an explicit `userId: string | undefined` param, threaded in from `session.user.id` (same pattern `uploadPhoto` uses), and filter with `.eq('user_id', userId)` inside `queryFn` — `useTodayPost` keeps its `.eq('local_date', entryDate)` filter alongside it, not instead of it. Both `enabled` flags gate on `userId !== undefined`. Callers (`app/(tabs)/index.tsx`, `app/(tabs)/history.tsx`) now destructure `loading: authLoading` from `useAuth()` and include it in their loading-state checks (`todayPostQuery.isLoading || authLoading`), since a disabled query reports `isLoading: false` — without this, both screens would flash unscoped/empty content while the session was still resolving.
  - Two regressions surfaced and were caught in review during this fix, worth remembering as failure modes: (1) a `userId` guard placed in the hook body instead of inside `queryFn` throws synchronously on every render while `userId` is still `undefined` (i.e. on every mount, before session resolves) rather than surfacing as a query error — guards for "not ready yet" belong inside the async `queryFn`, gated by `enabled`; (2) adding a new `.eq()` filter is additive, not a replacement — `useTodayPost` briefly lost its `local_date` filter while gaining `user_id`, which would have made `.maybeSingle()` throw as soon as a user had more than one post.

**Why:** RLS governs which rows a query *can* return, not which screen is asking — queries written to lean on RLS alone for "my own data" scoping silently break the instant RLS is widened for a different purpose (public visibility). This wasn't a problem through Phase 1–2 because RLS was strictly owner-only the whole time.

- **App-level verification passed on 2026-07-13**, through the actual UI with the same two test accounts: each user's history screen shows only their own posts (no cross-user leakage), each user's Today screen shows only their own today's entry (no `.maybeSingle()` crash from the same-`local_date` collision), and a throttled reload shows a spinner throughout rather than a flash of empty content. All four `user_id`/`authLoading` fixes are confirmed working in the deployed app, not just in review.

**How to apply:** Phase 3's RLS migration and the four hook/screen fixes are both fully verified — DB level and app level. (Superseded below — the Explore feed query, cursor pagination, and author info are now built; only the post detail screen remains for Phase 3.)

- **`useExploreFeed` (hooks/useExploreFeed.ts) built and verified end-to-end on 2026-07-13**: `useInfiniteQuery` with `created_at` keyset pagination (cursor and `order` both on `created_at`, deliberately not a compound `id` tiebreaker — collision risk is effectively zero since each post insert is its own transaction), explicit `.neq('user_id', userId)` exclusion, and an aliased embedded join `author:profiles_public(username, display_name, avatar_url)`. Verified directly via REST with both test accounts: self-exclusion confirmed both directions, embedding confirmed to return nested `author` data.
- **`profiles_public` view added** (`supabase/migrations/20260713092053_add_profiles_public_view.sql`) to expose `id, username, display_name, avatar_url` publicly without widening the owner-only RLS on `profiles` itself — a plain view (no `security_invoker`) runs as its creator, bypassing the base table's RLS for just those four columns; `grant select ... to authenticated` was required separately, since new objects don't inherit grants. Verified: base `profiles` table still returns 0 rows cross-user; `profiles_public` returns data cross-user.
- **`ExplorePostCard` + `app/(tabs)/explore.tsx` built**, mirroring the `PostHistoryCard`/`history.tsx` pattern, with `ANONYMOUS_AUTHOR_LABEL` (`constants/posts.ts`) as the fallback when `author.display_name`/`username` are both null (true for both current test accounts — onboarding doesn't collect either field yet).

**App-level verification passed on 2026-07-13**, through the actual UI (Expo Go) with both test accounts: each account's Explore tab shows only the *other* account's live post, correctly excluding their own — matching the DB-level REST verification done earlier in this phase.

**Deferred to Phase 8 (Polish & performance):** `explore.tsx`'s pull-to-refresh calls `exploreQuery.refetch()`, which re-fetches *every currently loaded page* of the infinite query, not just the first — a user who's scrolled several pages deep and pulls to refresh triggers that many network calls. Harmless at current scale (a handful of live posts across 2 test accounts), but worth revisiting with a `refetchPage` predicate or a reset-to-first-page approach once real usage means multiple pages are commonly loaded. Flagged deliberately rather than fixed now, since fixing it today would mean solving a performance problem that doesn't exist yet.

- **Post detail screen built and verified on 2026-07-20**, closing out Phase 3. Three new pieces, plan written and approved via `/plan` mode first (see `.claude/plans/ok-lets-continue-spicy-tarjan.md`):
  - **`hooks/usePost.ts`** — fetch one post + author by id (`.eq('id', postId).maybeSingle()`), reusing the `ExplorePost` type and the same `author:profiles_public(...)` embed as `useExploreFeed`. Deliberately no `.eq('user_id', userId)` filter, unlike `useTodayPost`/`usePostHistory` — this hook wants the *full* RLS-permitted set for one id (own post at any age, or anyone's live+approved post), not narrowed to "just mine." Query key `['posts', { id: postId }]` (plural, matching the rest of the `posts` family) so `useUpsertPost`'s `invalidateQueries({ queryKey: ['posts'] })` prefix-match still catches it.
  - **`app/post/[id].tsx`** — first dynamic route in the app. Lives as a top-level sibling of `(auth)`/`(tabs)` so the root `Stack` in `app/_layout.tsx` pushes it on top of the tabs automatically (header + back button by default, tab bar hidden) with zero changes to the root layout. Three query states rendered, not two: loading, error, and a genuinely new **not-found** case (`data === null`, no error) for a post that fell outside the RLS window between being tapped and being loaded — the first query in this codebase where "zero rows for a specific requested thing" is an expected, handled outcome rather than an empty-list or error case.
  - **`components/ExplorePostCard.tsx`** — wrapped in `Link href={{ pathname: '/post/[id]', params: { id: post.id } }} asChild><Pressable>` (first tap-to-navigate pattern in the app). `asChild` hands `Link`'s navigation behavior to the `Pressable` child instead of rendering `Link`'s own default wrapper styling.
  - **Verified DB-level** via REST with real tokens: own account reading their own 7-day-old post (still visible — own posts have no age limit), a garbage id (0 rows), and — serendipitously, since enough real time had passed since Phase 3's earlier REST testing — a cross-account post that *used to be* live during earlier verification had genuinely aged past 36h and now correctly returned 0 rows, live-proving the not-found path with real data rather than a constructed test case.
  - **Verified app-level** end to end: routing in isolation first (direct URL navigation, confirmed header/back/hidden-tabs before any card was wired), then the full tap-to-detail loop through the Explore tab, including hitting the "This post is no longer available" state organically on an expired cross-account post.

Phase 4 ("Engagement + blocking/reporting") is **in progress**, started 2026-07-20. User chose to sequence it as: likes → comments/replies/realtime → blocking/reporting, when asked (likes picked as the most self-contained piece, and the first optimistic mutation this app needed). Plan for the likes concept was written and approved via `/plan` mode (see `.claude/plans/ok-lets-continue-spicy-tarjan.md`, now holding the likes plan rather than the post-detail-screen one it started as).

- **Likes built and verified on 2026-07-20** — full detail:
  - **Migration** (`supabase/migrations/20260720103540_add_likes_table_and_trigger.sql`) — `likes` table (`unique(post_id, user_id)`, cascading FKs to `posts`/`profiles`), RLS (SELECT/INSERT gated by `user_id = auth.uid()` AND the post being visible per `posts`' own RLS via a non-`security definer` `exists(...)` subquery; DELETE gated only by ownership, no visibility check), and a `security definer` counter trigger. See `docs/database-architecture.md` §4 for the full reasoning — the short version: `posts`' UPDATE policy is owner-only, a liker is almost never the owner, so without `security definer` the trigger's internal `UPDATE` would silently affect 0 rows for cross-user likes (no error, just permanent counter drift). **This was the one thing the whole migration was built around getting right, and it was explicitly verified cross-user**, not just assumed correct: test1 liking a post owned by test2 moved that post's `like_count` 0→1, which is impossible without the bypass working.
  - **Two migration-verification stumbles worth remembering**: (1) the first cross-user like attempt returned `403`, which turned out to be *correct* behavior, not a bug — the test picked a 7-day-old post, well past the 36h visibility window, so the INSERT policy's `exists(...)` check correctly rejected it; the fix was picking a genuinely live post, not a code change. (2) `types/database.ts` needed regenerating after the migration (same as every prior migration) — `.from('likes')` wasn't recognized until that ran, and the same PowerShell UTF-16-encoding gotcha from the `profiles_public` regeneration recurred and needed `-Encoding utf8` again.
  - **`hooks/useLikes.ts`** — `useLikeStatus(postId, userId)` (boolean read, `['likes', { postId, userId }]`, a new root key deliberately separate from `'posts'` so `useUpsertPost`'s blunt `invalidateQueries({ queryKey: ['posts'] })` never accidentally refetches every mounted like button) and `useToggleLike()` — **this app's first optimistic mutation** (`onMutate` snapshots + flips both the boolean cache and `like_count` on the exact `['posts', { id: postId }]` key `usePost` reads, `onError` restores the snapshots, `onSettled` invalidates both to reconcile with the trigger-computed truth).
  - **`components/LikeButton.tsx`** + wired into `app/post/[id].tsx` in place of the `{/* Comments and likes are Phase 4 */}` placeholder. Deliberately **not** added to `ExplorePostCard.tsx` — no like button there, so the Explore feed's cached `like_count` is never optimistically touched. Confirmed and accepted as a real, user-visible trade-off (see below), not a design oversight.
  - **Recurring bug pattern this session, worth watching for going forward**: `import { supabase } from '@/lib/supabase.web'` showed up in *two* separate hooks this phase (`usePost.ts` earlier, then `useLikes.ts` again) — almost certainly an editor autocomplete picking the wrong same-named file. Always `@/lib/supabase` (extensionless), never the explicit `.web` variant, outside of the two `lib/supabase*.ts` files themselves.
  - **Verified DB-level** (REST, both real test accounts): own-account insert/delete (`like_count` 0→1→0), duplicate like → `409`, impersonated `user_id` → `403`, and the cross-user `security definer` proof above.
  - **Verified app-level** (Expo Go, both accounts): correct initial button state, optimistic increment/decrement with persistence after reload, and the decoupled cross-account check (test1 likes, test2 sees the updated count while their own button still correctly shows "Like").
  - **User-observed, confirmed-as-intended behavior**: liking/unliking on the detail screen and then navigating back to the Explore tab via the back button does *not* update that tab's static count line — because the Explore tab was never unmounted, and only remount/refocus triggers TanStack Query's default `staleTime: 0` refetch (confirmed: switching tabs away and back *does* pick up the fresh count). Matches the plan's explicitly documented scope boundary; not a bug, not fixed.

- **Top-level comments built and verified on 2026-07-20** (replies deliberately deferred — spec treats "comments table + top-level comments" and "replies, 2-level cap" as separate roadmap bullets):
  - **Migration** (`supabase/migrations/20260720115611_add_comments_table_and_trigger.sql`) — `comments` table (`post_id`, `user_id`, `parent_comment_id` nullable/self-referencing FK included now even though nothing writes to it yet, `body`, explicit index on `post_id` since there's no `unique(post_id, user_id)` here to provide one for free the way `likes` got). RLS is meaningfully different from `likes`: SELECT has **no `user_id` restriction** — anyone who can see the parent post can read *all* its comments, not just their own, since a comment thread only works that way. INSERT still requires `user_id = auth.uid()` + the same visibility `exists(...)` gate. **Deliberately no UPDATE/DELETE policy at all** — nothing in the Phase 4 spec asks for editing/deleting comments, so it wasn't built. Counter trigger is the identical `security definer` pattern as `like_count`, and deliberately counts *all* rows regardless of `parent_comment_id` so replies will correctly add to the total once they exist, with zero changes needed to this trigger later.
  - **Verified DB-level**, own-account insert + `comment_count` 0→1, impersonation → `403`, comment on an out-of-visibility post → `403`, and — the one genuinely new thing to prove versus `likes` — a cross-account **read**: test1 successfully read a comment test2 wrote, confirming the open (not self-only) SELECT policy actually behaves as designed.
  - **A real bug pattern recurred a third time**: `import { supabase } from '@/lib/supabase.web'` showed up again in the first draft of `useComments.ts` (after `usePost.ts` and `useLikes.ts` earlier this phase) — same editor-autocomplete trap each time. Worth treating as a first-check item whenever reviewing a new hook in this codebase.
  - **User explicitly asked Claude to fix the hook directly** rather than review-and-let-them-fix (a deliberate, one-time exception to the guide+review workflow, invoked by their own words — not a standing change to how this project works). Real bugs found and fixed in that pass: `types/posts.ts` was missing a `Comment` type entirely; `types/database.ts` needed regenerating for the same reason as every prior migration (this time regenerated via Bash instead of PowerShell specifically to sidestep the recurring UTF-16 encoding gotcha — Bash's `>` redirect is plain UTF-8, worth using going forward for this exact command); a `Pick<...>` typo (`'Display_name'`, wrong case); `created_at: new Date()` where a `string` (`.toISOString()`) was needed; the optimistic temp comment's `author` fields were set to `''` instead of `null` — an easy-to-miss bug, since `''` doesn't satisfy the `display_name ?? username ?? ANONYMOUS_AUTHOR_LABEL` fallback chain's `??` check the way `null` does, so it would've silently rendered blank instead of "Anonymous"; and `onError`/`onSettled` were missing from the mutation entirely, meaning a failed submission would never roll back and a successful one would never reconcile the fake temp id/blank author with the real row.
  - **Verified app-level**: posting a comment through the actual UI appears in the thread correctly, author fallback renders as expected.
  - **New standing feedback captured this session**: user wants every future concept explanation to open with an explicit "what issue are we solving right now" + "how we're going to do that" (high-level dot points) framing before any pseudocode — see `[[feedback_concept_explanation_format]]`.

- **Replies (2-level cap) built and verified on 2026-07-21** — no new migration needed; `parent_comment_id`, its RLS, and the comment-count trigger were already shaped for this in the top-level-comments work above.
  - **`utils/buildCommentTree.ts`** — new pure function, `buildCommentTree(comments: CommentWithAuthor[]): CommentWithReplies[]`, assembling the hook's flat query result into top-level comments each carrying a `replies` array. Trusts (does not defensively re-check) the invariant that every `parent_comment_id` in the DB points at a top-level comment's id, never at another reply's id — that invariant is enforced client-side at submission time, not here.
  - **`hooks/useComments.ts`** — `useComments` now calls `buildCommentTree` before returning, so its declared type is `CommentWithReplies[]` throughout (query result, `queryFn` return type, `UseQueryResult` generic). `useSubmitComment` gained `parentCommentId?: string` threaded through `SubmitCommentInput`, the real insert, and the optimistic temp comment. The optimistic `setQueryData` callback for `commentsKey` is now a two-branch block (no `parentCommentId` → append a brand-new top-level entry with `replies: []`; `parentCommentId` set → immutably map over the tree, growing only the matching top-level's `replies` array, `{ ...topLevel, replies: [...topLevel.replies, tempComment] }`, every other entry untouched by reference).
  - **`components/CommentThread.tsx`** — `resolveReplyTarget(comment) => comment.parent_comment_id ?? comment.id` is the crux of the 2-level cap: called on *whatever comment's "Reply" button was tapped*, it always resolves to a top-level id — so replying to a reply attaches to that reply's parent (the original top-level thread), never creating a 3rd level. `replyingTo` state holds `{ id, authorLabel }` together (captured at tap time) rather than reverse-searching the tree later to render "Replying to X". Both top-level comments and replies get their own "Reply" button, sharing this same resolution logic. Replies rendered with NativeWind `ml-4` indentation, no inline styles.
  - **Verified DB-level** via direct REST query against `comments` (bypassing the app, same convention as every prior phase): confirmed the reply-to-reply case explicitly — its `parent_comment_id` in the database is the *original top-level comment's id*, not the reply's id it was nominally posted under. This is the one fact that proves the 2-level cap actually holds, not just the UI's indentation.
  - **Verified app-level** via a headless-Chromium (Playwright) pass against `npm run web` (this repo's SPA web output) — logged in as a real test account through the actual sign-in form, navigated directly to a known post's detail URL (own post, comment_count 0, id sourced via REST since `PostHistoryCard` has no tap-to-detail `Link` the way `ExplorePostCard` does — history posts aren't navigable by tap yet, worth remembering if that gap ever needs closing), then drove all four cases: new top-level comment, reply to it, reply to that reply (confirmed flat — reply-button count stayed at 3, never grew a 3rd tier), and starting-then-cancelling a reply (confirmed the "Cancel" affordance clears `replyingTo` correctly).
  - **Playwright installed via `npm install --no-save playwright` specifically to avoid polluting `package.json`/`package-lock.json`** — confirmed it added no entries to either file, it only exists in `node_modules`. **Note for later:** running `npm install` at all still caused npm to rewrite `package-lock.json` with ~300 lines of unrelated transitive-dependency version bumps, reconciling drift that already existed in the working tree before this session touched anything — not something this session caused or reverted, just something to be aware of if that diff shows up unexpectedly later. Per explicit user instruction, Playwright is being **left installed** in `node_modules` for reuse in future testing passes rather than removed after this one.
  - **Test credentials handling**: real test-account passwords were deliberately kept **out of the repo entirely** (not even in `.env`, since `.env` — until this session — wasn't actually covered by `.gitignore`, only `.env*.local` was; `.env` has now been added to `.gitignore` as a small separate fix) — they live in a file in Claude's session-scratchpad directory instead, which is outside the repo and never git-tracked.
  - **A real, worth-repeating-back mistake this session**: at one point the user pasted a chat message's *pseudocode* (including its placeholder comments) directly into the file verbatim, rather than adapting it — produced a mismatched-JSX-tag syntax error plus a copy-paste bug (a reply's `authorLabel` read from `comment.author` instead of `reply.author`). Worth remembering that pseudocode blocks in this workflow are illustrative shape, not paste-ready text, and reviews should specifically check for literal-paste artifacts (leftover placeholder comments, un-adapted variable names) when something breaks right after a "here's the shape" message.
  - **Two pre-existing issues noticed but explicitly out of scope for this pass, not touched**: (1) two identical console errors during the Playwright run — `Cannot manually set color scheme, as dark mode is type 'media'...`, a NativeWind/react-native-css-interop config warning unrelated to comments; (2) the post detail screen's photo rendering much larger than the author/rating/message text above it in the same screenshot, worth a separate look if it turns out to be a real layout bug rather than a viewport artifact.
  - **Teaching-mode note**: this session's replies work was walked through step-by-step at the user's explicit request ("act as a teacher for each part"), a slower, more scaffolded pace than this project's default guide+review rhythm — see `[[user_js_familiarity]]` (Python/C++ background, JS/TS idioms need mapping onto known analogues) and `[[feedback_concept_explanation_format]]`. Treat "teacher mode" as something invoked per-request, not the new default pace for every future concept.

- **"Realtime" scoped down to polling + pull-to-refresh on 2026-07-21, not actual Supabase Realtime/WebSockets** — user's own call after the trade-offs were laid out (WebSocket subscription management, RLS-on-realtime nuance) against what this app actually needs (a once-a-day mood journal, not a live chat). No new migration; this is entirely a client-side polling/refetch decision.
  - **`constants/posts.ts`** — `POST_POLL_INTERVAL_MS = 7000` (renamed from an initial `POST_DETAIL_POLL_INTERVAL_MS` once it became clear both the detail screen and Explore would share it — name shouldn't imply a scope it no longer has).
  - **`hooks/usePost.ts`** — `refetchInterval: POST_POLL_INTERVAL_MS` added to the `useQuery` options. Polls the whole post row (so `like_count`/`comment_count` freshen) only while the detail screen is mounted — `refetchInterval` stops itself automatically once there's no active observer, no manual unsubscribe needed.
  - **`hooks/useExploreFeed.ts`** — same constant, same `refetchInterval`, added to the `useInfiniteQuery` options. **Deliberate, discussed trade-off accepted**: `refetchInterval` on an infinite query refetches *every currently loaded page*, not just the first — same underlying issue already flagged and deferred to Phase 8 for the existing pull-to-refresh (`explore.tsx`'s `onRefresh`), now happening continuously every 7s instead of only on a manual pull. Accepted deliberately given current scale (a couple of test accounts, rarely more than one page loaded) — revisit alongside the Phase 8 item if either one gets fixed, since they're the same root cause.
  - **`app/post/[id].tsx`** — pull-to-refresh added via `RefreshControl` on the detail screen's `ScrollView` (which needed the prop explicitly; unlike `FlatList`'s `onRefresh`, `ScrollView` doesn't have a built-in refresh gesture). One `onRefresh` handler invalidates **both** `['posts', { id }]` and `['comments', { postId: id }]` via `useQueryClient()` directly — deliberately *not* routed through `CommentThread`'s own internal `useComments` call, since TanStack Query's `QueryClient` is shared app-wide and any component can invalidate any query by key (same pattern `useSubmitComment`'s `onSettled` already used) — no prop-drilling or lifting state up needed.
  - **A JSX-editing mistake recurred in a new shape this session**: attempting to add the `refreshControl` prop produced, in sequence, (1) the prop written as a bare standalone JSX line instead of inside the `ScrollView`'s opening tag, then (2) a follow-up attempt that opened a *second*, nested, never-closed `ScrollView` plus a stray duplicated `{postQuery.error && (...)}` block copy-pasted from elsewhere in the file. Same underlying category as the earlier reply-rendering paste mistake ([[project-phase-status]] above) — edits that add a prop to an *existing* tag are easy to instead render as a *new* sibling or nested element. Worth checking specifically for accidental duplication/nesting when a "just add this prop" instruction comes back looking structurally bigger than expected.
- **UI polish: bordered "card" boxes added across every post-shaped surface, 2026-07-21** — user-driven, applied incrementally (comments+replies first, then the post detail screen's own content, then Explore, then history), same NativeWind classes reused everywhere for visual consistency: `border border-gray-300 rounded-lg p-3 mb-3` on the outer container, no separate border on nested elements.
  - **`components/CommentThread.tsx`** — the box goes on the *top-level* comment's `<View>` only; since each comment's `replies.map(...)` is already nested inside that same `View`, replies visually land inside their parent's box automatically, with no restructuring — replies just get `ml-4 mt-2` (indent + spacing), no border of their own.
  - **`app/post/[id].tsx`** — box wraps the post's own content (author/age/rating/message/photo/`LikeButton`) in a new `<View>`; `CommentThread` deliberately sits *outside* that box, below it, as its own section (it already has its own per-comment boxes — nesting it inside the post's box too would double up the framing).
  - **`components/ExplorePostCard.tsx`** — className added directly to the existing `Pressable` (confirmed NativeWind's `className` works on `Pressable`, not just `View`).
  - **`components/PostHistoryCard.tsx`** — same treatment, added second (initially out of scope since the user said "Explore" specifically, then extended here on request) for consistency across Explore/history/detail.

- **Blocking, Concept 1 (schema + RLS only) built and verified DB-level on 2026-07-21** — split deliberately from Concept 2 (wiring the block relationship into `posts`/`comments` visibility), which is **not started yet**, per the user's own "one concept at a time" sequencing. No hook or UI action built yet either — this phase is schema-only so far.
  - **Migration** (`supabase/migrations/20260721043156_blocker.sql`) — `public.blocks` table: `blocker_id`/`blocked_id` (both `uuid not null references public.profiles(id) on delete cascade`), `created_at`, **composite primary key `(blocker_id, blocked_id)`** — a deliberate deviation from the `likes`/`comments` convention of a surrogate `id` + separate `unique(...)` constraint, kept on purpose since nothing needs to reference an individual block row by id (flagged during review, user's call to keep it). Plus `check (blocker_id <> blocked_id)` to make self-blocking impossible at the DB layer, not just the UI.
  - **RLS is intentionally asymmetric, unlike every other table so far**: SELECT is scoped to `blocker_id = auth.uid()` only — a user can see who *they* blocked, but there is **no policy letting anyone discover who has blocked them**. This was a deliberate privacy decision (matches how blocking works on most social apps) and was explicitly verified: user2 (blocked by user1) got `[]` back from `select * from blocks`, not a permission error and not the block row — the row simply doesn't exist from their query's point of view. INSERT and DELETE both gated by `blocker_id = auth.uid()` (can only create/remove blocks as yourself); no UPDATE policy at all (a block either exists or doesn't).
  - **A new variant of the "paste pseudocode literally" mistake pattern** (same root cause as the JSX incidents during replies work): the first draft of this migration's RLS section was the *English description* from the review conversation, transcribed as SQL comments (`-- select: blocker_id = auth.uid() (only see who you blocked)`) rather than actual `create policy` statements — meaning `enable row level security`, the `grant`, and all three policies were entirely missing, silently, since comments don't error. Worth continuing to check specifically for "does this look like real syntax or does it look like the shape I described in prose" whenever a review comment gets addressed suspiciously literally.
  - **Environment note**: the Supabase CLI wasn't authenticated in Claude's execution environment (no stored access token) — `npx supabase db push` had to be run by the user directly, after `npx supabase login` + `npx supabase link --project-ref fggpnwsvsgdzlphddmcj` (ref pulled from `.env`'s `EXPO_PUBLIC_SUPABASE_URL`). `types/database.ts` regenerated via Bash afterward (not PowerShell, per the recurring UTF-16 gotcha).
  - **Verified DB-level via REST** with `test1`/`test2`: self-block → `23514` check-constraint violation; inserting a block with `blocker_id` set to *another* user's id → `403`; a real block → `201`; the same block inserted again → `409`; blocker's own `select` shows the block; the blocked user's `select` returns `[]`; delete (unblock) → `204`; blocker's `select` afterward is empty again. All eight matched expectations exactly.

- **8 additional dummy test accounts created 2026-07-21, for load/volume testing (more posts than 2 accounts can produce)** — `dummy1probe@test.com` through `dummy8@test.com` (all `password123`), signed up via `/auth/v1/signup` REST calls, each profile's `timezone` set to `Australia/Sydney` to match `test1` for consistent, realistic entry-window behavior. Credentials live in the session scratchpad (`dummy-accounts.env`), never in the repo, same handling as `test-credentials.env`.
  - **No posts created yet, deliberately** — the entry-window rule (`get_entry_date`, from Phase 1) turned out to gate *first-time* post creation more strictly than initially assumed from the docs alone: at 04:xx UTC (a time with no timezone offset landing inside any day's 4pm-open window), every `local_date` guess was rejected, for *any* reasonable timezone at that moment — it isn't just a display quirk, there's a real dead period where no `local_date` is insertable at all for a brand-new poster.
  - **User explicitly declined a shortcut**: setting a dummy account's timezone to something like UTC+14 would make its "local" clock read as within the 4pm-open window immediately, letting posts go in right away — user stopped this specifically ("well wait till we can post"), preferring to wait for a real window rather than game the rule. Treat this as a standing preference, not just a one-off call: don't route around this app's own business rules for convenience, even for throwaway test data.
  - **Posts created successfully on 2026-07-21 once the window opened** — all 8 accounts now have a live post for `local_date=2026-07-21`, confirmed visible cross-user via REST (`test1` querying `user_id=neq.<self>` returns all 8). Explore now has real volume beyond 2 accounts.
  - **A real, worth-remembering root cause behind the "window won't open" scare that preceded this**: it was never a bug in `get_entry_date`, the trigger, or the timezone — it was that every manual REST test insert (mine, across the whole session) omitted `user_id` from the request body. `posts`' `check_local_date` trigger (`validate_local_date()`, `before insert`) reads `new.user_id` to look up the poster's timezone — and **`before insert` triggers run before RLS's `with check` validates anything**, so `new.user_id` at that point is exactly whatever the client sent, unvalidated. With no `user_id` and no column default, `new.user_id` was `NULL`, the profile lookup matched nothing, `user_tz` came back `NULL`, and `get_entry_date(created_at, NULL)` correctly returned `NULL` — which the trigger correctly (if confusingly) rejected. Confirmed by calling `get_entry_date` directly via RPC (returned the exact expected date) and then by simply adding `user_id` back into the insert body, which immediately worked. **Standing lesson: any manual REST insert against `posts` must include every not-null column with no default (`user_id` has no default) — a missing field here doesn't fail loud and obvious, it surfaces as a confusing business-rule rejection instead**, since the trigger fires before RLS would have caught the same problem more legibly.

**Phase 4 completed on 2026-07-21.** The remaining pieces — blocking's hook+UI+Concept 2, and all of reporting — were built by Claude directly at the user's explicit request ("can you do it until the next phase .5"), a larger-scope version of the same one-off exception used earlier for `useComments.ts`. Not the standing workflow going forward; the next phase reverts to guide+review unless asked again.

- **Blocking Concept 1 finished** — `hooks/useBlocks.ts` gained `useToggleBlock` (branches insert-vs-delete on a caller-supplied `isCurrentlyBlocked` flag, rather than re-querying state itself; delete matches both `blocker_id` and `blocked_id` via chained `.eq()`, same "both conditions apply" pattern as `useTodayPost`; `onSuccess`-only invalidation, deliberately not `onSettled` — there's no optimistic update here to roll back on failure, unlike likes/comments, so `onSuccess` is the semantically correct choice, not just the simpler one). `components/BlockButton.tsx` mirrors `LikeButton`. Wired into `app/post/[id].tsx`, gated on `session?.user.id !== postQuery.data.user_id` so a user can't tap "Block" on their own post and hit the `23514` self-block constraint as their first signal that the rule exists.
- **Blocking Concept 2 finished** — new migration (`supabase/migrations/20260721053057_block_exclusion_visibility.sql`) drops and recreates both `posts`' and `comments`' SELECT policies, adding a `not exists (select 1 from blocks where (blocker_id=auth.uid() and blocked_id=<owner>) or (blocker_id=<owner> and blocked_id=auth.uid()))` clause to the *cross-user* visibility branch only — the `user_id = auth.uid()` (own content) branch is untouched, blocking never hides your own posts from yourself. `comments` gets its own independent block-check (on `comments.user_id`, not just inherited from the post's own visibility) so a blocked person's individual comment disappears even on a post you still own and can see.
  - **Verified DB-level end-to-end**, and a real scare during verification that turned out to be a test-script mistake, not a product bug, worth remembering the shape of: after test1 blocked test2, test1's own-posts query appeared to be missing a row. Turned out that row (`4b279c3b...`) was never test1's post at all — it was **test2's**, visible to test1 only via the cross-user branch, and correctly disappeared once blocked (bidirectional exclusion working as designed). The fix was re-querying with `user_id` explicitly selected to check the actual owner, not assuming ownership from an earlier unfiltered query. Lesson: when a "should still work" case appears to break after an RLS change, verify what you think you know about the test data (especially ownership) before concluding the policy is wrong.
  - Full verified sequence: baseline visibility → cross-user comment insert → block → comment now hidden from blocker (comment-level) → blocked-post now hidden from the blocked user (post-level, two-way) → unblock → both restored.
- **Reporting built from scratch** — migration (`supabase/migrations/20260721053608_add_reports_table.sql`): `reports` table matching the spec's columns (`reporter_id`, `target_type` check-constrained to `'post'|'comment'`, `target_id` — deliberately **no FK** on `target_id` since it's polymorphic across two tables, `reason`, `status` default `'pending'` check-constrained to `'pending'|'reviewed'|'dismissed'`, `reviewed_by` nullable FK **`on delete set null`** (not cascade — losing the admin shouldn't delete the report) , `reviewed_at`, `created_at`). RLS is **insert-only for regular users, no select/update/delete policy at all** — matches the spec's own framing exactly ("the admin review UI can come later; the data capture must exist now"). The insert `with check` requires the target to actually be visible to the reporter (an `exists` against `posts` or `comments` depending on `target_type`), which transitively inherits both the 36h rule and the brand-new block exclusion for free, same trick `comments`' own insert check already used.
  - `hooks/useReports.ts` (`useSubmitReport` — a plain fire-and-forget mutation, no query/invalidation needed since nothing client-side ever reads this table) and `components/ReportButton.tsx` (inline reveal-a-form pattern like the reply UI, not a real modal — handles loading/error/success states on the mutation). Wired into both `app/post/[id].tsx` (report the post) and `components/CommentThread.tsx` (report any comment or reply not authored by the viewer).
  - **Verified DB-level**: valid post report → `201`; valid comment report → `201`; reporting a nonexistent target → `403` (the `exists` check fails); impersonating another reporter → `403`; an invalid `target_type` → rejected, but via the RLS policy itself rather than the check constraint (neither policy branch matches an unrecognized type, so RLS fires first) — same end result, just a different error code (`42501` not `23514`) than a naive guess would expect; the reporter attempting to read `reports` back → `[]`, confirming the no-select design.

**How to apply:** Phase 4 is fully done — likes, comments, replies, polling, card UI, blocking (schema, hook, UI, and the visibility exclusion), and reporting are all built and DB-verified. `CLAUDE.md`'s phase table now marks Phase 4 complete. Next is Phase 4.5 (anonymous posting) per `[[anonymity-and-proximity-decisions]]`, then Phase 5's region-based proximity rework. The 8 dummy accounts have now posted (below).

**Pre-existing Phase 1 bug found and fixed on 2026-07-21: cross-user photos were never viewable, at all, until today.** Not a Phase 4 regression — surfaced only because this was the first time a photo-bearing post was actually viewed by someone other than its own author; every earlier photo test (Phase 1/2) was the uploading account viewing their own upload in History/Today, which never exercised the cross-user path.
- **Root cause**: the `post-photos` Storage bucket's RLS policies (`storage.objects`, scoped by path — first folder segment is the uploader's `user_id`) were strictly owner-only, with no allowance for "this post is otherwise publicly visible." Confirmed directly: signing your own photo worked (full JPEG returned); signing another user's photo returned a bare `404 Object not found` — Storage's way of masking a permission denial as nonexistence. This directly contradicted the spec's own stated design (§1.4): storage policies were supposed to mirror the 36h visibility window; they didn't mirror it at all.
- **Fix**: new migration (`supabase/migrations/20260721070228_photo_storage_cross_user_visibility.sql`) adds one new permissive SELECT policy on `storage.objects` (additive — doesn't touch/replace the existing owner-only policy, since Storage RLS policies OR together same as any table's) for `bucket_id = 'post-photos'`, allowing a read when a `posts` row exists whose `photo_url` matches the object's path **and** that post is currently visible by the same rule `posts`' own SELECT policy uses (own post, or live + approved + not blocked either direction) — the exact block-exclusion condition from Concept 2, duplicated here rather than shared via a function. **Known duplication/maintenance risk, flagged deliberately, not fixed**: this visibility condition now lives in three places (`posts`' policy, `comments`' policy, and this one) — if it changes again, all three need updating together or photos could leak past (or fall short of) whatever the real rule becomes.
- **Verified**: signing a live cross-user photo → success (real signed URL, later fetched as a genuine 76KB JPEG); blocking the photo's owner → same request now `404`s; unblocking → succeeds again. Also confirmed visually in the running app (Playwright): the photo actually renders on test1's screen for test2's post, `naturalWidth: 1080` matching the source file, both before block-testing and after the fix (it did not render at all beforehand — zero `<img>` tag for the photo existed in the DOM).
- **How discovered**: user reported "can't see any uploaded images on Explore or the post page." Initial hypothesis (data-level: maybe no live posts actually had photos) was ruled out by checking `photo_url` directly; the actual signed-URL/fetch pipeline was verified working *for the owner's own photo* before the cross-user case was tested specifically and failed — worth remembering to test the cross-user path explicitly for anything involving Storage, not just the DB row's own RLS, since the two are governed by entirely separate policy systems that can silently drift out of sync with each other.

---

Phase 4.5 (anonymous posting) **started 2026-07-25**. Design settled first across a long planning discussion — see `[[anonymity-and-proximity-decisions]]`, `[[front-server-caching-decisions]]`, `[[friends-feature-decisions]]`, and the human-readable rationale doc `docs/feed-and-caching-architecture.md`. Building one concept at a time.

- **Concept 1 (the read mechanism) built + DB-verified 2026-07-25.** Migration `supabase/migrations/20260725150000_add_is_anonymous_and_posts_feed_view.sql`: adds `posts.is_anonymous boolean not null default false`, and a **`security_invoker = on`** view `posts_feed` that flattens the author (`author_username`/`author_display_name`/`author_avatar_url` via a `left join profiles_public`) and `CASE`-nulls `user_id`/`photo_url`/those author fields when `is_anonymous and user_id <> auth.uid()`. Grant to `authenticated`.
  - **`security_invoker = on` is the crux and the opposite of `profiles_public`** — the base `posts` RLS (36h + block) must still apply, so the strip is *only* the projection, never a visibility change. The base `posts.user_id` is never touched (hard invariant, user-confirmed) → privileged direct DB queries still see every author, which is the moderation path.
  - **Migration ordering gotcha**: the tier/index migration earlier got a Bash-local timestamp (`...141645`) ahead of the CLI's UTC stamp, so `supabase migration new` produced `...063115` which sorted *before* the applied frontier and `db push` refused it (asked for `--include-all`). Fixed by renaming the file to `...150000` (monotonic) rather than force-applying out of order.
  - **Verified DB-level via REST** (`scratchpad/test_posts_feed.py` + `test_author_strip.py`, dummy1probe = A, dummy2 = B, both Australia/Sydney): with a real name put on A's profile so the strip is non-trivial — anon post: B sees `user_id`/`photo_url`/author all `null`, A (owner) sees all of them; non-anon post: B sees the real author (so the strip is conditional, not blanket); message/rating always visible. And `security_invoker` still *excludes* — B gets `[]` for A's >36h post through the view, A (owner) still sees it. First run's author-strip "passed" trivially because dummy profiles had null names; caught it and re-tested with a real name to actually prove it. Two harmless side effects: dummy1probe now has display_name `Dummy A`; one live anonymous test post exists (`6f619c2b...`, ages out in ~36h).
  - **Forward flags for Concept 2 (hook/type wiring), not yet done**: (1) switch `useExploreFeed`/`usePost` to `posts_feed`; (2) `ExplorePost`/`Post` types must derive from the *view* Row (fewer columns, **flat** author) not the table Row — components change from `post.author.username` to `post.author_username`; (3) the view nulls `user_id` for anon posts, which breaks `useExploreFeed`'s server-side `.neq('user_id', userId)` (a null `user_id` row is dropped by `neq`) → self-exclusion must move client-side (`post.user_id === myId`), matching the settled design. The view deliberately omits `location`/`photo_thumb_url`/`place_label` (unused by the client today).

- **Concept 2 (wire the read path to `posts_feed`) built + verified in-app 2026-07-25.** New hand-written `FeedPost` type in `types/posts.ts` (replaces `ExplorePost`; flat author fields; identity columns `user_id`/`photo_url`/author-fields nullable, content columns non-null — the generated view Row can't express this since Supabase types *all* view columns nullable, so the hooks cast `data as FeedPost[]`/`as FeedPost | null` at the boundary). `useExploreFeed` + `usePost` now read `posts_feed` with `.select('*')` (no `profiles_public` embed). Self-exclusion moved to a TanStack `select` transform (`pages.map(p => p.filter(x => x.user_id !== userId))`) — deliberately **not** in `queryFn`, because `getNextPageParam` must see full raw pages or pagination stops early. `ExplorePostCard` + `app/post/[id].tsx` read flat author via the `?? ANONYMOUS_AUTHOR_LABEL` fallback (anon posts have all author fields null → render "Anonymous" for free).
  - **Nice emergent correctness: the anonymity-block rule surfaced as a *type error*.** `post.user_id` became `string | null`, so `<BlockButton blockedUserId={post.user_id}>` failed (`null` not assignable to `string`) — exactly the "can't block an anonymous author" decision. Fix on the detail screen: split the grouped block/report — `ReportButton` stays gated on `session.user.id !== post.user_id` (works for anon; reports target `post.id`), `BlockButton` additionally requires `post.user_id !== null` (hidden on anon posts, and the guard narrows the type). "Hide this post" recourse is deferred to a later concept.
  - **Ripple caught by `tsc --noEmit`**: removing the `ExplorePost` export broke `useLikes.ts` + `useComments.ts`, which imported it to type the `['posts', {id}]` optimistic cache → both switched to `FeedPost` (they only touch `like_count`/`comment_count`, both present). Lesson reinforced: grep an exported symbol's consumers before renaming/removing it. Full project type-checks clean after the fixes.
  - **In-app verified** (dummy2 viewing dummy1probe's anon post): renders "Anonymous", no photo, Report shown, Block hidden. `usePostHistory` intentionally left on the base `posts` table + `Post` type — it's own-posts-only, where anonymity never strips.

- **Concept 3 (compose-time toggle + write path) built + verified in-app 2026-07-25.** `ComposeForm` gained an `is_anonymous` `Switch` + `initialIsAnonymous` prop + the value in its `onSubmit` payload; a contextual warning (`ANONYMOUS_POST_WARNING` in `constants/posts.ts`) shows only when the toggle is on. Threaded through `handleSubmit` (Today screen) → `UpsertPostInput.isAnonymous` → the `is_anonymous` column in `useUpsertPost`'s upsert. Edit path round-trips (toggle pre-fills from the loaded post via `todayPostQuery.data?.is_anonymous`). **Warning copy deliberately states only the current guarantee** — "Your name is hidden from other users, but moderators can still see who posted" — NOT the friends-feed-guessable clause, which gets added in Phase 4.7 when the friends feed actually exists. Verified in-app: composed anonymously as one dummy, warning appeared, the other dummy saw it as "Anonymous".
  - **Design smell surfaced (deferred): the `"Anonymous"` label is overloaded** — it means both a deliberately `is_anonymous` post AND any user with null `display_name`/`username` (the `?? ANONYMOUS_AUTHOR_LABEL` fallback). On **comments** — which have no anonymity feature; `useComments` joins the real `profiles_public` author and stores the real `user_id` — a nameless commenter therefore also renders "Anonymous", which looks like (but isn't) anonymization. Not a leak. Fix options for later: reserve "Anonymous" for `is_anonymous` and give nameless users a different fallback (e.g. "Someone"), and/or collect a username at onboarding (spec intends this) so the null-name fallback rarely fires. Filed as polish, not blocking.

- **Concept 4 (photo-path rework, so anon posts can show photos) built + verified 2026-07-25.** Migration `20260725080735_anon_photo_path_rework.sql` (renamed from the CLI's UTC stamp to sort after `...150000`, same ordering gotcha as before): (a) new write-side Storage policy `authenticated can upload post photos` — `for insert to authenticated with check (bucket_id = 'post-photos')`, authorizing by bucket instead of the old `<user_id>/` path-prefix (which no longer exists); (b) `create or replace` `posts_feed` to stop nulling `photo_url` (the `user_id`/author strips stay) — safe now that the path carries no identity. `utils/uploadPhoto.ts` now takes just `(localUri)` and writes to `` `${Crypto.randomUUID()}.jpg` `` (expo-crypto, already a dep); caller in `app/(tabs)/index.tsx` simplified. The Phase-4 read policy is scheme-agnostic (`posts.photo_url = object name` + visibility) — unchanged.
  - **RLS implication accepted + flagged**: write is now bucket-wide for any authenticated user (can't scope by user folder anymore). Overwrite/targeting is a non-issue (unguessable UUIDv4 paths); the residual is storage abuse (no per-user quota/rate-limit) — future hardening, alongside orphan cleanup (edit-replace orphans the old object; nothing deletes it).
  - **Two bugs hit + fixed during the build, both classic**: (1) pasted the `...` sketch placeholders literally into the `create or replace view` → `syntax error at "..";` — the full column list must be spelled out (a `create or replace view` can't reorder/drop columns, so every column had to match the Concept-1 view in order, `moderation_status` included). (2) `` `${Crypto.randomUUID}.jpg` `` — missing `()` → the template literal stringified the *function object* into the path → Storage rejected the key → `uploadPhoto` threw → `handleSubmit`'s catch skipped the mutate → **post silently not created** (only when a photo was attached). Symptom "post with photo doesn't save" traced straight to the missing parens.
  - **Verified DB + in-app**: posted anonymously with a photo → base `posts.photo_url` is a bare `<uuid>.jpg` (no user_id); via `posts_feed` as a non-owner the photo shows while `user_id`/author stay null; in-app the anon post renders its photo labelled "Anonymous". Also swept all visible `is_anonymous` posts via the view for old-scheme (`/`-containing) photo paths — only hit was a Concept-1 test injection (`testpath/fake.jpg`, not a real user_id), now nulled. No real legacy leak.

- **Concept 5 ("Hide this post") built + verified in-app 2026-07-25 — Phase 4.5 COMPLETE.** `hooks/useHiddenPosts.ts`: `useHiddenPostsIds` (`useQuery` reading a JSON id array from AsyncStorage → `Set<string>`, key `['hiddenPosts']`) + `useHidePost` (`useMutation` appending an id + invalidating). `useExploreFeed` calls `useHiddenPostsIds()` at the top and its `select` filters `p.user_id !== userId && !hiddenIds?.has(p.id)` (both exclusions in the one `select`, so `getNextPageParam` still sees raw pages). Detail screen got a "Hide this post" `Pressable` (in the Report group, so it shows on anon posts where Block is hidden) that `mutate`s the id + `router.back()`. Local-only (per-device, permanent, no un-hide UI) — accepted MVP scope. Verified: hide → gone from Explore, still gone after app relaunch (AsyncStorage persisted).
  - **Bug parade this concept, all the recurring kinds**: (1) `Set<<string>` double-`<` typo + `String` (boxed) vs `string`; (2) hook wired *inside* `queryFn` then *at module top level* before finally landing inside the function body — the module-level version passed `tsc` but crashed at runtime ("No QueryClient set", `<global>` frame) because rules-of-hooks is a lint/runtime rule, not a type rule; (3) `router.back` missing `()` (2nd missing-parens bug after `Crypto.randomUUID`); (4) two adjacent JSX siblings needing a fragment; (5) `postQuery.data` narrowing lost inside the `onPress` closure → fixed by using the `const post` binding (const narrowing survives closures) — Claude applied this `[id].tsx` fix directly at user request; (6) `uploadPhoto` caller still passing 3 args (Concept 4 leftover) — ran in-app anyway because Metro/Babel strips types without checking, only `tsc --noEmit` caught it.

---

Phase 4.7 (friends) **started 2026-07-28**. Design was settled beforehand in
`[[friends-feature-decisions]]`; this is the build log.

- **Concept 1 (schema + RLS + the two RPCs) built + DB-verified 2026-07-28.**
  Migration `supabase/migrations/20260728093817_friends.sql`: `friend_requests`
  (composite PK, self-check, FKs to `profiles` on delete cascade) with a
  **unique index over `(least(...), greatest(...))`** — the repo's first
  expression index — plus `friend_requests_addressee_idx`; `friendships`
  (mirrored two rows per pair, composite PK, self-check); and
  `accept_friend_request` / `remove_friendship`, the repo's **first
  client-callable RPCs** and first non-trigger `security definer` functions.
  Written by the user under guide+review across ~6 review rounds.
  - **The one security-critical thing here** is that `accept_friend_request`
    does `delete from friend_requests ... ; if not found then raise` **before**
    the insert. The first draft had insert-first with no `found` check at all,
    which meant any authenticated user could `rpc('accept_friend_request',
    { other_user_id: <stranger> })` and force a friendship — `security definer`
    turns RLS off inside the body, and a `DELETE` matching zero rows is not an
    error. **Explicitly attack-tested**, not assumed (cases 11–13 below).
  - **Verified DB-level via REST, 27/27**
    (`scratchpad/verify_friends.py`, dummy1probe/dummy2/dummy3 as A/B/C):
    self-request → `23514`; duplicate A→B → `23505`; **reverse B→A while A→B
    pending → `23505`** (proves the expression index); forged `requester_id` →
    `403`; both parties see the request, a third account gets `[]`; reject and
    cancel both `204`; **force-friend with no request → `P0001`, zero rows
    created**; **requester self-accepting their own outbound → `P0001`**
    (proves the predicate is directional); real accept → request consumed +
    both mirrored rows present; double-accept → `P0001`; unfriend → **both**
    mirror rows gone; unfriending a non-friend → silent `204`; re-request after
    unfriend → `201` (no tombstone); anon/no-JWT calls to both RPCs → `403`
    with `28000` from the null-`v_uid` guard.
  - **Real finding that corrects a plan assumption: the per-verb `grant` lines
    in this repo's migrations do not actually restrict anything on the remote
    project.** Verified directly: `reports` was granted **insert only**, yet a
    `SELECT` returns `200 []` and a `DELETE` returns `204`; `blocks` accepts an
    `UPDATE` (`204`) despite having no update grant and no update policy. So
    `authenticated` holds broad table privileges regardless of the migration's
    grants, and **RLS is the sole enforcement layer** — `enable row level
    security` plus the set of policies is doing 100% of the work on every
    table. Consequence for `friendships`: it is genuinely locked (verified —
    a direct `DELETE`/`PATCH` affects **zero rows** and both mirror rows
    survive; a direct `INSERT` → `403` `42501` RLS violation), but it's locked
    by *no policy existing*, not by the `select`-only grant. The "two
    independent layers" framing in the plan was wrong. Keep writing the narrow
    grants (they document intent and are correct locally, where
    `auto_expose_new_tables` is unset), but never rely on one as a security
    boundary.
  - **Also worth remembering: RLS denies UPDATE/DELETE silently.** With RLS on
    and no policy for that verb, the operation matches zero rows and returns
    `204` — it does *not* error. Only INSERT raises (`42501`, "new row violates
    row-level security policy"). A verification case that asserts `403` for a
    blocked DELETE will fail even when the table is correctly locked; assert on
    **row counts before/after**, not the status code. This cost one false
    alarm during verification.
  - **Bug parade during the build, all the recurring kinds**: skeleton
    placeholders pasted literally (`...` and a `-- see plan` pointer became
    file content, leaving both tables with *no columns declared* — 3rd instance
    of this pattern after `blocker.sql`'s prose-as-SQL and the `posts_feed`
    `...`); missing comma before a table-level `check` (twice, once per table);
    `timestampz` for `timestamptz` (twice); `onconflict` as one word (survived
    3 review rounds — a missing space is near-invisible on reread); function
    modifiers duplicated on both the signature line and after the body
    (`conflicting or redundant options`); and then, fixing that, the trailing
    `$$;` terminator deleted entirely rather than trimmed — which swallowed the
    rest of the file into an unterminated dollar-quoted string, an error that
    reports at EOF rather than at the actual line.
  - `types/database.ts` regenerated (via Bash, per the UTF-16 gotcha — output
    confirmed ASCII); `accept_friend_request` / `remove_friendship` both land
    as `{ Args: { other_user_id: string }; Returns: undefined }`. Full project
    `tsc --noEmit` clean.
  - **Docs done 2026-07-28**: `docs/database-architecture.md` gained §2 table
    blocks for both tables, a §4 RLS + RPC subsection (including the grants
    correction and the silent-UPDATE/DELETE trap as a blockquote), §6 migration
    entries, a §7 rewrite splitting "friends feed/hooks still deferred" from
    the new "blocks do not gate friend requests" bullet, and a §8 checklist
    entry. Two **pre-existing gaps in §6 fixed while there** — the migration
    list was missing `20260725080735` and `20260725150000` entirely.
  - **`ANONYMOUS_POST_WARNING` extended** (`constants/posts.ts`) with the
    friends-feed clause that Phase 4.5 deliberately held back until the friends
    schema existed: "Anonymous posts still reach the feeds of people you are
    friends with, where a small circle can make them easy to guess." This was
    the **required mitigation** agreed when soft anonymity among friends
    (Option B) was chosen — see `[[friends-feature-decisions]]`.
  - **Pushed to GitHub 2026-07-28** — commit `4114f7c` on `main` (6 files: the
    migration, regenerated types, the architecture doc, the warning copy, and
    this log). Unlike Phase 4.5, `memory/` is now tracked, so the build log and
    decision records ship with the repo.
  - **Deferred deliberately (user's call): blocks do not gate friend
    requests** — Phase 7.

- **Concept 2 started 2026-07-28** — the client side. Plan (schema prereqs →
  hooks → profile screen → profile tab → requests screen → nav entry points)
  lives at `C:\Users\user\.claude\plans\yep-plan-the-nxt-misty-taco.md`, which
  is **outside the repo and per-machine** — the durable decisions are copied
  here and into `docs/database-architecture.md`. User's calls at planning time:
  reporting a user is in scope, friend count is in scope, the history tab
  becomes `app/(tabs)/profile.tsx`, blocks still deferred to Phase 7.
  - **Step 1 (two migrations) built + DB-verified 16/16, pushed.**
    `20260728110551_user_add_to_reports.sql` widens `reports.target_type` to
    allow `'user'` and rewrites the insert policy with a third branch;
    `20260728110736_friend_count.sql` adds the `friend_count` RPC. Split into
    two files deliberately per sub-phase discipline — one rewrites an existing
    policy (regression risk), the other adds a function.
  - **Three findings from this step, all recorded in
    `docs/database-architecture.md`:**
    1. **The `revoke execute ... from public` does NOT bind `anon` on this
       project, and Concept 1's §8 note claiming it did was wrong.** An anon
       call returns `28000`, which is raised *inside* the function body — a
       bound revoke would give `42501` before the body ran. Confirmed with
       `get_entry_date` (no revoke, no guard) executing fine as anon. **The
       in-body null-`auth.uid()` guard is the only thing keeping anon out of
       every RPC here.** Same root cause as the Concept 1 table-grants finding.
    2. **`profiles_public` is readable by `anon` unauthenticated** —
       pre-existing since `20260713092053`, contradicts §1, **not yet decided**.
       The full user directory is world-readable to anyone with the publishable
       key, which ships in the Expo bundle.
    3. **The reports `'user'` branch must reference `profiles_public`, never
       `profiles`.** A policy subquery runs as the invoker and `profiles` RLS is
       owner-only, so the `profiles` version would silently allow *only*
       self-reports and reject every real one. Tested as a matched pair; neither
       case alone is diagnostic.
  - **Step 2 (hooks) built, `tsc` + ESLint clean, not yet runtime-tested** —
    nothing imports them until the screens exist. `hooks/useFriends.ts`:
    `useFriendRequests` / `useFriendsIds` / `useFriendCount` / `useFriendStatus`
    (derived, composes the other three plus `useBlockStatus`, returns a
    seven-member union with `'unknown'` as a real member so a caller can't
    forget the loading case) + `useSendFriendRequest` /
    `useDeleteFriendRequest` (one hook for both reject and cancel — same row
    delete, one DB policy) / `useAcceptFriendRequest` / `useRemoveFriendship`.
    New `types/friends.ts` for the generated row aliases + `FriendStatus`.
    First `supabase.rpc(...)` calls in the codebase.
  - **Invalidation is simpler than planned**: `invalidateQueries({ queryKey:
    ['friends'] })` prefix-matches, so it catches the friend-id set *and* every
    cached `['friends', { count }]` in one call — no need to enumerate both
    parties' counts. Accept is the only mutation touching two namespaces.
    **No optimistic updates**, deliberately: friend actions are rare and
    latency-tolerant, and accept can legitimately fail with `P0001` on a race.
  - **`as` hid three separate real bugs in `useFriends.ts` during this step**,
    which is worth treating as a local rule — in this codebase a cast next to a
    Supabase result is almost always covering something:
    1. A hand-written type asserting an `id` column that **doesn't exist**
       (`friend_requests` is a composite PK, no surrogate id) — so `item.id`
       would be `undefined` at runtime with no type error.
    2. **`GenericStringError`** — supabase-js parses `.select()` strings *at the
       type level* using template-literal types, which requires a string
       **literal**. The select was built with `'a' + 'b'` concatenation;
       TypeScript doesn't constant-fold `+`, so the parser got an opaque
       `string`, gave up, and typed the result as `GenericStringError[]`. The
       cast was the only thing giving `data` any type at all. **Fix: keep
       Supabase select strings as single literals — no concatenation, no
       variables, no conditional building**, or type inference silently dies.
    3. `const { count } = await supabase.rpc(...)` — `rpc()` resolves to
       `{ data, error }`; `count` is the row-count header and is only populated
       by a `select` with `{ count: 'exact' }`. It was returning `null` while
       typed `number`. Note the gap is wider than it sounds: blocking also
    doesn't sever an existing friendship or pending request, and neither
    `friendships` RLS nor `profiles_public` carries a block clause, so a
    blocked ex-friend stays visible *as a friend* with name and avatar. Post
    content is already safe via `posts`' own policy, so it's an identity leak,
    not a content leak. Right fix is an `after insert on blocks` trigger, not
    a `not exists` bolted onto every future friends read.

- **Step 3 (profile screen + `FriendActionButton`) built + verified in-app
  2026-07-29.** `hooks/useProfile.ts` (single-row `profiles_public` read by
  id, same loading/error/not-found shape as `usePost`), `components/
  FriendActionButton.tsx` (switches on `useFriendStatus`, calling one of
  `useSendFriendRequest` / `useDeleteFriendRequest` / `useAcceptFriendRequest`
  / `useRemoveFriendship` per branch — `'outgoing'` cancel and `'incoming'`
  reject share the same `useDeleteFriendRequest` call with `requesterId`/
  `addresseeId` swapped), and `app/profile/[id].tsx` (mirrors `post/[id].tsx`'s
  three-state pattern; self-view redirects to `/(tabs)/history` via
  `<Redirect>`, gated behind `authLoading` first so there's no flash — same
  "call every hook, conditionally return after" shape `(tabs)/_layout.tsx`
  already used for its own auth redirect).
  - **New `UNNAMED_USER_LABEL` constant** (`constants/Profiles.ts`), kept
    deliberately separate from `ANONYMOUS_AUTHOR_LABEL` — a profile is never
    actually anonymous (you navigated to a specific person's id, they just
    have no `display_name`/`username` set), so reusing the "Anonymous" wording
    here would misrepresent a nameless account as a deliberately-anonymous
    post, compounding the label-overload design smell already flagged in
    Phase 4.5.
  - **First-draft bug parade, all caught in review before being fixed**: the
    hook's `useQuery(...)` call wasn't `return`ed (every caller would have
    gotten `undefined`); the hook's `queryFn` was typed `Promise<ProfilePublicRow>`
    (non-null) while returning `.maybeSingle()`'s nullable result; the button's
    `switch` cases were written with no enclosing `switch` at all (bare `case`
    labels in the function body); then, once wrapped, the JSX in four branches
    had no `return` (expression evaluated and discarded); the five `handle*`
    callbacks referenced in `onPress` were undefined for two full review passes
    before being written; and a `deleteRequest`/`deleteFriendRequest` naming
    mismatch survived one review pass. All fixed; final switch is exhaustive
    over all seven `FriendStatus` members, no `default` needed.
  - **Verified in-app** via direct URL navigation (`/profile/<id>`) against
    three dummy accounts (dummy1probe/dummy2/dummy3, confirmed clean —
    no pre-existing `friend_requests`/`friendships` rows via REST) — no nav
    entry point exists yet (deliberately last in the plan), so this is typed
    URLs, same as `post/[id].tsx`'s first test before `ExplorePostCard` had a
    `Link`. User confirmed all of: viewing a stranger's profile ('none' →
    "Add friend"), sending, the other side seeing 'incoming' → Accept/Reject,
    cancel/outgoing, accept → 'friends' on both sides + friend count update,
    remove, self-profile redirect, and the report-user action.
  - Dev server left running in the background at `localhost:8081` for this
    session (Expo web, `expo start --web`).
  - **Remaining for Concept 2** (superseded below): profile tab, requests
    screen, and nav entry points — none started.

- **Profile tab rename done 2026-07-29** — `app/(tabs)/history.tsx` →
  `app/(tabs)/profile.tsx` (`git mv`, history preserved), component renamed
  `HistoryScreen` → `MyProfileScreen` (kept distinct from the dynamic
  `ProfileScreen` in `app/profile/[id].tsx` — "mine vs. someone else's", same
  distinction `useFriendsIds`'s `{ scope: 'mine' }` query key already used).
  `app/(tabs)/_layout.tsx`'s tab `name`/`title`/icon updated to match; the
  self-redirect in `app/profile/[id].tsx` repointed at `/(tabs)/profile`.
  Claude did the rename directly at the user's request (mechanical, not
  design work). The screen itself (profile header: avatar/name/friend count
  above the existing chart+list) was written by the user, with one real bug
  parade caught in review: literal `{...}`/`"border ..."` placeholders
  **pasted verbatim from an earlier pseudocode sketch** (4th instance of this
  exact failure mode logged in this file), plus a wrong hook call
  (`usePostHistory` twice instead of `useProfile`), a missing `Image` `source`
  prop, and an undeclared `profile` variable. Also surfaced: `constants/
  Profiles.ts`'s `UNAMED_USER_LABEL` typo (flagged twice, unfixed until this
  pass) was blocking a real import once something finally tried to use the
  correctly-spelled name — fixed in the same pass, filename also lowercased
  to `constants/profiles.ts` to match the `posts.ts` convention.
  - **Recurring env gotcha**: renaming a route file doesn't retroactively
    update Expo Router's generated typed-routes file
    (`.expo/types/router.d.ts`) — it only regenerates while the dev server is
    actively watching. Stopping the server (done deliberately, see below) and
    then renaming/adding routes leaves stale/missing entries and real-looking
    `tsc` errors on `<Redirect href="...">`/`<Link href="...">` until the
    server is restarted at least once. Not a code bug each time it recurred —
    confirmed by checking git history (files were genuinely never tracked
    under the stale casing/path) before treating it as one.
  - **Test-account avatar tangent, no code change**: user asked to upload a
    screenshot as dummy1probe's `avatar_url` for visual testing. Blocked by
    design: `post-photos`' Concept-4 read policy only grants access through a
    *visible `posts` row* referencing the object — a standalone upload has no
    such row, so **not even its own uploader can read it back** (confirmed:
    upload succeeded, `list`/`sign` both denied). There is no avatar-upload
    feature (bucket/RLS/hook) built at all yet. Presented the real options
    (data-URI shortcut vs. building real avatar upload); **user deferred to a
    later feature** and declined the shortcut. Orphaned test object left in
    `post-photos` (delete attempt got `400`, harmless — unreadable by anyone
    per the same policy gap).

- **Requests screen + nav entry points built 2026-07-29 — Concept 2 COMPLETE,
  Phase 4.7 COMPLETE pending in-app verification.** User explicitly asked
  Claude to write this pair directly (stepping back from guide+review for
  this one).
  - **`app/requests.tsx`** (new, top-level sibling route like `post/[id].tsx`)
    — splits `useFriendRequests`'s combined result into incoming/outgoing by
    comparing `addressee_id`/`requester_id` against the session user, plain
    `.map()` over two `View` sections (not `FlatList` — matches
    `CommentThread`'s convention for a short, unpaginated list rather than the
    `FlatList` convention used for posts). Incoming rows get Accept/Reject,
    outgoing get Cancel — reusing `useAcceptFriendRequest`/
    `useDeleteFriendRequest` with no new mutations. Each row's name is a
    `Link` to `/profile/[id]`.
  - **Nav entry points**: `ExplorePostCard` and `app/post/[id].tsx` both gained
    a nested `Link` to `/profile/[id]` on the author name, guarded on
    `post.user_id !== null` (anonymous posts stay plain, unlinkable text,
    matching the existing `BlockButton` anonymity guard) — nested inside the
    card's existing outer `Link`/`Pressable` to `/post/[id]`; RN's touch
    responder system resolves this to "whichever is tapped" rather than both
    firing. `CommentThread` got the same treatment on both comment and reply
    author names, unconditionally (comments have no anonymity, `user_id`
    always present). `app/(tabs)/profile.tsx` gained a "Friend requests"
    `Link` (with an incoming-count suffix) to `/requests`.
  - **Verified**: full `tsc --noEmit` clean, `eslint --max-warnings=0` clean
    on every touched file.
  - **In-app verified 2026-07-29** (user, browser, dummy1probe/dummy2/dummy3)
    — user confirmed the requests screen (Accept/Reject/Cancel all work) and
    all three nav entry points (Explore, post detail, comments all correctly
    link author names to `/profile/[id]`; anonymous posts stay unlinkable).
    **Phase 4.7 is now fully built and verified — Concepts 1 and 2 both
    complete.** Next phase per `CLAUDE.md` is Phase 5 (region-based
    proximity).

---

**Phase 4.5 pushed to GitHub 2026-07-25** — commit `fe4603f` on `main` (19 files: the 3 migrations, hooks, components, screens, types, docs). **Deliberately excluded from the commit** (pre-existing, not this session's work): `app.json` + `package.json`/`package-lock.json` modifications (present at session start), and the root deletions of `CLAUDE.md` + `daily-rating-social-app-spec.md` (those files now live in the gitignored `memory/`; committing the deletions is the user's call, not made). `memory/` is gitignored, so none of the build-log/decision records are in the repo.

---

Phase 5 (region-based proximity) **started 2026-07-30**, planned via `/plan`
mode first — see `[[anonymity-and-proximity-decisions]]`'s "Phase 5 kickoff"
addendum for the resolved sparse-fallback/pipeline decisions (resolve-once-
at-login, never persist raw coordinates, widen state→country→most-liked).

- **Concept 1 (boundary dataset) built + fully verified 2026-08-01.**
  `region_boundaries` table + seed data — the first concept, schema-only, no
  app code. Two migrations for the table/RLS, one for the seed data:
  - **`20260730050811_region_boundaries.sql`** (table + RLS) — written by the
    user under guide+review, several rounds. `region_boundaries(id, admin_level
    check ('country'|'state'), country_code, state_code nullable,
    name, geom geography(MultiPolygon,4326))`, GiST index on `geom`, plus a
    table-level `check ((admin_level = 'country') = (state_code is null))`
    added on review to keep the two tiers from drifting out of sync (Claude's
    suggestion, user's call to include it). **Bug parade during authoring,
    all instances of failure modes already logged repeatedly in this
    file**: `gerography`/`4236` typos (2nd+ instance of SQL keyword typos
    surviving to review); the table itself and the migration filename both
    initially read `region_boundries` (missing the second "a") — caught and
    fixed before push; a literal `create index ...` with the `...` pasted in
    from a pseudocode sketch rather than filled in (Nth instance of this
    exact pattern); `grant slect` typo; a missing comma before the
    table-level `check (...)` (the *third* instance of "missing comma before
    a table-level check" logged in this file specifically); and a false-start
    regression where `state_code` was briefly changed to `not null`,
    which would have made every country-tier row uninsertable — caught in
    review, reverted.
  - **RLS gap found + fixed**: the original policy (`for select using
    (true)`, no `to authenticated`) applied to *every* role including `anon`
    — verified via a direct anon-key REST call returning `200 []` (not a
    `403`) against the empty table. Same unresolved pattern already flagged
    for `profiles_public`. Fixed via a second migration,
    **`20260730052915_region_boundries_policy_fix.sql`** (filename still
    carries the original typo — content is correct, cosmetic only), which
    drops and recreates the policy with `to authenticated`.
  - **A genuinely new, worth-remembering finding: `supabase db push`
    reported success and recorded the policy-fix migration as applied in
    `migration list`, but the live policy's role scope did not actually
    reflect `to authenticated`** — confirmed by querying
    `pg_policy.polroles::regrole[]` directly, which showed `{-}` (Postgres's
    representation of "no role restriction / PUBLIC"), not `{authenticated}`,
    even after the "fix" migration was pushed and listed as applied on both
    `local` and `remote`. Re-running the **identical** `drop policy` /
    `create policy ... to authenticated` statements directly via
    `supabase db query` immediately produced the correct `{authenticated}`
    scope. Root cause not diagnosed (a pooler/connection caching quirk during
    `db push` is suspected, not confirmed). **Lesson: for an RLS change where
    the exact role scope matters, `migration list`'s "applied" status is not
    sufficient proof — verify the live policy definition itself (e.g. via
    `pg_policy`), not just that the migration ran without error.** Confirmed
    conclusively after the direct fix, with real seed data loaded: anon-key
    REST call returns `200 []` against a table that provably has 471 rows —
    the first time this check was actually conclusive (it was inconclusive
    earlier against the empty table, since `[]` doesn't distinguish "blocked
    by RLS" from "genuinely empty," a trap already logged during Phase 4.7).
  - **Seed data built end-to-end by Claude directly, at the user's explicit
    request** ("you do it") — a bounded, non-recurring data-pipeline task,
    same category of one-off delegation as `useComments.ts`/blocking-
    concept-2/reporting in Phase 4. Real findings from that work, in case a
    boundary-data refresh is ever needed again:
    1. **GDAL/`ogr2ogr` install had two failed paths before succeeding.**
       `winget install GISInternals.GDAL` first stalled — measured the host
       (`download.gisinternals.com`) at ~37 KB/s directly via `curl`,
       confirming it was the host, not winget, since a different CDN
       (`repo.anaconda.com`) measured ~1.7 MB/s in the same environment.
       Retried and got **Error 1925** — the GISInternals MSI is an all-users
       install requiring admin elevation, unavailable in this session (no
       silent UAC path; elevation prompts can't be answered non-
       interactively). **Fixed via micromamba** — a ~4.5 MB portable,
       no-admin-required conda-forge package manager (`micro.mamba.pm`) —
       `micromamba create -p <prefix> -c conda-forge gdal` installs
       prebuilt GDAL binaries (including `ogr2ogr.exe`) with no compilation
       and no elevation. **Worth remembering as the default path for any
       future native-tool need in this environment**, ahead of winget/MSI
       installers that may require admin.
    2. **The originally-decided dataset (Natural Earth 1:110m for *both*
       tiers) turned out to be wrong for this app** — discovered via
       `ogrinfo` before committing to the conversion: the 1:110m admin-1
       (state/province) shapefile has only **51 features, all US states**.
       Natural Earth only ships full-world admin-1 coverage starting at
       1:50m. Since every current test account (all 8 dummies +
       test1/test2) is `Australia/Sydney`, shipping 1:110m as originally
       decided would have made state-level matching **silently work for the
       US only** — every other country's users would always fall straight
       through the sparse-fallback to country-level, defeating the point of
       the state tier for this project's own userbase. **Flagged and
       re-decided with the user** (not fixed unilaterally): state tier
       switched to **1:50m** (294 features, still only
       ~890 KB zipped); country tier stayed at **1:110m** (177 features,
       already full world coverage, smaller file). The two tiers now
       deliberately use different Natural Earth resolutions — not a
       mismatch, a considered choice.
    3. **A known Natural Earth data quirk handled deliberately**: the raw
       `ISO_A2` field on the admin-0 (countries) layer has a long-documented
       bug reading `-99` for France, Norway, and a few disputed territories.
       Used `ISO_A2_EH` instead (the corrected field), verified via `ogrinfo
       -where "ISO_A2='-99'"` that it resolves France→`FR` and Norway→`NO`.
       Two genuinely disputed territories (N. Cyprus, Somaliland) still read
       `-99` under either field — accepted as-is; they have no real ISO code
       to map to, not a bug to fix.
    4. **Conversion pipeline**: `ogr2ogr -f PGDump` per shapefile, each with
       a `-sql` clause remapping Natural Earth's own attribute names into
       this project's `country_code`/`state_code`/`name` columns and
       `-lco GEOM_TYPE=geography` to match `region_boundaries.geom`'s column
       type exactly (no cast needed later) — producing two **staging-table**
       SQL dumps (not `region_boundaries` directly, since `ogr2ogr` has no
       concept of the `admin_level` split). Final migration,
       **`20260801064023_seed_region_boundaries.sql`**, was assembled via
       `sed`/`cat` (stripping the auto-generated `DROP TABLE`/`BEGIN`/
       `COMMIT` lines from each dump, since the migration owns its own
       transaction and the staging tables are created fresh) — **never by
       reading the multi-megabyte WKB hex geometry blobs into context and
       retyping them**, which would risk silent corruption of the polygon
       data. The migration inserts from both staging tables into
       `region_boundaries` with `admin_level` set explicitly per source, then
       drops both staging tables — confirmed gone afterward via
       `information_schema.tables`.
    5. **`supabase db query --file ... --linked`** is this project's first
       use of direct ad-hoc SQL queries against the remote DB from the CLI
       (distinct from `db push`, which only applies migration files) — used
       here for verification, not schema changes. Note: it only prints the
       **last** statement's result set when a file has multiple `select`s;
       run one query per file/call for multi-check verification.
  - **Verified DB-level, fully conclusive**: row counts (177 country + 294
    state = 471, matching the source shapefiles' feature counts exactly);
    `ST_Contains` spot-checks — Sydney (-33.8688, 151.2093) → New South Wales
    + Australia; Denver, CO (39.7392, -104.9903) → Colorado + United States;
    a mid-Pacific point (0, -150) → zero rows (the empty-match case the
    later state→country sparse-fallback logic depends on); and the
    anon-blocked RLS check described above, now conclusive with real data
    present. `types/database.ts` unaffected (no new persistent tables — the
    staging tables are dropped within the same migration).
  - **Concept 1 is complete.** Next up per the plan: Concept 2, the
    `resolve_region(lng, lat)` RPC — the only place raw coordinates will ever
    reach the server under the revised pipeline.
  - **Correction logged 2026-08-03 (see Concept 2 below): the "1:50m = full
    world coverage" claim above was wrong.** The 294 admin-1 features span
    only **9 countries** (`RU, US, IN, ID, CN, BR, CA, AU, ZA`) — Natural
    Earth's 1:50m admin-1 layer is a large-country subset, not global. The
    original text has been amended in place. See Concept 2 for the accepted
    trade-off.

- **Concept 2 (the `resolve_region(lng, lat)` RPC) built + DB-verified
  2026-08-03.** Migration `supabase/migrations/20260803074846_resolve_region.sql`,
  written by the user under guide+review. `security invoker` (deliberately
  *not* `definer`, unlike the friends RPCs — it only reads a reference table
  that already has its own `select ... to authenticated` policy, so `definer`
  would grant privileges it has no use for *and* would bypass the role scope
  fought for in Concept 1), `stable`, `set search_path = public`, an
  `auth.uid() is null` guard raising `28000`, and
  `returns table (country_code, state_code, place_label)` so the signature
  types cleanly into `types/database.ts`.
  - **One index-backed scan resolves both tiers** via conditional aggregation
    (`max(case when admin_level = 'country' then ... end)`), rather than two
    separate lookups. `ST_Covers(rb.geom, v_point)` — **not `ST_Contains`,
    which PostGIS only implements for `geometry`**; casting `geom::geometry`
    would compile and return right answers while silently defeating the GiST
    index on the geography column.
  - **A genuine design bug caught in review, caused by Concept 1's deliberate
    mixed-resolution choice**: 1:110m country polygons have smoother
    coastlines than 1:50m state polygons, so a coastal point (Sydney is one)
    can sit inside the state polygon but *outside* the country polygon.
    The first draft returned zero rows in that case, discarding a valid state
    match. Fixed with a `coalesce` that falls back to the **state row's own
    `country_code`** (non-null on both tiers, guaranteed by Concept 1's
    `check ((admin_level = 'country') = (state_code is null))`).
  - **Second bug, same review: `||` NULL propagation in the label.** The
    coastal-rescue path leaves `v_country_name` null while `v_state_name` is
    set, and `'New South Wales' || ', ' || NULL` evaluates to `NULL` — so the
    label would silently vanish in exactly the case the `coalesce` was added
    to rescue. Replaced with `concat_ws(', ', v_state_name, v_country_name)`,
    which skips NULL arguments and collapses the whole `case` branch. Same
    family as the Phase 4 optimistic-comment bug: **this codebase's fallback
    chains all key on NULL, never on emptiness** — and `concat_ws` skips NULL
    but *not* `''`.
  - **The recurring pseudocode-pasted-literally failure recurred** (Nth
    instance; see `blocker.sql`, `posts_feed`, `friends.sql`, Concept 1's
    `create index ...`): the first submitted draft was the review sketch
    verbatim, including `<label built from ...>` (a syntax error) and
    `raise exception '...'` — the latter being the dangerous one, since it
    parses fine and would have shipped a literal three-dot error message to
    clients. Tell to watch for: **any line containing `...` or
    `<angle brackets>` was shape, not text.**
  - **Verified DB-level via REST, 7/7**
    (`scratchpad/verify_resolve_region.py`, signed in as dummy1probe):
    Sydney → `AU`/`AU-NSW`/`"New South Wales, Australia"`; Denver →
    `US`/`US-CO`/`"Colorado, United States of America"`; mid-Pacific
    `(-150, 0)` → `[]`; London → `GB`/`null`/`"United Kingdom"` and Paris →
    `FR`/`null`/`"France"` (both exercise the null-state branch, proving
    `concat_ws` doesn't emit a leading `", "`, and Paris re-confirms Concept
    1's `ISO_A2_EH` fix); anon-key call → `403` `28000`; and lat/lng passed
    **swapped** → `[]`. Live definition read back out of `pg_proc`
    (`prosecdef = false`, `provolatile = 's'`) rather than trusting
    `db push`, per Concept 1's lesson that "applied" is not proof.
  - **Correction to a claim Claude made during this review: the
    `revoke execute ... from public` line does *not* restrict `anon`.**
    Verified via `has_function_privilege`: after the revoke, `anon` still
    holds EXECUTE. Supabase's project bootstrap sets
    `alter default privileges in schema public grant execute on functions to
    anon, authenticated, service_role` — an **explicit grant to a role**,
    which a revoke from `PUBLIC` does not touch. So the `auth.uid()` guard is
    not defence-in-depth, it is the **only** layer stopping an anon caller
    (which is what the `403 28000` result proves — a permission error would
    have looked different). Same is true of `friend_count` and the two
    friends RPCs. This is the *third* instance of the same lesson in this
    project: **grants in migrations document intent; they are not the
    enforcement layer** (see the Phase 4.7 table-grant finding and Concept
    1's `pg_policy` role-scope finding). A follow-up migration adding
    `revoke execute ... from anon` across all four RPCs would make the
    privilege layer real — **not done, offered and deferred**.
  - **Accepted trade-off (user's explicit call, 2026-08-03): the 9-country
    admin-1 coverage stays as-is.** Full global state coverage would mean
    reseeding from Natural Earth **1:10m** admin-1 (~4,600 features, full
    world, `iso_3166_2` field present) — same Concept 1 pipeline, a pure data
    swap with no change to `resolve_region` — with `ogr2ogr -simplify` to keep
    the dump size sane, since containment accuracy only matters to within a
    few hundred metres of a border. Offered with a measure-first plan
    (feature count + dump size at several tolerances before committing);
    user declined for now. **Consequence to remember: for ~168 of 177
    countries the state tier never matches and the state→country→most-liked
    fallback goes straight to country.** AU *is* covered, so every current
    test account resolves a state.
  - **Client-side region resolution was considered and rejected** in the same
    discussion (user asked whether the device could be trusted to report its
    own country). Trust was never the blocker — the Phase 5 kickoff already
    accepted region as a client-trusted column, same tier as `rating`. The
    blockers are: (1) `Location.reverseGeocodeAsync` delegates to the
    *platform* geocoder (Apple's vs Android's), which return different display
    strings for the same place, so an equality filter on `region_state_code`
    would **silently partition the userbase into per-platform cohorts that
    can't see each other's feeds** — a far worse failure than sparse coverage,
    and invisible without cross-platform testing; (2) reverse geocoding is
    unsupported on web, and `app.json` ships `"output": "single"`;
    (3) `expo-localization`'s `regionCode` is the device's *configured*
    region, not its location, and is country-only. `region_boundaries`'
    single canonical ISO 3166-2 vocabulary is precisely what makes the
    region filter a simple equality. **Keep these two axes separate when this
    recurs: "can we trust the client?" and "should the client compute it?"
    are different questions with different answers here.**
  - **Emergent property worth exploiting in Concept 4**: `state_code` comes
    back country-prefixed (`AU-NSW`, `US-CO`, ISO 3166-2), so state codes are
    globally unique on their own — the Explore region filter can match
    `region_state_code` alone, with no compound `country_code` match needed.
  - **Concept 2 is complete.**

- **Concept 3 (the once-per-session client hook) built + verified on web *and*
  native 2026-08-03.** `types/region.ts` (`Region` + a `RegionResult`
  discriminated union) and `hooks/useSessionRegion.ts`, written by the user
  under guide+review. New dependency **`expo-location` `~19.0.8`**, added via
  `npx expo install` (not `npm install` — `expo install` consults Expo's SDK
  compatibility table and writes tilde ranges). Chosen because it is the only
  option that works on iOS, Android **and web** (it wraps
  `navigator.geolocation` there, which matters given `app.json`'s
  `"output": "single"`) and runs in **Expo Go**, preserving the no-custom-dev-
  client constraint standing since Phase 2. Only its `reverseGeocodeAsync` is
  the API rejected in Concept 2's discussion; `getCurrentPositionAsync` is not.
  - **Call site: LAZY, a deliberate deviation from the recorded Phase 5 plan.**
    The plan said resolve at the `useEnsureTimezone` trigger point
    (`app/(tabs)/_layout.tsx`), which would throw an OS location prompt the
    instant a user signs in — the worst possible moment, since iOS's prompt is
    one-shot and a reflexive "Don't Allow" is effectively permanent. Instead
    the consumers (compose in Concept 4, the Explore proximity toggle in
    Concept 5) each call `useSessionRegion()` and TanStack dedupes. **Nothing
    calls it as of this concept** — that is expected under lazy.
  - **Lazy forced a second cache option that the layout approach would have
    hidden: `gcTime: Infinity` alongside `staleTime: Infinity`.** `staleTime`
    only stops refetching *while an observer is mounted*; TanStack v5's
    `gcTime` defaults to **5 minutes**, so with transient consumers the entry
    would be garbage-collected between compose and Explore and re-resolve
    (fresh GPS + RPC, and a fresh permission prompt on web). This is the first
    query in the repo whose consumers mount/unmount independently, which is
    why no prior hook needed `gcTime`.
  - **Permission denial returns a value, it does not throw.** TanStack retries
    failed queries 3× by default; throwing on denial would mean three
    permission checks per mount. Hence `{ status: 'unavailable', reason:
    'permission-denied' | 'no-match' }` rather than `Region | null` — the
    reason is what the UI acts on ("Enable location" is actionable, mid-ocean
    isn't), and the union gives exhaustiveness that `null` can't.
  - **Design question answered + recorded (user asked whether region should
    persist to AsyncStorage like `useHiddenPosts`): NO — decided data vs.
    derived data.** A hide is a *user decision* with no other source of truth,
    so AsyncStorage *is* its database. Region is *derived*, with a cheap
    authoritative source (device + RPC); re-deriving on next launch yields a
    **fresher** answer, not a lost one. Persisting would also convert the
    plan's *bounded* staleness ("stale until app restart") into unbounded
    ("stale forever until manually invalidated"), and would add a location
    at-rest surface to a pipeline defined by not having one. `lib/queryClient.ts`
    has no persister, so memory-only caching already delivers exactly
    "resolve once per app launch". **If cold-start latency ever justifies
    persistence, the fix is TanStack's persister on the QueryClient, not a
    bespoke AsyncStorage read in this hook.** General rule extracted: *who
    authored the fact?* User-authored → persist; machine-derived → re-derive
    (cf. `useSignedPhotoUrl` minting fresh URLs rather than caching them).
  - **Correction to a claim Claude made mid-concept, worth remembering because
    it is the opposite of the `posts_feed` case**: Supabase's type generator
    types `returns table` RPC columns as **non-null** —
    `Returns: { country_code: string; place_label: string; state_code: string }[]`
    — which is *factually wrong*, since Concept 2 proved London/Paris return
    `state_code: null`. Views generate all-nullable (the Phase 4.5 `FeedPost`
    problem); RPCs generate all-non-null. Hand-writing the boundary type is
    right both times, but for **opposite** reasons: the generator is
    under-confident about views and over-confident about functions. A comment
    on `Region` records this. The `snake_case → camelCase` mapping in the hook
    is where the wrong upstream type gets absorbed, silently and correctly
    (assigning `string` into `string | null` is legal).
  - **Bug parade, all recurring kinds**: the sketch's `queryFn` closing brace
    was left in place while the body grew beneath it, so the GPS/RPC/return
    statements ended up as bare statements inside the `useQuery({...})` object
    literal (same family as Phase 4's `ScrollView` prop incident — *an edit
    that should have extended a block instead terminated it*); both `reason`
    values written as free text (`'Location permission not granted'`,
    `'no match'`) instead of the union's literals; `region` returned but never
    constructed; `getCurrentPositionAsync({Location.Accuracy.Lowest})` missing
    its `accuracy:` key; and `placelabel` (lowercase L) in `types/region.ts` —
    **the one bug `tsc` could not catch**, since it was internally consistent.
    Claude applied the fixes at user request after the review.
  - **Verified on web (all four cases) then native**: granted → `New South
    Wales, Australia — AU / AU-NSW`; denied → `unavailable: permission-denied`
    with the dialog appearing once (no retry storm); cached → tab away/back
    with no second prompt and no second RPC; and both platforms. Done via a
    **temporary probe** rendered at the top of `app/(tabs)/explore.tsx`, since
    under lazy there is no real call site until Concept 4 — probe removed
    afterwards, `explore.tsx` confirmed byte-identical to its committed state.
    The probe had to sit *above* the feed's early returns because the Explore
    feed is currently empty (checked via REST: dummy1probe can see 3 posts,
    all their own, everything else aged past 36h) — **this app's test data
    expires, so any cross-user verification needs fresh posts first.**

- **Pre-existing native breakage found and fixed 2026-08-03 while verifying
  Concept 3 — unrelated to Phase 5, and it had been broken silently for
  weeks.** Expo Go on device failed to load at all with
  `Syntax Error: private properties are not supported` at bundle parse time.
  Root cause: `package.json` declared **`"babel-preset-expo": "^57.0.1"`** —
  three majors ahead of Expo SDK 54, which expects `~54.0.10`. That preset
  decides what modern syntax gets down-levelled; v57 targets SDK 57's newer
  Hermes and stops transpiling `#private` class fields, so they reached
  SDK 54's older Hermes intact.
  - **Why nobody noticed**: web runs in the browser engine, which supports
    private fields natively. Every verification pass since Phase 4 (Playwright,
    `npm run web`, REST) went straight past a broken native bundle. The last
    commit touching `package.json` was Phase 3 (`6ddb8ea`); the Phase 4 build
    log already flagged an `npm install` that rewrote `package-lock.json` with
    ~300 lines of unrelated bumps. **Lesson: the "verify against the DB, not
    through the app" discipline is right for SQL but has a blind spot — an
    entire runtime platform can rot unobserved. Re-test on device after any
    dependency change.**
  - **Fixed with `npx expo install --fix` then `npx expo start -c`** (the `-c`
    is mandatory — Metro caches *transformed output*, so a corrected preset
    still serves the broken bundle otherwise). Net:
    `expo ~54.0.34→~54.0.36`, `babel-preset-expo ^57.0.1→~54.0.10`,
    `eslint-config-expo ^56.0.4→~10.0.0`.
  - **Root cause of the root cause: a caret range on an SDK-coupled package.**
    `^57.0.1` lets npm resolve anything in the 57 line. `npx expo install`
    writes tilde ranges precisely because these packages are pinned to an SDK
    — which is why the new `expo-location ~19.0.8` line is correct.
  - **The `eslint-config-expo` realignment then surfaced a hard lint error in
    a file nobody had touched**: `components/useClientOnlyValue.web.ts` carried
    `// eslint-disable-next-line react-hooks/set-state-in-effect`, a rule that
    only exists in the React-Compiler-era `eslint-plugin-react-hooks` v6 that
    `eslint-config-expo@56` pulled in. **ESLint errors on a disable comment
    naming a rule it cannot find — the suppression itself became the failure**,
    and would have blocked the Husky gate. Removed; the `setState`-in-effect
    there is deliberate SSR hydration detection and nothing flags it under the
    correct config. Worth remembering: *a disable comment is itself
    lint-checked, so suppressions are a hidden coupling to a plugin version.*
  - Committed separately as a `chore:` from Concept 3's `feat:` — the drift
    predates Phase 5 and would break native for anyone cloning the repo, so a
    future bisect for "when did native break" should not land on a
    region-resolution commit.

- **Concept 3 is complete.** Next: Concept 4 — the write path (tag new posts
  with the cached region at compose time) plus surfacing the location when
  viewing a post. This is where `useSessionRegion` gets its first real call
  site. Still unguarded and worth handling there: passing lat/lng swapped
  returns `[]` rather than an error, indistinguishable from mid-ocean, because
  SRID 4326 is metadata and `ST_Point` validates nothing.
