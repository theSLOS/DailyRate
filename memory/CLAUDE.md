# DayRate — Claude Collaboration Guide

## Interaction style

This project uses a **guide + review** workflow:

1. **Claude explains** the next step: what to build, why it's structured that way, and any decisions to make before writing code — paired with pseudo code sketching the shape of the function/component/query (not full working code; you still write the real implementation).
2. **You write the code.** Claude won't write it for you unless you're stuck and explicitly ask.
3. **You show Claude the result.** Paste the file or relevant section and ask for a review.
4. **Claude reviews** for correctness, structure, and standards (see below). Flags issues and names the underlying principle behind each one, not just the patch — e.g. not just "move this into a hook" but _why_ (separation of concerns, reusability, testability).

When you're ready for the next step, say "next" or "what's next". Claude will explain the upcoming task at the right level of detail — not too high-level, not step-by-step hand-holding.

A few standing rules within this workflow:

- If there are multiple reasonable designs (e.g. client-side vs. DB-side proximity filtering), briefly present the trade-offs before picking one.
- Ask before introducing a new library or dependency — explain why it's needed first.
- Flag it explicitly when you're about to: tightly couple a UI component to Supabase/network calls directly, skip error or loading states on an async call, put business logic in a component instead of a hook, write a PostGIS/geo query that will scale badly, or miss RLS implications on a new table.
- Recurring corrections (the same category of mistake twice) get captured in Claude's persistent memory rather than logged manually in this file.

---

## Project reference

Full spec: `daily-rating-social-app-spec.md`  
Architecture references: `docs/database-architecture.md`, `docs/api-gateway-endpoints.md` (the front-server endpoint roster + completion status) — add one per subsystem as its design stabilizes, don't create these upfront  
Tech stack: Expo (React Native + Web) · TypeScript · Supabase (Postgres + PostGIS + RLS + Edge Functions) · TanStack Query · NativeWind · Expo Router

---

## Sub-phase discipline

Within whatever phase is current, tackle **one concept at a time**, not just one layer at a time — "backend," for instance, isn't one concept, it's schema design, RLS, data integrity, and geospatial queries bundled together. Mixing them makes it hard to tell what broke when something does.

Implement one concept, verify it in isolation directly against the DB/API (not through the app), _then_ stack the next concept on top. Don't wire multiple new concepts together in one sitting just because it's convenient.

---

## Phase tracking

| Phase | Name                                                                   | Status                                                                      |
| ----- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0     | Foundations & setup                                                    | complete                                                                    |
| 1     | Core posting loop                                                      | complete                                                                    |
| 2     | Personal history                                                       | complete                                                                    |
| 3     | Explore feed + 36h rule                                                | complete                                                                    |
| 4     | Engagement + blocking/reporting                                        | complete                                                                    |
| 4.5   | Anonymous posting                                                      | complete                                                                    |
| 4.7   | Friends (two-way mutual follow) — relationships only                   | complete                                                                    |
| 4.8   | Friends feed + Friends tab                                             | complete                                                                    |
| 5     | Filtering & proximity (region-based, not distance-radius — see memory) | complete                                                                    |
| 5.5   | Front server + Redis caching layer                                     | in progress (server skeleton, `feed_shared` RPC, `GET /api/feed` + Redis caching, and all personal-read passthrough + client wiring complete; `POST /api/posts` (Concept 7) built + verified; rest of writes/rate-limiting/storage not started) |
| 6     | Notifications                                                          | not started                                                                 |
| 7     | Trust, safety & privacy                                                | not started                                                                 |
| 8     | Polish & performance                                                   | not started                                                                 |
| 9     | Beta                                                                   | not started                                                                 |
| 10    | Launch                                                                 | not started                                                                 |

Update the status column as phases complete.

---

## Server & caching principles (Phase 5.5 in progress)

A front server (Node/Express) sits between the client and Supabase. The
server skeleton + JWT-forwarding, the `feed_shared` RPC, `GET /api/feed`
(read-through + single-flight Redis caching, fully tested), and **all 14
personal reads** (today's post, history, post detail, latest-live-post,
like/comment/block status, friends requests/ids/list/count/feed, profile
lookup, region resolution) are built, tested, and wired into their client
hooks via a new shared `lib/apiClient.ts`. `cors()` is enabled (wide open,
dev-only — see `docs/api-gateway-endpoints.md`). **Not yet wired**:
`useExploreFeed` still calls Supabase directly for the shared feed itself
(only the server side of that concept is done); every write (post CRUD,
likes, comments, blocks, friend requests, timezone backfill) still goes
client → Supabase directly, unchanged, per the full roster in
`docs/api-gateway-endpoints.md`. The rest below are standing decisions for the
concepts still to come, so the design doesn't drift mid-phase. Auth and RLS stay entirely Supabase's job; the server forwards the
user's JWT unmodified
(`createClient(..., { global: { headers: { Authorization: jwt } } })`) and
never uses `service_role` for user-facing requests.

