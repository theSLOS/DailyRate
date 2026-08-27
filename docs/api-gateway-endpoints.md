# API Gateway — endpoint roster

Every read and write in the app routes through the front server (`server/`)
**except auth**: sign-in, sign-up and token refresh stay on `supabase-js` in the
client, since that is what produces the JWT the gateway forwards. Decision and
reasoning: `memory/front-server-caching-decisions.md`. Build log:
`memory/project-phase-status.md`.

This file is the roster and its completion status. It does not repeat the
_why_ — see the two documents above.

## Conventions

- **Auth** — every endpoint sits behind `requireAuth`, which checks the
  `Bearer` shape only. The token is never verified server-side; it is forwarded
  unmodified to Supabase, and **RLS remains the sole enforcement layer**.
  `service_role` is never used on a user-facing request.
- **Errors** — one shape everywhere: `{ error: { code, message } }`.
  `400 INVALID_PARAM` (malformed request), `401 UNAUTHENTICATED` (missing or
  malformed header), `502 SUPABASE_ERROR` (upstream failed), `500
INTERNAL_ERROR` (unhandled). `429` is reserved for the rate-limited writes.
- **Paginated reads**, keyset on `created_at`. **`GET /api/feed`** returns
  `{ posts, nextCursor }` — `nextCursor` computed server-side, `null` on the
  last page and always `null` for feeds ordered by a mutable key. **`GET
  /api/friends/feed`** returns a bare array instead — it's personal and
  never cached, so there was no cache-key reason to compute the cursor
  server-side; the client derives its own `nextCursor` from the last row,
  same as it did calling Supabase directly. Not unified deliberately: fixing
  now would mean changing a working, tested contract for consistency alone.
- **Caching** — only results that are _identical for every viewer_ enter Redis.
  Personal reads route through the server as plain passthroughs.
- **Rate limiting** — exactly three writes, via a Redis counter keyed by
  `(user_id, action)`. Post creation is deliberately excluded: it is already
  throttled by `unique(user_id, local_date)` plus the entry window.

Status: **✅ built** · **🟡 in progress** · **⬜ not started**

---

## Concept 1 — server skeleton ✅

| Status | Endpoint              | Replaces                              |
| ------ | --------------------- | ------------------------------------- |
| ✅     | `GET /api/me/profile` | — (proves per-request JWT forwarding) |

## Concept 2 — `feed_shared` RPC ✅

No endpoint. Database only: the viewer-independent feed source every shared
feed reads from (`supabase/migrations/20260810090952_shared_feed.sql`).

## Concept 3 — shared feed endpoint ✅

| Status | Endpoint                                        | Replaces                       |
| ------ | ----------------------------------------------- | ------------------------------ |
| ✅     | `GET /api/feed?variant=&region=&cursor=&limit=` | `useExploreFeed` (server half) |

`variant` is one of `newest`, `most_liked`, `state`, `country`. The client's
state → country → most-liked fallback stays client-side; this endpoint maps 1:1
onto the RPC.

## Concept 4 — Redis ✅

No new endpoint. Wraps `GET /api/feed` in a cache keyed by the parsed query.
Introduces the `redis` dependency.

Five steps, all built and verified.

| Step | What                                                       | Status |
| ---- | ----------------------------------------------------------- | ------ |
| 1    | Redis container + `lib/redis.ts` (fail-open client)          | ✅     |
| 2    | `lib/feedCacheKey.ts` + `REGION_REGEX` validation             | ✅     |
| 3    | Read-through in `routes/feed.ts`, 30s TTL                     | ✅     |
| 4    | Single-flight on the miss path (`lib/singleFlight.ts`)        | ✅     |
| 5    | Tests (`feedCache.test.ts`, `singleFlight.test.ts`)           | ✅     |

The cache is **optional infrastructure**: `connectRedis` is unawaited, every
read and write is gated on `isReady`, and any failure collapses to a miss, so
the gateway serves normally with Redis stopped.

**The cache lookup sits behind `requireAuth`, and must stay there.**
`feed_shared` carries an `auth.uid() is null` guard (`20260820080000`) and Redis
has no RLS — a cache consulted before authentication would serve a signed-in
user's blob to an anonymous caller.

## Concept 5 — personal post reads ✅

| Status | Endpoint                         | Replaces            | Cache                                                             |
| ------ | -------------------------------- | ------------------- | ----------------------------------------------------------------- |
| ✅     | `GET /api/me/posts/today?localDate=` | `useTodayPost`  | none                                                              |
| ✅     | `GET /api/me/posts/history`      | `usePostHistory`    | none                                                              |
| ✅     | `GET /api/posts/:id`             | `usePost`           | none                                                              |
| ✅     | `GET /api/posts/latest?userId=`  | `useLatestLivePost` | none                                                              |
| ✅     | `GET /api/friends/feed?cursor=`  | `useFriendsFeed`    | **never** — personal, and exempt from the personalization ceiling |

Endpoint names deviate from the original prediction in two places, both
deliberate: `today`/`history` moved under `/api/me/` (matching the existing
`/api/me/profile` "my own resource, id from the JWT" convention — a
client-supplied id here would just be self-spoofing waiting to happen, so
deriving it server-side is the correct shape) instead of a bare
`/api/posts/`; the friends feed landed at `/api/friends/feed` rather than
`/api/feed/friends`, grouping it with the rest of `/api/friends/*` instead of
the shared-feed family it has nothing else in common with.

## Concept 6 — engagement reads ✅

