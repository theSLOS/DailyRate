# Daily Rating Social App — Full Project Specification

A planning document covering the complete feature set, system components, recommended tech stack (with reasoning and alternatives), and a phased build roadmap.

> **Working title:** *DayRate* (placeholder — rename as you like)

---

## 0. Concept Summary

A social app built around a single, simple daily ritual: **once per day, each user rates their day from 1–10**, attaches a short message, and optionally a photo. Other users can browse recent days on an **Explore** feed, react with likes, and comment (including replies to comments). Posts are **ephemeral to the public** — visible to others for only 36 hours — but each user keeps a **permanent private history** of their own days.

The "one post per day" constraint is the product's core identity. It keeps the feed low-pressure and honest (closer to BeReal or a mood journal than to Instagram's infinite-content model), and it makes several technical decisions simpler. **This document assumes the one-entry-per-day model throughout.** If you instead want multiple posts per day, flag it — it changes the data model (drops a uniqueness constraint) and the "your history" UX (a day becomes a list, not a single card).

### What makes it distinct
- **Low-pressure cadence:** one entry a day caps the firehose.
- **Ephemerality:** the public feed always feels fresh; nothing lingers or accumulates social debt.
- **Private permanence:** your own ratings build into a personal mood/quality-of-life timeline you can look back on.
- **Local discovery:** the proximity filter turns "how's everyone's day going" into something tied to your actual area.

---

## 1. Feature Specification

