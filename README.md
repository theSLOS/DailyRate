# DailyRate

A social app built around one simple daily ritual: once a day, rate your day
1–10, add a short message, and optionally a photo. Other users browse recent
days on an Explore feed, react with likes, and comment — but posts are
**ephemeral to the public** (visible for 36 hours) while each user keeps a
**permanent private history** of their own days.

Full product spec: [`memory/daily-rating-social-app-spec.md`](memory/daily-rating-social-app-spec.md)
Backend design (as actually built): [`docs/database-architecture.md`](docs/database-architecture.md)
E2E selectors & test-ID convention: [`docs/e2e-testing-and-test-ids.md`](docs/e2e-testing-and-test-ids.md)

## Stack

- **Expo (React Native + React Native Web)** — one TypeScript codebase for iOS, Android, and web
- **Expo Router** — file-based navigation
- **Supabase** — Postgres, Auth, Storage, Row-Level Security
- **PostGIS** — geospatial queries for proximity-based discovery
- **TanStack Query** — server state, caching, optimistic updates
- **NativeWind** — Tailwind-style styling shared across platforms

## Notable engineering decisions

- **36-hour visibility window enforced in Postgres RLS**, not in application
  code — a post disappears from the public feed after 36 hours regardless of
  what any client sends, and the same window is mirrored onto Storage so a
  photo's signed URL can't outlive the post's public visibility.
- **Location privacy by construction**: raw coordinates are never persisted
  at all — a server-side `resolve_region()` call derives only a
  country/state code and a human-readable label, once per post, and that's
  what gets stored. No exact pin exists to leak.
- **Denormalized counters** (`like_count`, `comment_count`) kept in sync via
  `security definer` database triggers, so a like from a user who isn't the
  post's owner still updates the count correctly under RLS.
- **Two-way blocking enforced at the RLS layer**: a block hides a user's
  posts and comments from the blocker (and vice versa) without either party's
  own content ever being hidden from themselves.
- **Cursor-based pagination** throughout (never `OFFSET`), since the feed is
  a live, append-only set that shifts under a user while they scroll.
- **Shared feeds cache one identical blob per query, not one per viewer**:
  anonymity stripping happens inside the database RPC before caching, so the
  Redis layer (`server/`) never has to know or care who's asking. A
  single-flight guard collapses concurrent cache misses for the same key into
  one Postgres query, so a cold cache under load can't turn into a stampede.

## Project status

Phases 0 through 5 (foundations through region-based filtering) are
complete; Phase 5.5 (a front server + Redis caching layer) is in progress.
See the phase table in [`CLAUDE.md`](CLAUDE.md) for the full roadmap — that
table, not this section, is the one kept current per phase.

## Running locally

This is two separate apps in one repo: the Expo client at the root, and a
front-server gateway in [`server/`](server/). Set the server up **before**
the client — the client now routes most personal reads (today's post,
history, post detail, likes/comments/blocks status, friends, profile, region)
through it, not through Supabase directly, so those screens won't work
against a server that isn't running yet. Writes and the shared Explore feed
still go straight to Supabase for now; see
[`docs/api-gateway-endpoints.md`](docs/api-gateway-endpoints.md) for the
live per-endpoint status.

**1. Database.** Both apps talk to the same Supabase project. Create one,
then apply the schema in [`supabase/migrations/`](supabase/migrations/) to
it via the Supabase CLI (`npx supabase link`, then `npx supabase db push`)
— see [`docs/database-architecture.md`](docs/database-architecture.md) for
what that schema is and why. If the generated `types/database.ts` ever
drifts from the live schema, regenerate it with
`npx supabase gen types typescript`.

