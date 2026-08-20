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
- **Paginated reads** return `{ posts, nextCursor }`, keyset on `created_at`.
  `nextCursor` is `null` on the last page and always `null` for feeds ordered
  by a mutable key.
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

## Concept 4 — Redis 🟡

No new endpoint. Wraps `GET /api/feed` in a cache keyed by the parsed query.
Introduces the `redis` dependency.

Five steps; **1–2 built, 3–5 not started** — no endpoint reads the cache yet.

| Step | What                                                      | Status |
| ---- | --------------------------------------------------------- | ------ |
| 1    | Redis container + `lib/redis.ts` (fail-open client)       | ✅     |
| 2    | `lib/feedCacheKey.ts` + `REGION_REGEX` validation         | ✅     |
| 3    | Read-through in `routes/feed.ts`, 30s TTL                 | ⬜     |
| 4    | Single-flight on the miss path                            | ⬜     |
| 5    | Tests (cache hit, Redis-down fail-open, concurrent misses) | ⬜     |

The cache is **optional infrastructure**: `connectRedis` is unawaited, every
read and write is gated on `isReady`, and any failure collapses to a miss, so
the gateway serves normally with Redis stopped.

**The cache lookup sits behind `requireAuth`, and must stay there.**
`feed_shared` carries an `auth.uid() is null` guard (`20260820080000`) and Redis
has no RLS — a cache consulted before authentication would serve a signed-in
user's blob to an anonymous caller.

## Concept 5 — personal post reads ⬜

| Status | Endpoint                         | Replaces            | Cache                                                             |
| ------ | -------------------------------- | ------------------- | ----------------------------------------------------------------- |
| ⬜     | `GET /api/posts/today`           | `useTodayPost`      | none                                                              |
| ⬜     | `GET /api/posts/history`         | `usePostHistory`    | none                                                              |
| ⬜     | `GET /api/posts/:id`             | `usePost`           | none                                                              |
| ⬜     | `GET /api/users/:id/latest-post` | `useLatestLivePost` | none                                                              |
| ⬜     | `GET /api/feed/friends`          | `useFriendsFeed`    | **never** — personal, and exempt from the personalization ceiling |

## Concept 6 — engagement reads ⬜

| Status | Endpoint                      | Replaces        | Cache                                              |
| ------ | ----------------------------- | --------------- | -------------------------------------------------- |
| ⬜     | `GET /api/posts/:id/like`     | `useLikeStatus` | none — per-viewer                                  |
| ⬜     | `GET /api/posts/:id/comments` | `useComments`   | **Redis** — a thread is identical for every viewer |

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

## Concept 9 — safety + friends ⬜

| Status | Endpoint                               | Replaces                                       |
| ------ | -------------------------------------- | ---------------------------------------------- |
| ⬜     | `GET /api/blocks/:userId`              | `useBlockStatus`                               |
| ⬜     | `POST` / `DELETE /api/blocks`          | `useToggleBlock`                               |
| ⬜     | `GET /api/friends`                     | `useFriendIds`                                 |
| ⬜     | `GET /api/friend-requests`             | `useFriendRequests`                            |
| ⬜     | `POST /api/friend-requests`            | `useSendFriendRequest`                         |
| ⬜     | `DELETE /api/friend-requests/:id`      | `useDeleteFriendRequest` (reject _and_ cancel) |
| ⬜     | `POST /api/friend-requests/:id/accept` | `accept_friend_request` RPC                    |
| ⬜     | `DELETE /api/friends/:id`              | `remove_friendship` RPC                        |
| ⬜     | `GET /api/users/:id/friend-count`      | `friend_count` RPC                             |

Standing rule carried over from `docs/database-architecture.md` §7: **never map
`friend_count` over a list** — that is an N+1 of round trips and the trigger to
denormalize instead.

## Concept 10 — profiles + region ⬜

| Status | Endpoint                   | Replaces                                  |
| ------ | -------------------------- | ----------------------------------------- |
| ⬜     | `GET /api/users/:id`       | `useProfile`                              |
| ⬜     | `PATCH /api/me/profile`    | `useEnsureTimezone` (timezone backfill)   |
| ⬜     | `POST /api/region/resolve` | `useSessionRegion` → `resolve_region` RPC |

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