### 1.1 Accounts & Profiles
- **Sign up / sign in:** email + password at minimum; ideally social login (Apple, Google) since Apple sign-in is effectively required if you ship a native iOS app that has any other social login.
- **Profile:** username (unique), display name, avatar, optional bio.
- **Account settings:** change email/password, manage notifications, manage location-sharing, delete account (and all associated data — important for app-store compliance and privacy law).
- **Onboarding:** explain the one-per-day model and ask for location + notification permissions *with context* (don't cold-prompt the OS dialog).

### 1.2 The Daily Entry (core posting loop)
- **Rating:** integer 1–10 (decide up front: integer only, no half-points — keeps sorting and display trivial).
- **Message:** short text, hard character cap (e.g. 280). Caps keep cards uniform and the feed scannable.
- **Photo (optional):** one image per entry. Captured or chosen from library; compressed client-side before upload.
- **One entry per day:** enforced per user per *local* calendar day. Once today's entry exists, the compose screen switches to "edit today's entry" mode rather than "create new."
  - **Edit window:** decide whether today's entry is editable all day, or locked after posting. Recommendation: editable until end of the user's local day, then locked. (Locking preserves the "honest snapshot" feeling.)
- **Timezone handling:** "their day" is defined by the user's device-local date at post time. Store both the local date (for the one-per-day rule and history grouping) and the UTC timestamp (for the 36-hour window and ordering).
- **`local_date` integrity:** the client sends `local_date` but the server must validate it — a malicious client could send yesterday's date to overwrite an existing post, or a future date to bank an entry. A DB trigger or Edge Function should assert that `local_date` is within ±1 calendar day of `created_at` accounting for the user's UTC offset before the row is committed.

### 1.3 Explore Feed
- Scrollable feed of **other people's** recent days: shows rating, message, photo, author, like count, comment count, and a coarse distance/age indicator.
- **Excludes:** your own entries, blocked users, and users who blocked you.
- **Two sort/filter modes** (see 1.5).
- **Infinite scroll** via cursor pagination (not offset — offset breaks as new posts arrive).
- **Tap a card** → detail view with full photo, full comment thread, like button.

### 1.4 Ephemerality (the 36-hour rule)
- A post is visible on the Explore feed (and to anyone other than its author) for **36 hours after creation**. After that it disappears from public view but is **not deleted** — it remains in the author's private history forever.
- Implementation is a **visibility filter, not a deletion job:** the post row persists; public queries simply require `created_at > now() - 36h`. This is enforced at the database layer (row-level security) so the rule can't be bypassed by a malicious client.
- **Photo URL exposure:** RLS blocks the database row but the photo file in Storage remains accessible to anyone with the URL. Storage policies must mirror the same 36h window — either via a Supabase Storage policy that checks `created_at`, or by serving photos through short-lived signed URLs generated at read time rather than storing permanent public URLs.
- Comments/likes on an expired post also drop out of public view with it (they live on the post).
- **Edge decision:** what happens to a comment thread mid-conversation when a post expires? Simplest answer: it freezes and vanishes from public view; the author still sees it in history. Document this so it's intentional, not a surprise bug.

### 1.5 Filtering & Sorting
The feed offers two modes over the same 36-hour candidate set:
- **Proximity:** entries near the user, nearest first, within a chosen radius. Requires the viewer's current (or last-known) location.
- **Most liked (today):** entries ordered by like count, highest first, over the active window.
- **Sensible default:** "Most liked" for users who deny location; "Proximity" once location is granted. Always provide a manual toggle.

### 1.6 Engagement
- **Likes:** one like per user per post; toggle on/off; like count shown. (Optionally likes on comments — treat as a stretch feature.)
- **Comments:** users comment on a day.
- **Replies (comments on comments):** threaded replies. **Recommendation: cap nesting at 2 levels** (a top-level comment plus replies to it), like Instagram/YouTube. Arbitrary infinite nesting is far more work (recursive queries, runaway indentation UI) for little user benefit. Replies-to-replies attach to the same top-level comment.
- **Comment caps:** character limit, basic rate limiting to deter spam.

### 1.7 Personal History
- A dedicated "Your days" view: a reverse-chronological list / calendar of all the user's past entries, ignoring the 36-hour rule.
- **Rating trend visualization:** a simple line/bar chart of rating over time (week / month / all-time). This is a genuinely compelling retention feature — it turns the app into a personal mood tracker, and it's cheap to build since you already have the data.
- Streaks (consecutive days posted) are an optional engagement hook.

### 1.8 Notifications (push)
- New like on your day, new comment on your day, new reply to your comment.
- A daily "rate your day" reminder (user-configurable time). **Timezone note:** reminders must fire at the user's local time, not UTC. Store the user's preferred `reminder_time` (local HH:MM) and IANA `timezone` on their profile (see data model). The Edge Function scheduler must convert `reminder_time AT TIME ZONE timezone` to UTC at dispatch time. This is non-trivial — account for it in Phase 6 scope.
- All notification types individually toggleable in settings (stored in `notification_preferences` JSONB on the profile).

### 1.9 Trust, Safety & Privacy
This is **not optional** for a public app with user photos and location. Treat it as a first-class feature area.
- **Reporting:** report a post or comment with a reason.
- **Blocking:** block a user (removes their content from your feed and yours from theirs).
- **Moderation queue:** an admin view to review reports and remove content / suspend users.
- **Image moderation:** automated scanning of uploaded photos for nudity/violence/illegal content via a moderation API (e.g. Google Vision SafeSearch, AWS Rekognition, or Hive) before a photo goes public. Can be deferred past MVP but should be in before any real public launch.
- **Location privacy (critical):** never expose exact coordinates to other users. Store location at reduced precision: **round both lat and lng to 2 decimal places before writing to the DB** (~1.1 km precision at the equator — precise enough for neighbourhood labels, coarse enough to be untraceable to a home). Show others only a distance bucket or a neighbourhood-level label — never a pin. Apply this coarsening server-side (in an Edge Function or trigger) so a client can't bypass it by sending full-precision coordinates. Make location sharing opt-in and easy to turn off per-post.
- **Account deletion:** full data erasure on request.

---

## 2. System Components & Architecture

At a high level: **cross-platform client apps** talk to a **managed backend** (database + auth + file storage + serverless functions + realtime), with a few **external services** for media optimization, geocoding, push, and moderation.

```
┌─────────────────────────────────────────────┐
│  Clients: iOS · Android · Web (one codebase) │
└───────────────┬─────────────────────────────┘
                │ HTTPS / Realtime
┌───────────────▼─────────────────────────────┐
│  Backend platform (Supabase)                 │
│  • Auth (email + Apple/Google)               │
│  • Postgres + PostGIS (data + geo queries)   │
│  • Row-Level Security (36h + ownership rules) │
│  • Storage (photos)                          │
│  • Edge Functions (moderation, push, jobs)   │
│  • Realtime (live comments/likes)            │
└───────┬───────────────┬──────────────┬───────┘
        │               │              │
   ┌────▼───┐      ┌─────▼─────┐   ┌────▼─────────┐
   │ Push   │      │ Image     │   │ Moderation   │
   │ (Expo) │      │ transform │   │ API          │
   └────────┘      └───────────┘   └──────────────┘
```

### 2.1 Client application
One **Expo (React Native)** codebase compiling to **iOS, Android, and web**. Responsibilities: compose screen, feed, detail/thread view, history + charts, settings, capturing location and photos, client-side image compression, and handling push tokens.

### 2.2 Backend platform
A managed backend-as-a-service (Supabase) provides Postgres, auth, storage, serverless functions, and realtime in one place, so you're not standing up servers. The database is the heart of the system and where most of the interesting logic lives.

### 2.3 Data model
Core tables (Postgres). Types are indicative.

**`profiles`** — one row per user (id = auth user id)
| field | type | notes |
|---|---|---|
| id | uuid (PK) | = auth.uid() |
| username | text unique | |
| display_name | text | |
| avatar_url | text | |
| bio | text | |
| role | text default 'user' | `'user' \| 'admin'`; controls access to moderation queue |
| is_suspended | bool default false | set by admins; RLS blocks suspended users from posting |
| notification_preferences | jsonb | per-type toggle map, e.g. `{"likes":true,"comments":true,"daily_reminder":true}` |
| reminder_time | time | user's preferred local time for daily reminder |
| timezone | text | IANA timezone (e.g. `"Australia/Melbourne"`); used to schedule the reminder in the user's local time |
| created_at | timestamptz | |

**`posts`** — one row per user per local day
| field | type | notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK→profiles) | |
| local_date | date | user's local calendar day |
| rating | smallint | 1–10, checked |
| message | text | length-capped |
| photo_url | text | nullable |
| photo_thumb_url | text | nullable |
| location | geography(Point,4326) | nullable, **coarsened to ~1.1 km** |
| place_label | text | e.g. "Fitzroy, VIC" |
| like_count | int default 0 | denormalized counter |
| comment_count | int default 0 | denormalized counter |
| moderation_status | text default 'approved' | `'pending' \| 'approved' \| 'rejected'`; photos start as `'pending'` until the moderation API clears them |
| created_at | timestamptz | drives the 36h window |
| **unique (user_id, local_date)** | | enforces one-per-day |

