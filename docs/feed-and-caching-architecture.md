# Feed, Caching & Anonymity Architecture — DayRate

The **decision-making** behind how feeds are served, cached, personalized, and
kept anonymous. This is the *why* companion to:
- `docs/database-architecture.md` — the schema/RLS source of truth (the *what*).
- `memory/CLAUDE.md` — the condensed standing principles.
- `memory/front-server-caching-decisions.md`, `memory/anonymity-and-proximity-decisions.md`,
  `memory/friends-feature-decisions.md` — the per-decision build-log entries.

Most of this is **not built yet** — it spans Phase 4.5 (anonymous posting),
4.7 (friends), 5 (region feed), and 5.5 (front server + Redis). It's written
down now so the design doesn't drift, and so the reasoning survives even where
the code doesn't exist yet. Where a decision is settled, the alternatives we
rejected are recorded alongside it — that's the point of this doc.

---

## 1. The architecture

A front server + Redis sits between the client and Supabase, added in Phase 5.5
for caching and a narrower API surface. It does **not** replace Supabase's auth
or RLS.

```
Client (Expo + TanStack Query)
   |  Authorization: Bearer <JWT>
   v
Front Server (Node/Express, stateless)          Redis (shared-cache blobs only)
   |  JWT forwarded unmodified                        ^
   v                                                   | (once per TTL per region)
Supabase (Auth + Postgres + RLS + security-definer RPCs)
   |
   v
Supabase Storage (photos, served via CDN)
```

- Auth stays entirely Supabase's. The server forwards the JWT untouched
  (`createClient(..., { global: { headers: { Authorization: jwt } } })`) and
  **never uses `service_role` for user-facing requests** — RLS stays the real
  boundary regardless of which layer a request came through.
- The server is **stateless**: no per-instance request state (rate-limit
  counters, ad-hoc caches). Any shared state lives in Redis. This makes
  horizontal scaling an infra change, not a rewrite.
- Image *bytes* never flow through this pipeline — only the photo reference
  does; the CDN in front of Storage is the image cache.

---

## 2. Governing rule: shared vs personal

> Cache server-side (Redis) when a result is **shared across many requesters**.
> Rely on the client-side (TanStack Query) cache when the result is **personal
> to the requester**.

Personal results (own history, friends feed) are never shared, so caching them
in Redis would grow memory ~O(users) for zero cross-request reuse — the
client-side cache gives the latency benefit without that cost.

| Read path | Shared/personal | Redis? | Anonymity strip |
|---|---|---|---|
| Explore (global newest) | shared | yes (`feed:global`) | RPC, unconditional |
| Region feed | shared per region | yes (`feed:{region}`) | RPC, unconditional |
| Friends feed | personal | no | per-viewer query (`auth.uid()`) |
| User history | personal | no | n/a (own posts) |
| Post detail | single row | no | per-viewer query (`auth.uid()`) |

---

## 3. The core tension: a shared cache can't come from per-user RLS

A cached feed blob has to be **identical for every viewer**, or it isn't
shareable. But a normal JWT-forwarded query is *not* identical per viewer —
three things vary the rows per requester:

1. **Blocking** — enforced in the `posts` RLS SELECT policy, so two users with
   different block lists get different rows from the same query.
2. **Self-exclusion** — Explore hides your own posts.
3. **Anonymous posting** — an anonymous post shows its author to the owner but
   hides it from everyone else.

So the shared feed is built by a **`security definer` RPC** that returns a
**pre-personalization superset** (all live+approved posts in the region,
viewer-agnostic), which is what gets cached. The three per-viewer transforms
are then split by *where each is safe and cheap to apply* — section 4.

Rejected alternative: a per-viewer JWT-forwarded query with Redis on top.
Doesn't work — the cache key would have to include the viewer (block list, id),
which is just a per-user cache (O(users)) wearing a shared-cache costume.

---

## 4. The personalization split (the central decision)

### 4a. Anonymity → stripped in the DB, before the row leaves Postgres

The RPC nulls `user_id`/author/`photo_url` for `is_anonymous` posts. The base
`posts` row **always keeps the real `user_id`** — stripping is in the
projection (RPC / view), **never the stored row**. This is a hard invariant:
the strip lives only in the read path the app uses; the base table is never
touched. Consequences:
- Any **privileged direct query** — Supabase dashboard SQL editor (superuser,
  bypasses RLS) or the `service_role` key — sees the real author of *every*
  post, anonymous or not, **immediately and with no extra tooling**. That is
  the moderation capability, and it exists the moment the `is_anonymous` column
  + view ship.
- Anonymity here is therefore **app-level pseudonymity against other users, not
  encryption against the database operator.** `posts.user_id` is cleartext;
  admins with DB access read it plainly. Intended, not a gap.