**2. Redis** (Phase 5.5 caching layer — the server fails open without it, so
this is optional for basic development, but required to actually exercise the
cache **and required for the server's own test suite**, see Tests below).
Requires Docker Desktop with virtualization enabled in the host firmware
(BIOS/UEFI: Intel VT-x or AMD-V):

```bash
docker run -d --name dayrate-redis -p 6379:6379 --restart unless-stopped redis:7-alpine
```

No volume — the cache holds nothing durable, so losing it on a container
restart is expected, not a bug. If Docker Desktop restarts and the container
doesn't come back on its own despite `--restart unless-stopped`, `docker start
dayrate-redis` brings it back; `docker exec dayrate-redis redis-cli ping`
should reply `PONG`.

**3. Server** (separate process, own dependencies):

```bash
cd server
npm install
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_ANON_KEY / PORT / REDIS_URL
npm run dev
```

`REDIS_URL` defaults to `redis://localhost:6379`, matching the container
above. The server logs `redis connected` on success or `no REDIS_URL, cache
disabled` / `redis unavailable, cache disabled` otherwise — either way it
still starts and serves requests, just without caching. CORS is wide open
(`cors()`, no origin restriction) — fine for local dev against the Expo web
client, deliberately flagged to tighten before any real deployment (see
`memory/CLAUDE.md`).

**4. Client app:**

```bash
npm install
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / EXPO_PUBLIC_API_URL
npx expo start
```

`EXPO_PUBLIC_API_URL` points at the server from step 3 (`http://localhost:4000`
by default; use the machine's LAN IP instead of `localhost` when testing on a
physical device via Expo Go, since the phone isn't `localhost` to itself).
**`EXPO_PUBLIC_*` vars are inlined at Expo's bundle-build time** — a browser
refresh alone won't pick up a change to one, the dev server (`npx expo start`
/ `npm run web`) needs a full restart.

**Tests.** `npm test` at the repo root runs the client suite (Jest); `npm
test` from `server/` runs the server suite (Vitest) against a **real**
Supabase project using dummy test accounts — copy `server/.env.test.example`
to `server/.env.test.local` and fill in real credentials for test accounts
(never commit that file — it's gitignored on purpose; two accounts is the
functional minimum, but more reduces how often pool-dependent fixtures skip —
this project currently runs against seven, `dummy2`–`dummy8`). Those
credentials aren't recoverable from this repo or its history; ask whoever ran
the project before, or create fresh dummy accounts. A broader set of
manual/scripted verification recorded in `memory/project-phase-status.md`
used up to eight such accounts (`dummy1probe`–`dummy8`).

**Redis must be running before `npm test` in `server/`** (step 2 above) —
unlike the app server itself, the test suite does **not** fail open:
`feedCache.test.ts` calls `connectRedis()` directly and errors out if it can't
reach a live Redis within a few seconds. If the container stopped (Docker
Desktop restarts, the host slept, etc.), `docker start dayrate-redis` before
testing; `docker ps` shows whether it's currently up.

Server-suite sign-ins are cached to disk (`server/tests/.jwt-cache.local.json`,
gitignored, holds live session tokens so never commit it) so repeated test
runs reuse the same JWTs instead of re-authenticating every account on every
run — this exists because Supabase Auth's own per-IP rate limit on sign-ins
is easy to trip once the suite authenticates several accounts across a dozen-
plus files. Delete that file if you ever need to force fresh tokens; the
default Supabase rate limit for a fresh project may need raising (Dashboard →
Authentication → Rate Limits → "sign-ups and sign-ins") if the suite outgrows
it again.

Some server tests **skip rather than fail** when the DB-enforced entry window
is in its 12pm–4pm dead zone and a post fixture can't be created. Skips there
are expected, not a broken suite.

**End-to-end.** No E2E runner is installed yet, but the UI already carries
stable selectors: `testID` props sourced from
[`constants/testIds.ts`](constants/testIds.ts), which `react-native-web`
renders as `data-testid`. Currently covering the sign-in and sign-up screens.
See [`docs/e2e-testing-and-test-ids.md`](docs/e2e-testing-and-test-ids.md) for
the convention, how to observe auth success, and what integrating Cypress will
need — including a NativeWind exception that fires on every page load under a
browser runner and must be handled explicitly.