**`likes`**
| id | post_id (FK) | user_id (FK) | created_at | **unique(post_id,user_id)** |

**`comments`**
| id | post_id (FK) | user_id (FK) | parent_comment_id (FK, nullable) | body | created_at |

**`blocks`** — `blocker_id`, `blocked_id`, `created_at`
**`reports`** — `reporter_id`, `target_type` (post/comment), `target_id`, `reason`, `status`, `reviewed_by` (uuid FK→profiles, nullable), `reviewed_at` (timestamptz, nullable), `created_at`
**`devices`** — `user_id`, `expo_push_token`, `platform` (for notifications)

**Indexes that matter:** GiST index on `posts.location` (proximity), composite index on `(created_at)` and on `(like_count desc)` filtered to the live window, index on `comments.post_id`, on `likes.post_id`.

### 2.4 Key query/logic designs

**The 36-hour rule — enforced in Row-Level Security**, so the client can't cheat:
```sql
-- SELECT: owner sees all; others only see live, moderation-approved posts.
USING (
  user_id = auth.uid()
  OR (
    created_at > now() - interval '36 hours'
    AND moderation_status = 'approved'
  )
)

-- UPDATE: owner may only edit while local_date is still today in their timezone.
-- The client sends the IANA timezone; the server evaluates it.
USING (
  user_id = auth.uid()
  AND local_date = (now() AT TIME ZONE <user_timezone>)::date
)

-- INSERT: users may only insert rows for themselves and only if not suspended.
WITH CHECK (
  user_id = auth.uid()
  AND NOT (SELECT is_suspended FROM profiles WHERE id = auth.uid())
)
```
Your private history query (`where user_id = me`) is unaffected; the public feed automatically only ever returns live posts.