| Status | Endpoint                      | Replaces        | Cache                                              |
| ------ | ----------------------------- | --------------- | -------------------------------------------------- |
| ✅     | `GET /api/posts/:id/like`     | `useLikeStatus` | none — per-viewer; id comes from the JWT, not a param |
| ✅     | `GET /api/posts/:id/comments` | `useComments`   | **deliberately not yet** — see below               |

**Comments caching deferred, not dropped.** A thread genuinely is identical
for every viewer (no anonymity strip the way posts get one), so it's still a
valid Redis candidate — but `useSubmitComment` (Concept 7/8) still writes
straight to Supabase, with no server-side hook to bust a Redis entry when a
new comment lands. Caching now would mean a freshly-posted comment silently
missing from the thread for up to the TTL. Revisit once comment creation
also routes through the server and can invalidate the key it just wrote to.

## Concept 7 — post + engagement writes ⬜

| Status | Endpoint                             | Replaces                   | Note                                            |
| ------ | ------------------------------------ | -------------------------- | ----------------------------------------------- |
| ⬜     | `POST` / `PATCH /api/posts`          | `useUpsertPost`            | **not** rate-limited, deliberately              |
| ⬜     | `DELETE /api/posts/:id`              | entry-window delete policy |                                                 |
| ⬜     | `PUT` / `DELETE /api/posts/:id/like` | `useToggleLike`            | optimistic update — the riskiest hook to rewire |

## Concept 8 — rate-limited writes ⬜

| Status | Endpoint                       | Replaces           | Limit      |
| ------ | ------------------------------ | ------------------ | ---------- |
| ⬜     | `POST /api/posts/:id/comments` | `useSubmitComment` | per minute |
| ⬜     | `POST /api/reports`            | `useSubmitReport`  | per hour   |

Thresholds are still undecided.

## Concept 9 — safety + friends 🟡

Reads built; the four writes (block toggle, send/delete request, accept,
remove) still go straight to Supabase — this concept turned out to split
cleanly along the same read/write line every other concept has, so it's
tracked that way rather than forcing one status onto both halves.

| Status | Endpoint                               | Replaces                                       |
| ------ | -------------------------------------- | ---------------------------------------------- |
| ✅     | `GET /api/blocks/:userId/status`       | `useBlockStatus`                               |
| ⬜     | `POST` / `DELETE /api/blocks`          | `useToggleBlock`                               |
| ✅     | `GET /api/friends/ids`                 | `useFriendsIds`                                |
| ✅     | `GET /api/friends/list`                | `useFriendsList`                               |
| ✅     | `GET /api/friends/requests`            | `useFriendRequests`                            |
| ⬜     | `POST /api/friend-requests`            | `useSendFriendRequest`                         |
| ⬜     | `DELETE /api/friend-requests/:id`      | `useDeleteFriendRequest` (reject _and_ cancel) |
| ⬜     | `POST /api/friend-requests/:id/accept` | `accept_friend_request` RPC                    |
| ⬜     | `DELETE /api/friends/:id`              | `remove_friendship` RPC                        |
| ✅     | `GET /api/friends/count?userId=`       | `useFriendCount` (`friend_count` RPC)          |

Standing rule carried over from `docs/database-architecture.md` §7: **never map
`friend_count` over a list** — that is an N+1 of round trips and the trigger to
denormalize instead.

## Concept 10 — profiles + region 🟡

Both reads (`useProfile`, `useSessionRegion`) are built; the timezone-backfill
write is untouched (it's a write, out of scope for this pass). The region
endpoint's method diverges from the original prediction — see below.

| Status | Endpoint                   | Replaces                                  |
| ------ | -------------------------- | ----------------------------------------- |
| ✅     | `GET /api/profiles/:id`    | `useProfile`                              |
| ⬜     | `PATCH /api/me/profile`    | `useEnsureTimezone` (timezone backfill)   |
| ✅     | `GET /api/region?lat=&lng=` | `useSessionRegion` → `resolve_region` RPC |

`GET`, not `POST` — this call is a pure read with no side effects (coordinates
in, a region row or none out), so it fits the same query-param shape as every
other parameterized read in this roster instead of needing a request body.
Permission + GPS reads stay entirely client-side either way; only the RPC
call itself is proxied.

## Concept 11 — storage ⬜

| Status | Endpoint                      | Replaces            | Note                                          |
| ------ | ----------------------------- | ------------------- | --------------------------------------------- |
| ⬜     | `POST /api/photos/upload-url` | `uploadPhoto`       | returns a signed **upload** URL; rate-limited |
| ⬜     | `GET /api/photos/:path/url`   | `getSignedPhotoUrl` | returns a signed **read** URL                 |

**The server never touches image bytes on either path.** It authorizes; the
client transfers directly to and from Storage. Proxying the bytes was
considered and rejected — Explore is a polling photo feed, and it would spend
the app server's bandwidth on what Supabase's CDN already serves, for zero
additional security.

---

## Not routed through the gateway

- **Auth** (`useAuth`) — `supabase.auth` in the client, permanently.
- **Hidden posts** (`useHiddenPosts`) — AsyncStorage, per-device by design.
  Local-only, no server state.

## Notes on the concept numbering

Concepts 1–3 are as built. **4–11 are a reconstruction**: the original approved
11-concept plan file (`yep-we-can-keep-composed-eich.md`) is no longer on disk,
so the grouping here follows the sequence recorded in
`memory/front-server-caching-decisions.md` — bare server → shared-feed caching →
personal reads → writes + rate limiting → storage. Treat the boundaries as
provisional; the endpoint list itself is not.

Each concept also carries the corresponding **client hook rewire** — the hook
stops calling `supabase` directly and calls the endpoint instead. That is the
recorded cost of the gateway decision: every Supabase-calling hook in the app
gets rewritten, and every endpoint must stay in sync with the schema.