- An *in-app* admin role (a logged-in `role = 'admin'` account that sees authors
  *through the app*) is separate and optional (Phase 7 — an RLS policy granting
  base-table visibility). Direct dashboard/`service_role` access needs none of it.

**Decision: DB strips (not the server).** The two options were:

| | A: server strips | B: DB strips (**chosen**) |
|---|---|---|
| Trust surface for the identity | Postgres + server + Redis + logs | **Postgres only** |
| A bug/log/crash-dump can leak it? | yes, anywhere the raw row is handled | **no — never received it** |
| Covers direct client→Supabase paths (history/friends/detail)? | **no** (no server there to strip) | yes, one rule everywhere |
| Works for the viewer-agnostic shared blob? | awkward (must remember to cache the stripped copy) | yes (RPC emits an already-safe blob) |
| SQL complexity | lower | higher (conditional projection) |

**Why B:** *data minimization at the trust boundary* — enforce the secret where
the data originates, so the fewest components can leak it. Anonymity becomes a
property of the **data**, not of which transport fetched it (the same pattern
`profiles_public` uses to withhold columns). Two DayRate-specific clinchers make
it decisive, beyond the security argument:
- Personal feeds have **no server layer** (client ↔ Supabase direct), so option
  A literally has nowhere to strip them — you'd need DB-side stripping anyway.
- The shared RPC is **viewer-agnostic by design**, so it *can't* branch on the
  viewer; it must strip at the source regardless.
- And the server has **no legitimate need** for the anonymous author's id
  anyway (self-exclusion/block moved to the client; moderation is a separate
  path). No need → don't send it.

**Two strip shapes**, by path:
- Shared RPC → strips **unconditionally** (can't know the viewer) → the author
  sees their *own* anonymous post as anonymous in Explore/region. Accepted
  concession (harmless — indistinguishable from any other anon post).
- Per-viewer queries (friends, detail) → strip **conditionally**,
  `case when is_anonymous and user_id <> auth.uid() then null` → the author sees
  their own as theirs.

### 4b. Self-exclusion → client-side

Dropping your own posts from Explore is cosmetic, not a security boundary —
they're your own public posts. The client drops `post.user_id === myId`. Moving
it off the server keeps the shared blob identical for everyone.

### 4c. Block-filter → client-side (accepted with a residual)

The client drops `myBlockedIds.has(post.user_id)`. This is safe **because** feed
posts are already public *and* blocking stays RLS-enforced on every path that
matters — **post detail** (tap-through → not-found), **comments**, **likes**,
and **Storage photos**. The block clause stays in `posts` RLS for those paths;
the shared RPC bypasses it and the client re-applies it cosmetically.

**Residual, accepted deliberately:** a blocker who inspects the raw feed payload
can see a blocked user's already-public, *non-anonymous* post text. Low harm
(it's public; they still can't open it, interact, or load its photo). If this
ever becomes unacceptable, the fallback is to move block-filtering back
server-side — at the cost of per-viewer server work.

### Net effect

Both client filters are **no-ops on anonymous posts** (their `user_id` is null),
and the **front server does zero per-viewer work on feeds** — it's a dumb Redis
proxy handing one identical blob to everyone. The client absorbs two cheap array
filters; the DB absorbs the one security-critical transform.

---

## 5. Performance: the strip is free; caching is the lever

A recurring question: does DB-side stripping overload the DB at high demand,
and would server-side stripping be faster? **No, and no.**

- `CASE WHEN is_anonymous THEN NULL ELSE user_id END` is a **projection over
  columns already read** — O(1) per row, no I/O, no join, no subquery. It's
  nanoseconds, invisible against the query's real cost (filter/sort/RLS/joins).
- Real DB load at scale comes from **thousands of users re-running the same
  query**, plus per-viewer RLS evaluation (the block `not exists` subquery).
- The lever for that is **caching**, which is fully compatible with DB-side
  stripping: the RPC runs **once per TTL per region**, the already-stripped blob
  lands in Redis, and every subsequent request is served from Redis without
  touching Postgres. Under load the DB is barely involved. The RPC is also
  *faster* than the per-viewer path because, being viewer-agnostic, it skips the
  costly per-viewer RLS block-subquery.
- Server-side stripping is **not faster** — done per-request it's strictly *more*
  work (strip every row on every request vs. once per cache-fill) and puts raw
  ids in Redis; done at cache-fill it's a wash but adds the trust cost for zero
  gain.
- Even if anonymity stopped mattering, the "fast" move would be to *drop* the
  strip, not relocate it — and that saves ~nothing, because the strip was free
  and the cache already idles the DB. The genuine speed/availability levers are:
  **Redis caching, indexing the feed's filter/sort, the security-definer RPC,
  connection pooling (PgBouncer), and read replicas** — none about where the
  strip runs.

Principle worth keeping: offloading *real* work off the DB is a valid scaling
strategy (the primary is the hardest tier to scale) — but pick operations that
are actually expensive *and* per-request. The strip is neither.

---

## 6. Moderation actions on an anonymous post

Because the author's id is stripped before it leaves Postgres, user-side actions
split by what's possible without the identity:

- **Report → works.** Targets the *post* (`target_type: 'post', target_id:
  post.id` — the id is never stripped). No identity is in the report payload;
  the reporter learns nothing. Moderators resolve it by joining
  `reports.target_id → posts.user_id` on the base table with elevated privilege
  — the "hidden from users, visible to moderators" path. This is *why* the base
  row keeps `user_id`.
- **Block → impossible by design (not a gap).** Any mechanism to block the
  hidden author deanonymizes them: (1) `blocks` SELECT is `blocker_id =
  auth.uid()`, so you'd read back the real `blocked_id`; (2) blocking hides all
  their content, so their *non-anonymous* posts vanishing from your feed
  correlates them to the anonymous one. Blocking (act on an identity) and
  anonymity (withhold it) are directly contradictory.
- **Recourse: "Hide this post"** — client-side, per-*post* dismissal keyed on
  `post.id`, no identity involved. Won't suppress future anon posts from the
  same author (no stable pseudonym is emitted — deliberately). Full block flow
  stays available on non-anonymous posts.

---

## 7. Photos & anonymity

Phase 1 stores photos at `<user_id>/<file>` and puts that path in
`posts.photo_url` — so the path *itself* deanonymizes an anonymous post via its
URL. From Phase 4.5, new uploads use a **non-identifying path (random UUID)**,
uniform across all posts so the scheme doesn't reveal which posts are anonymous.
Existing photos are untouched (all pre-4.5 posts are non-anonymous). The
**write-side Storage RLS must change** — Phase 1 authorizes by path-prefix
(`first folder = auth.uid()`), which can't work once the path carries no
identity, and the post row doesn't exist yet at upload time (compose order:
pick→upload→insert). Plan to finalize at build time: unguessable UUID path +
authenticated insert + orphaned-upload cleanup. The cross-user *read* policy is
scheme-agnostic and unaffected.

