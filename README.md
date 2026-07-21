# DailyRate

A social app built around one simple daily ritual: once a day, rate your day
1–10, add a short message, and optionally a photo. Other users browse recent
days on an Explore feed, react with likes, and comment — but posts are
**ephemeral to the public** (visible for 36 hours) while each user keeps a
**permanent private history** of their own days.

Full product spec: [`daily-rating-social-app-spec.md`](daily-rating-social-app-spec.md)
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
- **Location privacy by construction**: coordinates are coarsened server-side
  before being written, and no exact pin is ever exposed to other users.
- **Denormalized counters** (`like_count`, `comment_count`) kept in sync via
  `security definer` database triggers, so a like from a user who isn't the
  post's owner still updates the count correctly under RLS.
- **Two-way blocking enforced at the RLS layer**: a block hides a user's
  posts and comments from the blocker (and vice versa) without either party's
  own content ever being hidden from themselves.
- **Cursor-based pagination** throughout (never `OFFSET`), since the feed is
  a live, append-only set that shifts under a user while they scroll.

## Project status

Phases 0–4 (foundations, core posting loop, personal history, the Explore
feed with the 36-hour rule, and engagement/blocking/reporting) are complete.
See the phase table in [`CLAUDE.md`](CLAUDE.md) for the full roadmap.

## Running locally

```bash
npm install
npx expo start
```

Requires a Supabase project with the schema described in
[`docs/database-architecture.md`](docs/database-architecture.md) and a
`.env` file with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
