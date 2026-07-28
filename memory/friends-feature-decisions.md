---
name: friends-feature-decisions
description: Decisions for the friends feature (Phase 4.7) — two-way follow, and how anonymity behaves in the friends feed
metadata:
  type: project
---

Friends is now committed scope (Phase 4.7, proposed slot between 4.5 anonymous
posting and 5 proximity — user promoted it from a spec §6 stretch idea on
2026-07-25; move the slot if sequencing changes). Not started.

**Two-way (mutual) follow, not one-way.** A friendship exists only once both
users accept — like Facebook friends, not Twitter follows. Implies a
`friendships` table with a request/accept state (e.g. `status` pending→accepted)
or a pair of rows, plus RLS. Exact shape TBD at build time.

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

**How to apply:** when 4.7 starts, build the `friendships` table (mutual
accept) + RLS, a `useFriendsFeed` hook (personal, no Redis, anon stripped via
the per-viewer `case when is_anonymous and user_id <> auth.uid()` projection),
and the compose-time anonymity warning. Confirm the phase slot with the user
before starting.
