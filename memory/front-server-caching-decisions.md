---
name: front-server-caching-decisions
description: Decisions for the not-yet-built Phase 5.5 front server + Redis caching layer, and the reconciliation of a stale architecture handoff
metadata:
  type: project
---

A separate session produced `architecture-decisions-handoff.md` (a front server
+ Redis caching design). Reconciled against the real codebase on 2026-07-25 —
most of it was written against a generic ephemeral-social-app model and
contradicted the actual schema. Sound parts folded into `memory/CLAUDE.md`
(new "Server & caching principles" section + Phase 5.5 row) and
`docs/database-architecture.md` (§9 "Handoff reconciliation"); the handoff doc
itself can be retired.

**Front server + Redis is Phase 5.5 (after Phase 5), not built yet** — user's
call. Sequenced after Phase 5 deliberately: it would cache region/most-liked
feed endpoints that don't exist until Phase 5, and Phase 4.5 anonymity changes
what a cached row may contain.

**The one hard design decision — shared cache vs per-user RLS — resolved
2026-07-25.** A truly shared `feed:{region}` blob must be *identical for every
viewer* to stay cacheable, so the three per-viewer transforms are split by where
they can safely run (a `security definer` RPC produces the superset; never
`service_role` for user-facing requests; auth stays Supabase's, JWT forwarded
unmodified, RLS the real boundary; server stays **stateless**):
- **Anonymity → in the RPC, before the row leaves Postgres.** Nulls
  `user_id`/author/`photo_url` for `is_anonymous` posts *unconditionally* (a
  shared blob can't branch on `auth.uid()`), so an anonymous author's identity
  never reaches Redis, the server, or the client. The base `posts` row keeps
  `user_id` — moderation reads it with elevated privilege. Personal per-viewer
  queries (friends, detail) strip *conditionally*
  (`is_anonymous and user_id <> auth.uid()`) so the author still sees their own.
- **Self-exclusion → client-side** (cosmetic): client drops
  `post.user_id === myId`.
- **Block-filter → client-side, accepted with a residual:** client drops
  `myBlockedIds.has(post.user_id)`. Safe *because* feed posts are already public
  AND blocking stays RLS-enforced on every path that matters (detail, comments,
  likes, Storage photos). Residual: a blocker inspecting the raw feed payload
  can see a blocked user's already-public, non-anonymous post text. Low harm,
  deliberate.
- Net: both client filters are no-ops on anonymous posts (`user_id` null), and
  the **front server does zero per-viewer work on feeds** — a dumb Redis proxy
  handing one identical blob to everyone. (This supersedes the earlier sketch
  of server-side per-request personalization.)

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

**How to apply:** when Phase 5.5 starts, build the shared-cache RPC per the
resolution above and fold the finalized caching rules from `memory/CLAUDE.md`
into `docs/database-architecture.md` as the settled reference. Handoff Open Q#3
("most popular" scope global-vs-region + decay) stays genuinely open until
Phase 5.
