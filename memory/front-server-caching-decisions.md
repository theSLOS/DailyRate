---
name: front-server-caching-decisions
description: Decisions for the Phase 5.5 front server + Redis caching layer (Concept 1 server skeleton built; caching/gateway/rate-limit design resolved, not yet built)
metadata:
  type: project
---

Reconciled against a stale separate-session handoff doc on 2026-07-25 (sound
parts folded into this file, `memory/CLAUDE.md`, and
`docs/database-architecture.md` §9; the handoff doc itself was retired).

**Front server + Redis is Phase 5.5, sequenced after Phase 5** — it caches
region/most-liked feed endpoints that don't exist until Phase 5, and Phase 4.5
anonymity changes what a cached row may contain. Concept 1 (server skeleton +
JWT-forwarding) is built as of 2026-08-08; the caching/gateway/rate-limit
decisions below are resolved but not yet built.

**The one hard design decision — shared cache vs per-user RLS — resolved
2026-07-25.** A truly shared `feed:{region}` blob must be *identical for every
viewer* to stay cacheable. Anonymity strips happen in a `security definer` RPC
before the row leaves Postgres (the only place safe from `auth.uid()`);
self-exclusion and the block-filter both happen client-side, safe because feed
posts are already public and blocking stays RLS-enforced everywhere it
actually matters (detail, comments, likes, Storage photos). Net effect: the
front server does zero per-viewer work on feeds — a dumb Redis proxy handing
one identical blob to everyone. Full reasoning, rejected alternatives, and the
accepted block-filter residual: see `docs/feed-and-caching-architecture.md`
§3-4.