- **Full API gateway (resolved 2026-08-08): the client talks to Supabase
  directly for nothing except auth** (sign-in/sign-up, token refresh via
  `supabase-js`). Every other read and write — likes, comments, blocks,
  reports, friend requests, post CRUD, photo upload, region resolution — routes
  through the front server instead of calling Supabase directly. This is not a
  security change (RLS is already the real boundary, proven in Phase 4.7); it's
  for centralized logging, insulating the client from Supabase's shape, and a
  single place to add logic later. See `[[front-server-caching-decisions]]` for
  the full reasoning, the open Storage-proxying question, and why this phase
  needs its own concept breakdown rather than one sitting.

- **Caching governing rule:** cache server-side (Redis) only when a result is
  shared across many requesters (region feed, most-liked, a post's comment
  thread); rely on the client-side TanStack Query cache when the result is
  personal (own history, friends feed, own today's post).
- **Shared-feed personalization split (resolved 2026-07-25):** a shared feed
  blob must be _identical for every viewer_ to stay cacheable. Anonymity
  strips happen server-side, in the `security definer` RPC, before the row
  leaves Postgres — the only place safe from `auth.uid()`. Self-exclusion and
  the block-filter both happen client-side (cheap; blocking is still
  server-enforced by RLS everywhere it actually matters — post detail,
  comments, likes, Storage photos). Net effect: the front server does zero
  per-viewer work on feeds, it's a dumb Redis proxy handing one identical
  blob to everyone. Full reasoning, the rejected alternatives, and the
  accepted block-filter residual: see `[[front-server-caching-decisions]]`.
- **Feed personalization ceiling (resolved 2026-08-10):** shared feeds
  (Explore / region / most-liked) stay non-personalized **permanently** — the
  identical-blob rule above is a standing guarantee, not a convenience. The
  **friends feed is exempt** (already personal, client-cached, never in Redis).
  Future ML ranking on shared feeds must be offline/batch-scored into a
  Postgres column the RPC orders by, never per-request. Rewriting the gateway
  in Python for ML/analytics was considered and rejected; when ML lands
  (post-deployment) it's a separate Python inference service the Node gateway
  calls. See `[[front-server-caching-decisions]]`.
- **Front server must be stateless:** no per-instance request state (rate-limit
  counters, ad-hoc caches in instance memory). Any shared counter lives in
  Redis. This keeps horizontal scaling an infra change, not a code rewrite.
- **Rate limiting (resolved 2026-08-08, not built):** the front server also
  proxies three specific writes — comment creation, report submission, photo
  upload — solely so it can rate-limit them via a Redis counter keyed by
  `(user_id, action)`. Every other mutation (posts, likes, blocks, friend
  requests) still goes client → Supabase directly, unchanged. Post
  creation/edit is deliberately excluded — it already has a natural throttle
  (`unique(user_id, local_date)` + the entry window); don't add a per-minute
  limiter there. See `[[front-server-caching-decisions]]` for the full
  writeup; thresholds are still undecided.
- **Secrets** (`service_role` key, Redis URL, JWT secret, future payment keys)
  live only in server-side env vars, never in the Expo bundle — reinforces the
  "Hard rule" in `docs/database-architecture.md` §1.
- **One error shape** from the front server (`{ error: { code, message } }`),
  decided up front, not per endpoint.
- **Structured logging** on the front server: endpoint, user, error.
- **Two settings deliberately loosened for dev, both flagged to revisit before
  Phase 9/10 (Beta/Launch), neither a permanent decision**:
  - `cors()` on the front server is wide open (`Access-Control-Allow-Origin: *`),
    added when Concept 5's client wiring hit a real CORS block from the Expo
    web dev server. Low risk today only because auth is a Bearer JWT, never a
    cookie — no CSRF surface opens up from a permissive origin. Scope it to
    the real deployed web origin once one exists.
  - Supabase's dashboard "Rate limit for sign-ups and sign-ins" (Auth → Rate
    Limits) was raised from the default 30/5min to 200/5min, needed only
    because the server test suite re-authenticates a small, fixed pool of
    dummy accounts far more aggressively than any real user traffic ever
    would. Doesn't affect production risk directly (the front server never
    calls the token endpoint at all — only the client does, once per real
    device), but a higher ceiling is a weaker anti-abuse posture regardless;
    reconsider the number before launch rather than leaving it at the
    test-suite-driven value indefinitely.

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
- **Every new UI component carries `testID`s.** Interactive elements (inputs,
  buttons, pressables) and anything a test asserts on (error text, empty
  states, loading indicators) get one; purely decorative elements don't.
  Values come from `constants/testIds.ts` — never an inline string literal —
  so E2E specs can import the same constant and a rename can't leave them
  behind. `react-native-web` renders `testID` as `data-testid`, so one prop
  serves both RNTL and browser-based E2E. Shared primitives in
  `components/ui/` have closed props types with no spread, so each must
  declare an optional `testID?: string` and forward it to its root element.
  See `docs/e2e-testing-and-test-ids.md`.

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

