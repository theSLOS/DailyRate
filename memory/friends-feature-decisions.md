---
name: friends-feature-decisions
description: Decisions for the friends feature (Phase 4.7) — two-way follow, and how anonymity behaves in the friends feed
metadata:
  type: project
---

Friends is now committed scope (Phase 4.7, slotted between 4.5 anonymous
posting and 5 proximity — user promoted it from a spec §6 stretch idea on
2026-07-25). **Built**: Phase 4.7 schema/RLS complete 2026-07-28 (verified
27/27 cases, see `memory/project-phase-status.md`); Phase 4.8 friends feed +
tab complete 2026-08-03.

**Two-way (mutual) follow, not one-way.** A friendship exists only once both
users accept — like Facebook friends, not Twitter follows. Built as two
tables (`friend_requests` + mirrored-row `friendships`) plus two `security
definer` RPCs — exact shape in the "Concept 1 design" section below.

**Friends feed is personal → no Redis.** It depends on the viewer's own friend
list (`where user_id in (<my friends>) and live`), so it's per-user and never
shared across requesters — client-side TanStack Query cache only, direct
Supabase query, key `['posts', { scope: 'friends' }]`. Contrast the shared
Explore/region feeds in [[front-server-caching-decisions]].

**Anonymity in the friends feed — Option B, chosen deliberately with eyes
open (2026-07-25):** an anonymous post *is* delivered to friends' feeds and
renders as "Anonymous" (the per-viewer projection nulls `user_id` for everyone
but the author). This is only **soft** anonymity among friends, and the user
accepted that:
- A friends feed is scoped to `user_id in (my friends)`, so an anonymous post
  appearing there already tells the reader "one of my friends wrote this" —
  nulling `user_id` in the payload does not hide that *set-membership* signal.
  The anonymity set collapses to the friend list; **for a 1-friend user it is
  fully deanonymized.**
- Rejected Option A (keep anonymous posts out of the friends feed entirely, so
  they only appear in the large-anonymity-set public/region pool). Option A is
  the only version where "anonymous" means truly anonymous; user chose B for
  simplicity, treating the friend feed as a trusted circle where hiding the name
  is a light veil, not a hard guarantee.

**Required mitigation (user agreed):** a **compose-time warning** when posting
anonymously — "anonymous posts are still visible in your friends' feeds and may
be guessable" — so the soft-anonymity behavior is intentional, not a surprise
(same "make it intentional, not a surprise bug" principle the spec applies to
expiring comment threads, §1.5).

**Why:** captured so Phase 4.7 is built against the mutual-follow + soft-anon
decisions rather than defaulting to one-way follow or hard anonymity. See
[[anonymity-and-proximity-decisions]] (per-post anon, moderator-visible,
server-side enforced) and [[front-server-caching-decisions]] (the shared-vs-
personal feed split and where anonymity stripping runs per read path).

**Built as designed:** the `friendships` table (mutual accept) + RLS, the
`useFriendsFeed` hook (personal, no Redis, anon stripped via the per-viewer
`case when is_anonymous and user_id <> auth.uid()` projection), and the
compose-time anonymity warning are all in place.

---

## Concept 1 design, finalized 2026-07-28 — built as designed

Two tables, not one — pending requests and confirmed friendships are kept
separate rather than a single table with a status column:

- **`friend_requests(requester_id, addressee_id, created_at)`** — composite PK
  `(requester_id, addressee_id)`, `check (requester_id <> addressee_id)`, plus
  a **unique index on `(least(requester_id, addressee_id), greatest(requester_id, addressee_id))`**
  so B can't insert a reverse-direction pending row while A→B is already
  pending (same duplicate-pair problem `blocks` didn't have, since blocks are
  legitimately directional and friend requests aren't). RLS: SELECT where
  you're either party; INSERT only as `requester_id = auth.uid()`; DELETE
  where you're either party (covers both reject and cancel-my-own-request).
  **Product-layer note:** if B tries to request A while A→B is already
  pending, the DB constraint will reject the raw insert — the *hook* should
  check for a reverse pending row first and call accept instead of insert, so
  this reads as "accepting" in the UI, not a raw 409.
- **`friendships(user_id, friend_id, created_at)`** — composite PK
  `(user_id, friend_id)`, `check (user_id <> friend_id)`. **Mirrored two rows
  per accepted pair** (both `(A,B)` and `(B,A)`), chosen over a single
  canonical `(least,greatest)` row deliberately: friend lists are read far
  more often than friendships are created, and a plain `where user_id =
  auth.uid()` indexed lookup beats an `OR`-across-two-columns query on every
  future feed read. RLS: SELECT where `user_id = auth.uid()` only (you only
  ever need to read your own row's `friend_id` column, never the mirrored
  other-direction row). **No client-side INSERT/UPDATE/DELETE policy at
  all** — rows can only be created/removed via the two RPCs below.
- **`accept_friend_request(other_user_id uuid)`** — `security definer` RPC
  (same bypass pattern as the `likes`/`comments` counter triggers): deletes
  the matching `friend_requests` row, inserts both mirrored rows into
  `friendships` in one transaction. Needed because crediting the *other*
  user's side of the friendship isn't something a plain RLS insert policy
  run as the accepting user can authorize.
- **`remove_friendship(other_user_id uuid)`** — also `security definer`;
  deletes *both* mirrored rows in one transaction. A plain client-side delete
  would only remove the caller's own row and leave a dangling one-sided row.
- **Re-request policy (decided 2026-07-28):** rejecting or unfriending just
  `DELETE`s the row(s) — no `rejected`/`ended` status kept. A later request
  between the same pair is a fresh `INSERT`, no history retained. Simpler,
  matches how most social apps let you re-add someone you'd removed.

**Why:** captured so the schema gets built exactly as designed rather than
re-derived from scratch on a different machine — see the mirrored-row
reasoning above (industry-standard trade-off for undirected/mutual graphs:
pay 2x storage + one atomic write on the rare accept event, get every future
read down to a trivial indexed lookup).

**Built exactly to this shape** — see
`supabase/migrations/20260728093817_friends.sql` and
`docs/database-architecture.md` §2/§4 for the as-built reference.
