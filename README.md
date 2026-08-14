# DailyRate

A social app built around one simple daily ritual: once a day, rate your day
1–10, add a short message, and optionally a photo. Other users browse recent
days on an Explore feed, react with likes, and comment — but posts are
**ephemeral to the public** (visible for 36 hours) while each user keeps a
**permanent private history** of their own days.

Full product spec: [`memory/daily-rating-social-app-spec.md`](memory/daily-rating-social-app-spec.md)
Backend design (as actually built): [`docs/database-architecture.md`](docs/database-architecture.md)

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

## Project status

Phases 0 through 5 (foundations through region-based filtering) are
complete; Phase 5.5 (a front server + Redis caching layer) is in progress.
See the phase table in [`CLAUDE.md`](CLAUDE.md) for the full roadmap — that
table, not this section, is the one kept current per phase.

## Running locally

This is two separate apps in one repo: the Expo client at the root, and a
front-server gateway in [`server/`](server/) (Phase 5.5, in progress — the
client doesn't route through it for everything yet, see `memory/CLAUDE.md`).

**1. Database.** Both apps talk to the same Supabase project. Create one,
then apply the schema in [`supabase/migrations/`](supabase/migrations/) to
it via the Supabase CLI (`npx supabase link`, then `npx supabase db push`)
— see [`docs/database-architecture.md`](docs/database-architecture.md) for
what that schema is and why. If the generated `types/database.ts` ever
drifts from the live schema, regenerate it with
`npx supabase gen types typescript`.

**2. Client app:**
```bash
npm install
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

**3. Server** (separate process, own dependencies):
```bash
cd server
npm install
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_ANON_KEY / PORT
npm run dev
```

**Tests.** `npm test` at the repo root runs the client suite (Jest); `npm
test` from `server/` runs the server suite (Vitest) against a **real**
Supabase project using dummy test accounts — copy `server/.env.test.example`
to `server/.env.test.local` and fill in real credentials for two test
accounts (never commit that file — it's gitignored on purpose). Those
credentials aren't recoverable from this repo or its history; ask whoever
ran the project before, or create fresh dummy accounts. A broader set of
manual/scripted verification recorded in `memory/project-phase-status.md`
used more than two such accounts (`dummy1probe`–`dummy8`) — recreating that
full test fixture is a bigger lift than the two accounts the automated
suites need.