---

## 8. Friends feed (Phase 4.7)

- **Two-way mutual follow** (request→accept), not one-way — a `friendships`
  table with an accept state + RLS.
- **Personal → no Redis.** Direct Supabase query (`user_id in (<my friends>)` +
  live), client-cached, key `['posts', { scope: 'friends' }]`. Anonymity
  stripped via the per-viewer conditional projection (§4a).
- **Anonymity in the friends feed is only *soft* — accepted (Option B).** A
  friends feed is scoped to your friends, so an anon post appearing there
  already tells the reader "a friend wrote this" — nulling `user_id` doesn't hide
  that set-membership signal, and for a 1-friend user it's fully deanonymized.
  Rejected Option A (keep anon posts out of the friends feed, so they only
  appear in the large-anonymity-set public pool). Chose B for simplicity,
  treating the friend circle as a light veil, **paired with a required
  compose-time warning** so it's intentional, not a surprise.

---

## 9. Scaling posture

**Do now (cheap, avoids rework):** keep the server stateless; use Supabase's
connection pooler (PgBouncer) from the server; keep cache keys region/entity
scoped (`feed:{region}`, `replies:{post_id}`), never global blobs; the
`(user_id, created_at)` index already added.

**Consciously defer (real solutions, not needed yet):** horizontal scaling of
the server (statelessness makes it a later infra change); Redis clustering /
managed Redis; Postgres read replicas for read-heavy feeds; CDN for images
(already free via Storage).

---

## 10. Explicitly rejected, and why

- **Per-minute rate limiter (DB trigger + Redis `incr`)** — wrong fit for a
  once-daily journal; the only write throttle is `unique(user_id, local_date)` +
  the entry window. There is no rate-limit trigger and no `expires_at`/expiry
  delete (ephemerality is the computed 36h RLS window).
- **Server-side anonymity stripping** — larger trust surface, doesn't cover the
  server-less direct paths, no speed gain (§4a, §5).
- **Client-side anonymity stripping** — the raw payload deanonymizes instantly;
  anonymity must be enforced server-side/DB-side.
- **Blocking the author of an anonymous post** — deanonymizes (§6).
- **Hard anonymity in the friends feed (Option A)** — rejected in favor of soft
  anonymity + warning (§8).

---

## 11. Open items (decide at build time)

- **Sparse-region fallback** (Phase 5): a hard region match can return zero
  posts. Widen to country, or fall back to "most liked"? Not decided.
- **"Most popular" scope** (Phase 5): global vs per-region, and whether a
  recency-decay factor is wanted now. Open.
- **Photo write-authorization mechanism** (Phase 4.5): the exact policy once the
  path no longer carries identity (§7).