- **Every file opens with a `/** ... */` summary comment**, before any imports, describing what the file is for.
- **Every function gets a one-line `/** ... */` goal comment** directly above it, stating its purpose — not what it does step-by-step.
- Beyond those two mandatory comments: no comments by default. Well-named identifiers should be self-explanatory.
- Write an additional comment only when the _why_ is non-obvious: a hidden constraint, a workaround, a subtle invariant.
- Never comment _what_ the code does.

(Changed 2026-09-03 from a stricter "default: no comments" rule — file
summaries and per-function goal comments are now mandatory everywhere in
`app/`, `components/`, `hooks/`, `lib/`, `utils/`, `types/`, `constants/`,
`server/src/`. Excludes `__tests__/`, `server/tests/` — those already carry
their own established fixture/assertion-reasoning comment convention — and
`types/database.ts`, which is Supabase-CLI-generated and gets overwritten on
the next `supabase gen types` run.)

### Git commits

- Commit at the end of each logical unit of work (not per file, not per phase).
- Message format: `type: short description` where type is `feat`, `fix`, `refactor`, `chore`, `docs`.
- Example: `feat: add one-per-day uniqueness constraint to posts table`

---

## Tooling (set up in Phase 0)

| Tool                                                                                 | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint + `@typescript-eslint` + `eslint-plugin-react` + `eslint-plugin-react-native` | Catch style and correctness issues                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Prettier                                                                             | Consistent formatting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| VS Code: format on save                                                              | Instant feedback while writing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Husky + lint-staged                                                                  | Pre-commit gate: lint + type-check before any commit lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Jest + `jest-expo` (added Phase 5.5)                                                 | App-side automated tests, `__tests__/` at root — `npm test`. `jest-expo`'s version must track the installed `expo` SDK version (`~54` here), not `latest` — a version mismatch fails to install at all (`ERESOLVE`).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Vitest + `supertest` (added Phase 5.5)                                               | Server-side automated tests, `server/tests/` — `npm test` from `server/`. Integration-style against real Supabase (dummy test accounts), not mocked — matches this project's standing DB-verification philosophy. Credentials in gitignored `server/.env.test.local` (see `server/.env.test.example`): one shared `TEST_ACCOUNT_PASSWORD` plus a comma-separated `TEST_ACCOUNT_EMAILS` pool, loaded via `tests/helpers/accounts.ts`. `tests/globalSetup.ts` seeds one live post per pool account (reserving the first for per-suite fixtures) and deletes them afterwards; `fileParallelism: false` because every suite shares one Supabase project. |
| Docker Desktop + Redis (added Phase 5.5, Concept 4)                                  | Local cache backing the `server/src/lib/redis.ts` client. Run `docker run -d --name dayrate-redis -p 6379:6379 --restart unless-stopped redis:7-alpine`, no volume — the cache holds nothing durable. Requires virtualization (Intel VT-x / AMD-V) enabled in host firmware; Docker Desktop's "Virtualization support not detected" error means that, not a Docker install problem. Server reads `REDIS_URL` (`server/.env`, default `redis://localhost:6379`) and fails open — starts and serves requests with caching disabled — if Redis is unset or unreachable, so this is optional except when actually exercising Concept 4 cache-read behavior. See README's "Running locally" for the full setup steps. |

---

## Review checklist (what Claude checks)

When you share code for review, Claude will check:

- [ ] TypeScript strict compliance (no `any`, explicit types)
- [ ] Component has no inline data fetching or business logic
- [ ] New UI components carry `testID`s sourced from `constants/testIds.ts`
- [ ] Supabase query checks `error` before using `data`
- [ ] Loading and error states are handled on every async call, not just the Supabase `error` field
- [ ] New or changed tables have RLS implications called out explicitly
- [ ] Geo/PostGIS queries are reviewed for scaling (e.g. no unindexed full-table proximity scans)
- [ ] No magic numbers or hardcoded strings (use constants)
- [ ] Named exports, no default exports on components
- [ ] No inline styles
- [ ] File lives in the right folder per the structure above
- [ ] Commit message follows the convention
