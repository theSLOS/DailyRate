# DayRate — Claude Collaboration Guide

## Interaction style

This project uses a **guide + review** workflow:

1. **Claude explains** the next step: what to build, why it's structured that way, and any decisions to make before writing code — paired with pseudo code sketching the shape of the function/component/query (not full working code; you still write the real implementation).
2. **You write the code.** Claude won't write it for you unless you're stuck and explicitly ask.
3. **You show Claude the result.** Paste the file or relevant section and ask for a review.
4. **Claude reviews** for correctness, structure, and standards (see below). Flags issues and names the underlying principle behind each one, not just the patch — e.g. not just "move this into a hook" but *why* (separation of concerns, reusability, testability).

When you're ready for the next step, say "next" or "what's next". Claude will explain the upcoming task at the right level of detail — not too high-level, not step-by-step hand-holding.

A few standing rules within this workflow:
- If there are multiple reasonable designs (e.g. client-side vs. DB-side proximity filtering), briefly present the trade-offs before picking one.
- Ask before introducing a new library or dependency — explain why it's needed first.
- Flag it explicitly when you're about to: tightly couple a UI component to Supabase/network calls directly, skip error or loading states on an async call, put business logic in a component instead of a hook, write a PostGIS/geo query that will scale badly, or miss RLS implications on a new table.
- Recurring corrections (the same category of mistake twice) get captured in Claude's persistent memory rather than logged manually in this file.

---

## Project reference

