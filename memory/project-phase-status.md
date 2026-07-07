---
name: project-phase-status
description: Current build phase and what has been completed for DayRate app
metadata:
  type: project
---

Phase 0 is complete as of 2026-06-30. The following is working:
- Expo SDK 54 scaffold with TypeScript strict mode
- ESLint + Prettier + Husky pre-commit gate
- Supabase project wired up (URL + anon key in .env.local)
- Email auth (sign-in + sign-up) with auth gate via Redirect in route group layouts
- Web output set to "single" (SPA mode) to avoid SSR/WebSocket issues with Supabase Realtime
- Tested on web (browser) and native (Expo Go on device)

**Why:** Web SPA mode (`"output": "single"` in app.json) was needed because Supabase Realtime's WebSocket check crashes Node.js 20 during Expo Router's static rendering pass.

**How to apply:** If Supabase or Realtime issues arise on web, check app.json output mode first.

Phase 1 is complete as of 2026-07-06. The following is working:
- `profiles` table (was missing from Phase 0 despite being "done") + auto-create trigger on `auth.users` insert + RLS
- Client-side timezone backfill (`hooks/useEnsureTimezone.ts`) — `profiles.timezone` is set from the device on first sign-in, since onboarding doesn't collect it explicitly
- `posts` table with `unique(user_id, local_date)`, rating/message checks, PostGIS `location` column (unused until Phase 5), RLS scoped to owner-only (the "others can see" branch is deferred to Phase 3's Explore feed)
- **Custom entry-window rule, replacing the spec's simple ±1-day check:** a day's entry can only be created from 4pm on that day, and remains editable until noon the next day (both edges inclusive); 12pm–4pm is a dead zone with no active window. Implemented as one shared SQL function (`get_entry_date`) used by both the insert-validation trigger and the update RLS policy, plus a client-side mirror (`utils/getEntryDate.ts`) for UI branching.
- TanStack Query wired up (`lib/queryClient.ts` + `QueryClientProvider` in `app/_layout.tsx`); `hooks/usePosts.ts` (`useTodayPost`, `useUpsertPost`)
- Photo pipeline: pick/compress (`utils/pickAndCompressImage.ts`) → upload to a **private** Storage bucket (`post-photos`, policies scoped per-user folder) → `photo_url` column stores the storage *path*, not a URL → `utils/getSignedPhotoUrl.ts` + `hooks/useSignedPhotoUrl.ts` mint a fresh signed URL at read time. Chosen over a public bucket specifically so photo access can be revoked later (36h rule, blocking, moderation) — permanent public URLs can't be taken back once shared.
- NativeWind set up (wasn't done in Phase 0 despite CLAUDE.md mandating it) — Tailwind v3 pinned deliberately (NativeWind 4.2.6 isn't compatible with Tailwind v4)
- `components/ComposeForm.tsx` (presentational, no data fetching) + `app/(tabs)/index.tsx` as the Today screen (create ↔ edit switch, dead-zone messaging)
- Tested end-to-end on device: rating + message + photo all persist and reload correctly in edit mode

**Why (entry-window rule):** user-specified product decision, not derived from the spec — replaces spec §1.2's simpler "local_date within ±1 day of created_at" rule with a stricter time-of-day-gated window.

**How to apply:** if extending posting/editing rules later (e.g. Phase 3+ visibility rules), check `get_entry_date` (SQL) and `utils/getEntryDate.ts` (client) first — they're the single source of truth for "what day is it for this user," and both must stay in sync if the window definition ever changes.

Phase 2 is complete as of 2026-07-07. The following is working:
- `usePostHistory` hook (`hooks/usePostHistory.ts`) — fetches all of the current user's own posts, no time filter, relying on the existing owner-only RLS from Phase 1 rather than an explicit `user_id` filter (same convention as `useTodayPost`)
- Shared `Post` type extracted to `types/posts.ts` (was previously redeclared separately in each hook)
- "Your days" tab (`app/(tabs)/history.tsx`) — reverse-chronological `FlatList` of `PostHistoryCard` rows (`components/PostHistoryCard.tsx`), with loading/error/empty states
- Rating-over-time chart (`components/RatingHistoryChart.tsx`) using **Victory Native classic (`victory-native@^36`), not XL** — XL requires react-native-skia, which isn't available in Expo Go, so classic (SVG-based, via `react-native-svg`) was chosen specifically to keep native testing on Expo Go without a custom dev client
- Chart shows a week/month/all-time toggle (client-side slice via `utils/filterPostsByRange.ts`, day-window constants in `constants/chart.ts`) with a **fixed 1–10 y-axis domain** (not auto-scaled) so a flat week of similar ratings doesn't visually read as a dramatic swing
- Chart rendered as the history `FlatList`'s `ListHeaderComponent`, fed the full unfiltered post list (range-slicing happens inside the chart component, not the hook)

**Why (Victory classic over XL):** user-facing decision driven by keeping the existing Expo Go testing workflow from Phase 0/1 intact — switching to XL would force a custom EAS dev client.

**How to apply:** if a future phase (e.g. richer history analytics in §6 future ideas) needs more chart types, stick with `victory-native` classic components unless the Expo Go constraint is deliberately revisited.

Phase 3 is next: Explore feed — RLS policies enabling the 36-hour public visibility window (extending, not replacing, the current owner-only SELECT policy — see spec §2.4 for the exact `USING` clause), feed UI, cursor pagination, and post detail screen.