**Proximity (PostGIS):**
```sql
SELECT *, ST_Distance(location, :me) AS dist
FROM posts
WHERE created_at > now() - interval '36 hours'
  AND ST_DWithin(location, :me, :radius_metres)
  AND user_id <> :me
ORDER BY dist
LIMIT :page_size;   -- keyset paginate on (dist, id)
```
This is the single strongest reason to choose Postgres/PostGIS over Firestore — it does geo-radius queries natively and fast. (Firestore has no native geo radius; you'd bolt on geohashing.)

> **Proximity pagination note:** `dist` is relative to the user's location at query time. If the user moves while scrolling, page 2's distances will be inconsistent with page 1's. Fix: snapshot the user's location once at the start of a scroll session and pass it as a constant parameter for all subsequent pages. Do not re-read device location mid-scroll.

**Most-liked today:** order the windowed set by `like_count desc`. Keeping `like_count` denormalized on the post (updated by a trigger on `likes` insert/delete) avoids a `COUNT(*)` per row on every feed load.

**Counters:** database triggers keep `like_count` and `comment_count` in sync atomically — no client-side counting, no drift.

**Nested comments:** `parent_comment_id` is null for top-level comments and points at the parent for replies. Cap at 2 levels in the UI; load a post's whole thread in one query and assemble the tree client-side.

**Pagination:** keyset/cursor everywhere (carry the last row's sort key), never `OFFSET`.

### 2.5 Media pipeline
1. User picks/captures a photo.
2. Client **compresses and resizes** before upload (saves bandwidth and storage).
3. Upload to object storage; store the returned URL on the post.
4. Generate a **thumbnail** for feed cards (on-the-fly image transformation or a function-generated thumb) so the scrolling feed loads small images and the detail view loads the full one.
5. Serve via CDN.

### 2.6 Realtime
Subscribe the post-detail screen to live comment/like inserts so threads update without a manual refresh. Realtime on the main feed is optional and can be noisy — a pull-to-refresh is fine for v1.

> **Built as (Phase 4, 2026-07-21):** scoped down to 7s polling + pull-to-refresh, **not** Supabase Realtime/WebSockets — a once-a-day mood journal doesn't need live sockets. See `memory/project-phase-status.md`.

### 2.7 Background jobs / functions
Serverless (Edge) functions for: sending push notifications on like/comment/reply events, running uploaded images through the moderation API, and the daily reminder dispatch. No always-on server to maintain.

> **Update (Phase 5.5):** an always-on front server (Node/Express) + Redis *is* now planned as a caching layer for shared feed endpoints — additive to, not replacing, the Edge functions above. See the caching principles in `memory/CLAUDE.md`. (Note: likes, comments/replies, and blocking — in-scope Phase 4 features here, e.g. §5 line "users can like, comment, and reply…" — are all built as of 2026-07-21; they were never "out of scope.")

---

## 3. Recommended Tech Stack

| Layer | Recommendation | Why |
|---|---|---|
| **Client framework** | **Expo (React Native + React Native Web)** | One codebase → iOS, Android, **and** web. You already know React. Crucially, **EAS Build compiles iOS apps in the cloud, so you don't need a Mac.** |
| **Language** | TypeScript | Type safety across a growing app; pairs with your CS background. |
| **Navigation** | Expo Router | File-based routing shared across platforms. |
| **Server state** | TanStack Query (React Query) | Caching, pagination, optimistic likes/comments — perfect fit for this feed. |
| **Styling** | NativeWind (Tailwind for RN) *or* Tamagui | Consistent styling across native + web. |
| **Backend** | **Supabase** (Postgres + PostGIS, Auth, Storage, Edge Functions, Realtime, RLS) | One platform covers auth, DB, files, functions, realtime. **PostGIS makes the proximity feature first-class.** RLS enforces the 36h + ownership rules at the data layer. |
| **Geo** | PostGIS (`geography`, `ST_DWithin`, GiST index) | Native, fast radius queries. |
| **Push** | Expo Notifications + Expo Push API | Works out of the box with the Expo client; cross-platform. |
| **Charts (history)** | Victory Native / react-native-svg-charts | For the rating-over-time view. |
| **Image moderation** | Google Vision SafeSearch / AWS Rekognition / Hive | Automated photo screening before public. |
| **Geocoding (labels)** | Reverse-geocode API (e.g. Mapbox / Google) | Turn coarse coords into "Fitzroy, VIC" labels. |
| **Analytics & errors** | PostHog (product analytics) + Sentry (crash/error) | Understand usage and catch crashes early. |
| **CI/CD** | EAS Build + EAS Submit; GitHub Actions for lint/test | Cloud builds + store submission without local native toolchains. |

### 3.1 The main stack decision: Supabase vs Firebase
You have Firebase experience (the Unity card battler), so it's a fair question.

- **Firebase strengths:** you already know it; excellent realtime; generous free tier; simplest auth.
- **Firebase weakness for *this* app:** Firestore has **no native geo-radius query.** Your proximity filter is a core feature, and on Firestore you'd implement it with geohashing libraries — more code, more edge cases, awkward to combine with "order by most-liked." Aggregation/sorting by like count also needs distributed counters or extra functions.
- **Supabase fit:** Postgres + PostGIS does proximity and "most-liked-in-window" cleanly with plain SQL and indexes; RLS expresses the 36h rule declaratively. You also get a real relational model for the comment threads.

**Recommendation: Supabase**, chosen primarily because geo and the windowed sorting are central, not bolted on. If you'd rather lean on existing Firebase knowledge and are willing to do the geohashing work, Firebase is viable — just go in knowing proximity will be the hard part.

### 3.2 Cross-platform decision: Expo vs separate web + native
Expo gives you all three targets from one codebase and unblocks iOS builds without a Mac (a constraint you've hit before). The alternative — a separate Next.js web app plus a native app — gives a more polished web experience but roughly doubles the surface area. For a solo build, **single Expo codebase wins**; you can always split out a dedicated marketing/web client later.

**Known Expo web limitations to plan for:**
- Camera capture on web falls back to `<input type="file" accept="image/*">` — functional but less smooth than native.
- Some React Native libraries have no web implementation and require a web-specific fallback or stub.
- Layout and styling bugs on web are common; treat web as a secondary target and budget time for platform-conditional code.
- Push notifications via Expo do not work on the web target; daily reminders on web would require a different mechanism (e.g. Web Push API or a browser notification, which has its own permission flow).

---

## 4. Build Roadmap

Phased and MVP-first. Each phase ends with something you can actually use, so you're never building for months before seeing the loop work. Treat phase boundaries as natural commit/test points.

### Phase 0 — Foundations & setup
- Create the repo, Expo + TypeScript project, Expo Router scaffold.
- Create the Supabase project; wire up the client SDK.
- Implement **auth** (email + Apple/Google) and a minimal profile.
- Set up EAS Build; get a dev build running on a real phone and on web.
- **Done when:** you can sign in on iOS, Android, and web and see an empty home screen.

### Phase 1 — Core posting loop
- `posts` table + the **one-per-day** unique constraint + rating check.
- Compose screen: rating picker (1–10), message field with cap, photo pick/capture, client-side compression, upload to Storage.
- "Today" screen showing your current entry; switch compose → edit when today's entry exists.
- **Done when:** a user can post (or edit) exactly one rated entry per day with text and an optional photo.

### Phase 2 — Personal history
- "Your days" list/calendar reading all your own posts (no time filter).
- Rating-over-time chart (week/month/all-time).
- **Done when:** you can scroll your own past days and see your rating trend.

### Phase 3 — Explore feed (recency + the 36h rule)
- RLS policies enforcing the 36-hour public window + ownership.
- Explore feed querying live posts (excluding your own), card UI (rating, message, thumbnail, author), cursor pagination, pull-to-refresh.
- Post detail screen with the full photo.
- **Done when:** you can browse other users' live days and posts correctly vanish from the feed after 36h while remaining in their owners' history.

### Phase 4 — Engagement
- `likes` table + toggle + denormalized `like_count` via trigger; optimistic UI.
- `comments` table; top-level comments on the detail screen; `comment_count` trigger.
- Replies (2-level cap) via `parent_comment_id`.
- Realtime updates on the detail screen.
- **Blocking** (`blocks` table + two-way RLS feed exclusion) and **reporting** (`reports` table + reason submission) — these must ship alongside engagement so strangers can interact safely from day one, even in TestFlight/internal testing. The admin review UI can come later (Phase 7); the data capture must exist now.
- **Done when:** users can like, comment, and reply with live counts, and can block or report another user.

### Phase 5 — Filtering & proximity
- Capture viewer location (with permission + context); **coarsen** stored coordinates.
- PostGIS: GiST index + `ST_DWithin` proximity query.
- Feed toggle: **Proximity** vs **Most liked (today)**; sensible default based on location permission.
- Reverse-geocode to neighbourhood labels.
- **Done when:** the feed can be sorted by nearest and by most-liked, and no exact coordinates are ever exposed.

### Phase 6 — Notifications
- Store Expo push tokens; Edge Functions to send on like/comment/reply.
- Configurable daily "rate your day" reminder.
- Per-type toggles in settings.
- **Done when:** users get relevant pushes and can control them.

### Phase 7 — Trust, safety & privacy
- **Admin moderation queue:** UI to review flagged reports (blocking + reports data already exists from Phase 4); actions to remove content and suspend accounts (`is_suspended` flag on profiles).
- Image moderation API on upload (sets `moderation_status` to `'pending'` → `'approved'`/`'rejected'`).
- Location-privacy hardening review; account deletion with full data erasure.
- **Account deletion cascade decision:** when a user deletes their account, choose one of: (a) hard cascade delete — removes all their posts, likes, and comments everywhere (other users' threads lose context), or (b) soft anonymise — replace `user_id` references with a tombstone record, showing "[deleted]" in threads. **Recommendation: soft anonymise comments, hard delete posts and likes.** Implement whichever is chosen; it affects the schema and is hard to change post-launch.
- **Done when:** there's a working report→admin review→remove/suspend path, photos are screened before going public, and a user can fully delete or anonymise their data.

### Phase 8 — Polish & performance
- Empty/loading/error states, skeletons, offline handling.
- Query/index tuning on the hot feed paths; image loading perf; accessibility pass.
- Analytics (PostHog) + crash reporting (Sentry).
- **Done when:** the app feels smooth and you can see how it's being used.

### Phase 9 — Beta
- Internal/TestFlight + Play internal-testing builds.
- Recruit a small group; gather feedback; fix the top issues.
- **Done when:** a handful of real users complete the daily loop without hand-holding.

### Phase 10 — Launch & post-launch
- App Store / Play Store listings, privacy policy, store-required disclosures (location + photos + account deletion).
- Monitor errors/performance; iterate on the backlog (likes-on-comments, streaks, richer history, etc.).
- **Done when:** publicly available and monitored.

---

## 5. Key Risks & Decisions to Lock Early
1. **One entry per day vs many** — affects the data model and history UX. (Assumed: one.)
2. **Editable vs locked daily entry** — affects the "honest snapshot" feel. (Suggested: editable until end of local day.)
3. **Comment nesting depth** — infinite nesting is a real cost. (Suggested: 2 levels.)
4. **Location privacy** — coarsen on the way *in*; never expose pins. Get this right before any public users.
5. **Moderation before public launch** — reporting + blocking + image screening are launch-blockers, not nice-to-haves, for a photo+location social app.
6. **Supabase vs Firebase** — decided by the proximity requirement. (Recommended: Supabase.)

## 6. Future / Stretch Ideas
- Likes on comments.
- Streaks and gentle gamification.
- Richer history analytics (best/worst days, weekday patterns, monthly recap).
- Friends/follows layer (a more curated feed alongside Explore).
- Themed prompts or community days.
- Web share cards for a day (without compromising location privacy).

---

*This is a living document — adjust the assumptions in §0 and §5 first, since several downstream decisions hang off them.*