Full spec: `daily-rating-social-app-spec.md`  
Architecture references: `docs/database-architecture.md` (add one per subsystem as its design stabilizes — don't create these upfront)  
Tech stack: Expo (React Native + Web) · TypeScript · Supabase (Postgres + PostGIS + RLS + Edge Functions) · TanStack Query · NativeWind · Expo Router

---

## Sub-phase discipline

Within whatever phase is current, tackle **one concept at a time**, not just one layer at a time — "backend," for instance, isn't one concept, it's schema design, RLS, data integrity, and geospatial queries bundled together. Mixing them makes it hard to tell what broke when something does.

Implement one concept, verify it in isolation directly against the DB/API (not through the app), *then* stack the next concept on top. Don't wire multiple new concepts together in one sitting just because it's convenient.

---

## Phase tracking

| Phase | Name | Status |
|---|---|---|
| 0 | Foundations & setup | complete |
| 1 | Core posting loop | complete |
| 2 | Personal history | complete |
| 3 | Explore feed + 36h rule | complete |
| 4 | Engagement + blocking/reporting | complete |
| 4.5 | Anonymous posting | complete |
| 4.7 | Friends (two-way mutual follow) + friends feed | in progress — Concepts 1–2 (schema/RLS/RPCs + hooks) done; screens next |
| 5 | Filtering & proximity (region-based, not distance-radius — see memory) | not started |
| 5.5 | Front server + Redis caching layer | not started |
| 6 | Notifications | not started |
| 7 | Trust, safety & privacy | not started |
| 8 | Polish & performance | not started |
| 9 | Beta | not started |
| 10 | Launch | not started |

Update the status column as phases complete.

---

## Server & caching principles (Phase 5.5 — not built yet)

A future front server (Node/Express) will sit between the client and Supabase
for caching and a narrower API surface. It is **not being built now** — these
are standing decisions so the design doesn't drift when the phase starts. Auth
and RLS stay entirely Supabase's job; the server forwards the user's JWT
unmodified (`createClient(..., { global: { headers: { Authorization: jwt } } })`)
and never uses `service_role` for user-facing requests.

- **Caching governing rule:** cache server-side (Redis) only when a result is
  shared across many requesters (region feed, most-liked, a post's comment
  thread); rely on the client-side TanStack Query cache when the result is
  personal (own history, friends feed, own today's post).
- **Shared-feed personalization split (resolved 2026-07-25):** a shared feed
  blob must be *identical for every viewer* to stay cacheable, so the three
  per-viewer transforms are split by where they're safe to run:
  - **Anonymity → in the `security definer` RPC, before the row leaves Postgres.**
    The RPC nulls `user_id`/author/`photo_url` for `is_anonymous` posts
    *unconditionally* (a shared blob can't use `auth.uid()`), so an anonymous
    author's identity never reaches Redis, the server, or the client. The base
    `posts` row always keeps `user_id` — moderation reads it with elevated
    privilege. Personal per-viewer queries (friends, detail) strip conditionally
    (`is_anonymous and user_id <> auth.uid()`) so the author still sees their own.
  - **Self-exclusion → client-side** (cosmetic, non-security): the client drops
    `post.user_id === myId`.
  - **Block-filter → client-side** (accepted with residual): the client drops
    `myBlockedIds.has(post.user_id)`. Accepted *because* feed posts are already
    public AND blocking stays server-enforced by RLS on every path that matters
    (post detail, comments, likes, Storage photos). Residual: a blocker who
    inspects the raw feed payload can see a blocked user's already-public,
    non-anonymous post text. Low harm; deliberate trade-off, not an oversight.
  - Net effect: both client filters are no-ops on anonymous posts (their
    `user_id` is null), and the **front server does zero per-viewer work on
    feeds** — it's a dumb Redis proxy handing one identical blob to everyone.
- **Front server must be stateless:** no per-instance request state (rate-limit
  counters, ad-hoc caches in instance memory). Any shared counter lives in
  Redis. This keeps horizontal scaling an infra change, not a code rewrite.
- **Secrets** (`service_role` key, Redis URL, JWT secret, future payment keys)
  live only in server-side env vars, never in the Expo bundle — reinforces the
  "Hard rule" in `docs/database-architecture.md` §1.
- **One error shape** from the front server (`{ error: { code, message } }`),
  decided up front, not per endpoint.
- **Structured logging** on the front server: endpoint, user, error.

Note: there is no per-minute rate-limit trigger and no `expires_at`/expiry
delete in this app — ephemerality is the computed 36h RLS window, and the only
write throttle is `unique(user_id, local_date)` + the entry window. Don't
reintroduce a requests-per-minute limiter without a concrete need.

---

## Code standards

These apply to every file. Claude will flag violations in reviews.

### TypeScript
- Strict mode on (`"strict": true` in tsconfig). No `any`. If you're tempted to write `any`, use `unknown` and narrow it.
- Explicit return types on all functions (except trivial one-liners where inference is obvious).
- Prefer `type` over `interface` unless you need declaration merging.
- No non-null assertions (`!`) unless you can add a comment explaining why it's provably safe.

### File & folder structure
```
app/                   # Expo Router screens (file = route)
  (auth)/              # Auth group
  (tabs)/              # Tab group
components/            # Shared UI components
  ui/                  # Primitives (Button, Card, Avatar...)
hooks/                 # Custom hooks — all data fetching lives here
lib/
  supabase.ts          # Supabase client (single instance)
  queryClient.ts       # TanStack Query client
constants/             # Colours, spacing, config values — no magic numbers
types/                 # Shared TypeScript types; DB-generated types go in types/database.ts
utils/                 # Pure functions with no side effects
```

### Components
- One component per file; file name matches the component name.
- Named exports only — no default exports for components.
- No inline styles. Use NativeWind classes. If a style can't be expressed in NativeWind, use a `StyleSheet.create` at the bottom of the file.
- No business logic or data fetching inside components. Move it to a custom hook in `hooks/`.
- Props types defined inline above the component, not imported from elsewhere unless shared.

### Data fetching
- All Supabase queries live in custom hooks using TanStack Query (`useQuery` / `useMutation`).
- Always handle the error case. Never silently ignore a rejected query.
- Use optimistic updates for likes and comment submission (the spec calls this out).
- Query keys follow the pattern: `['entity', { filters }]` e.g. `['posts', { feedType: 'proximity' }]`.

### Supabase
- Single client instance exported from `lib/supabase.ts`.
- Never construct raw SQL strings in the client. Use the Supabase JS query builder.
- Type the Supabase client with the generated database types (`supabase gen types typescript`).
- Check `error` on every query response before using `data`.

### Naming
- Components: `PascalCase`
- Hooks: `useCamelCase`
- Utils/helpers: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Types: `PascalCase`
- Database column names stay `snake_case` (Postgres convention); map to `camelCase` at the hook boundary if needed.

### Comments
- Default: no comments. Well-named identifiers should be self-explanatory.
- Write a comment only when the *why* is non-obvious: a hidden constraint, a workaround, a subtle invariant.
- Never comment *what* the code does.

### Git commits
- Commit at the end of each logical unit of work (not per file, not per phase).
- Message format: `type: short description` where type is `feat`, `fix`, `refactor`, `chore`, `docs`.
- Example: `feat: add one-per-day uniqueness constraint to posts table`

---

## Tooling (set up in Phase 0)

| Tool | Purpose |
|---|---|
| ESLint + `@typescript-eslint` + `eslint-plugin-react` + `eslint-plugin-react-native` | Catch style and correctness issues |
| Prettier | Consistent formatting |
| VS Code: format on save | Instant feedback while writing |
| Husky + lint-staged | Pre-commit gate: lint + type-check before any commit lands |

---

## Review checklist (what Claude checks)

When you share code for review, Claude will check:

- [ ] TypeScript strict compliance (no `any`, explicit types)
- [ ] Component has no inline data fetching or business logic
- [ ] Supabase query checks `error` before using `data`
- [ ] Loading and error states are handled on every async call, not just the Supabase `error` field
- [ ] New or changed tables have RLS implications called out explicitly
- [ ] Geo/PostGIS queries are reviewed for scaling (e.g. no unindexed full-table proximity scans)
- [ ] No magic numbers or hardcoded strings (use constants)
- [ ] Named exports, no default exports on components
- [ ] No inline styles
- [ ] File lives in the right folder per the structure above
- [ ] Commit message follows the convention