**Handoff claims that were factually wrong about this codebase (don't
re-derive):** no `ratings` table (it's `posts`); no `expires_at` column and
posts are never deleted on expiry (ephemerality is the computed 36h RLS window,
so no reply cascade / no `expires_at`-tied cache invalidation); no rate-limit
trigger (the only write throttle is `unique(user_id, local_date)` + the entry
window — a per-minute limiter was dropped as wrong for a once-daily journal); no
friends feed (a spec stretch idea, not a table); region feed + "most popular"
are unbuilt Phase 5 endpoints. Two "open questions" were already decided in
code: storage is private + signed URLs (not public), and blocking is already
enforced in RLS.

**Cheap hedges taken now** (2026-07-25, migration
`20260725141645_add_profiles_tier_and_posts_index.sql`): `profiles.tier text
not null default 'free'` (paywall insurance, kept out of `profiles_public` so it
stays private) and index `posts_user_id_created_at_idx on posts (user_id,
created_at desc)` (marginal help for `user_id`-scoped scans — NOT tied to any
rate-limit trigger).

**Why:** captured so the front-server phase isn't designed against the stale
handoff, and so the shared-cache/RLS tension is resolved deliberately rather
than hand-waved as "filter blocking after the fetch." See
`[[anonymity-and-proximity-decisions]]` (anonymity is a prerequisite that
shapes what a cache contains) and `[[project-phase-status]]`.

**Full reasoning is written up in `docs/feed-and-caching-architecture.md`** (the
human-readable *why* — architecture, the strip-at-DB decision + rejected
alternatives, the performance analysis, moderation of anon posts, friends feed).
That doc is the settled reference for this subsystem's design rationale; this
memory is the condensed build-log pointer.

**Concept 1 kickoff decisions, resolved 2026-08-08:** logging via **pino**
(structured JSON, per-request child loggers); `server/package.json` uses
**ESM** (`"type": "module"`); local dev runner is **`tsx watch`**. All three
picked as the modern-default option with no strong counter-argument raised.
Full concept sequence for Phase 5.5 lives in the approved plan
(`C:\Users\user\.claude\plans\yep-we-can-keep-composed-eich.md`) — 11
concepts, DB/API-verify before app-wiring at each step, full gateway scope.

**How to apply:** build the shared-cache RPC per the resolution above and fold
the finalized caching rules from `memory/CLAUDE.md` into
`docs/database-architecture.md` as the settled reference once built. Handoff
Open Q#3 ("most popular" scope global-vs-region + decay) is still genuinely
open — see `docs/feed-and-caching-architecture.md` §11.

**Gateway scope, resolved 2026-08-08 (not built yet — decision only), supersedes
the earlier "most writes bypass the server" framing:** the front server becomes
a **full API gateway** — every read and every write goes through it. The client
talks to Supabase directly for **nothing except auth** (sign-in/sign-up,
session/token refresh — still handled by `supabase-js` on the client, since
that's what produces the JWT the front server then forwards on). Every other
hook (`useTodayPost`, `usePostHistory`, `usePost`, `useLikes`, `useComments`,
`useBlocks`, `useReports`, `useFriends`, `useFriendsFeed`, `useSessionRegion`'s
`resolve_region` call, photo upload + signed-URL fetch) moves from calling
`supabase.from(...)`/`supabase.rpc(...)` directly to calling a front-server REST
endpoint instead.
- **Chosen deliberately despite RLS already being the real security
  boundary** (proven in Phase 4.7 — grants don't restrict anything, RLS alone
  does) — this is not a security upgrade. The reasons are a single choke point
  for structured logging on every mutation, insulating the client bundle from
  Supabase's schema/RPC shape so it can change without a client release, and
  one place to add business logic later without touching RLS.
- **Caching stays scoped exactly as already resolved above — this doesn't
  widen it.** Only shared/identical-for-everyone reads (region/newest/
  most-liked feeds) get cached in Redis. Personal reads (own history, today's
  post, friends feed, post detail, likes/comments status) route through the
  server too now, but purely as a passthrough — no Redis involved, same as if
  the client called Supabase directly, just with a hop in between.
- **Storage (photo upload + signed URL), resolved 2026-08-08: signed URLs
  only, the server never touches image bytes.** The front server's job is
  purely authorization, not transport:
  - **Upload**: client → `POST /api/photos/upload-url` (JWT forwarded) →
    server calls Storage's `createSignedUploadUrl(path)` (respects the
    bucket-wide authenticated-insert policy from Phase 4.5) → returns
    `{ path, uploadUrl }` → client `PUT`s the raw bytes directly to
    `uploadUrl` (a one-time, time-boxed link the server authorized — the
    client never holds Supabase credentials/SDK trust to do this itself) →
    client then sends `path` as `photo_url` in the post create/update call,
    which goes through the front server per the write-gateway decision.
  - **Read**: client → `GET /api/photos/:path/url` → server calls
    `createSignedUrl(path)` (same visibility chain as the Phase 4.5 cross-user
    fix — post's own RLS + block exclusion, forwarded JWT) → returns the URL
    → client's `<Image>` fetches bytes directly from that link.
  - **Rejected alternative**: proxying the actual bytes through the server on
    both paths. Would make Explore — a polling, scrolling photo feed — hammer
    the app server's own bandwidth for something Supabase's storage CDN
    already serves efficiently, for zero additional security (RLS enforces
    identically either way). Pre-signed URLs are the pattern Supabase/S3-style
    storage is designed around specifically to avoid this.
- **Real cost, stated plainly so it isn't discovered mid-build**: every
  Supabase-calling hook in the codebase gets rewritten, and every mutation
  needs a matching front-server endpoint kept in sync with the schema going
  forward. This is the single biggest scope increase in the project so far —
  when Phase 5.5 starts, it needs its own concept breakdown (e.g. bare server +
  auth passthrough → shared-feed caching → personal-read proxying → write
  proxying + rate limiting → Storage), not one sitting, per the project's
  existing one-concept-at-a-time discipline.

**Rate limiting scope, resolved 2026-08-08 (not built yet — decision only):**
the front server is no longer purely a read/cache proxy — it also proxies a
small, named set of writes specifically so it can rate-limit them: **comment
creation** (spec §1.6 asks for "basic rate limiting to deter spam"), **report
submission**, and **photo upload** (Phase 4.5 flagged bucket-wide storage
abuse as an accepted, unfixed residual). Every other mutation (posts, likes,
blocks, friend requests) keeps going straight from the client to Supabase,
governed by RLS as today — this is a narrow carve-out, not a general
"all writes go through the server" rule.
- **Explicitly excluded: post creation/edit.** Already has a natural throttle
  (`unique(user_id, local_date)` + the entry window) — a per-minute limiter
  was already rejected once for not fitting a once-daily journal; don't
  reintroduce one here.
- **Mechanism**: Redis counter per `(user_id, action)`, e.g.
  `ratelimit:comment:{user_id}`, `INCR` + `EXPIRE` on a fixed window (or a
  sorted-set sliding window if bursts at the window edge turn out to matter).
  Over-limit → `429` in the already-decided `{ error: { code, message } }`
  shape; under-limit → the server forwards the mutation to Supabase with the
  user's JWT unmodified, same as every other proxied call.
- **Keyed by authenticated `user_id`, not IP** — every rate-limited action
  already requires auth, and IP is unreliable (NAT, shared connections) as
  well as being the wrong dimension for "is this one account spamming."
- **Actual thresholds (comments/min, reports/hour, uploads/day, etc.) are
  deliberately not decided yet** — this resolves *where* rate limiting lives
  and *how* it's implemented, not the numbers. Pick those at Phase 5.5 build
  time, informed by real usage if any exists by then.

**Feed personalization ceiling, resolved 2026-08-10 (decision only):** shared
feeds (Explore / region / most-liked) stay **non-personalized permanently**.
This is what makes the identical-blob rule above a standing guarantee rather
than a convenience — the cache is `O(regions)` entries, not `O(users)`, and the
front server keeps doing zero per-viewer work on feeds. The **friends feed is
exempt** and may be personalized freely: it was already classified as personal
under the caching governing rule, lives in the client-side TanStack Query
cache, and never enters Redis.
- **Context: this resolves an ML question, not a caching one.** Raised while
  considering rewriting the front server in Python for future ML. The rewrite
  was rejected (see below), but it surfaced that "ML-ranked feeds" splits into
  two very different things, and only one of them is compatible with the
  cache design.
- **Any future ML ranking on a shared feed must be offline/batch-scored into a
  Postgres column** that the feed RPC orders by — never computed per-request.
  A global quality/interestingness score or moderation flag works fine this
  way and needs no request-path inference at all. Per-viewer re-ranking is the
  thing that's excluded, because it destroys the shared blob outright.
- **Modelling constraint that falls out of the anonymity design**: the
  `security definer` RPC nulls `user_id` on anonymous posts *before the row
  leaves Postgres*, so anything ranking downstream of it — server, Redis,
  client — cannot use author identity as a feature on those posts. Any
  author-derived signal has to be computed inside Postgres, upstream of the
  stripping.
- **Rejected: rewriting the front server in Python** for analytics/ML.
  Rejected because the gateway's whole job is I/O-bound proxying with no
  computation in it, so Python buys nothing on the request path, while costing
  the shared `types/database.ts` type bridge with the Expo client and moving
  the load-bearing JWT-forwarding pattern onto the much less mature
  `supabase-py`. When ML does arrive (post-deployment, user's stated timing),
  the shape is a **separate Python inference service the Node gateway calls**,
  not a Python gateway. Offline analytics likewise belongs beside the app
  (a Python workspace reading Postgres directly), not inside the request path.
