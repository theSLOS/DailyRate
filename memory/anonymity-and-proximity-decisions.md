---
name: anonymity-and-proximity-decisions
description: Decisions for the not-yet-started anonymous-posting feature and the region-based proximity redesign
metadata:
  type: project
---

Four decisions made 2026-07-21, before either feature is built, so a future session doesn't default back to the spec's original assumptions.

**Anonymous posting** (new Phase 4.5, right after Phase 4 finishes — user-added scope, not in the original spec):
- **Per-post toggle**, not a global profile setting — an `is_anonymous`-style boolean set at compose time, not an account-wide switch. Matches the day-to-day mood-journal cadence better than an all-or-nothing setting.
- **Hidden from other users only, not from moderators.** Reports/moderation must still resolve to the real author — anonymity that also blinded moderators would make Phase 4's blocking/reporting toothless against anonymous abuse.
- **Not yet built — implementation note for when it is:** this cannot be client-side hiding. The query itself must withhold author identity server-side for non-owners when the post is anonymous (likely a view, same pattern as `profiles_public`), otherwise inspecting raw API responses deanonymizes the post instantly regardless of what the UI renders.

**Proximity → region-based grouping** (redefines Phase 5's mechanism — not a new phase, the same phase with a different plan):
- User wants Explore's proximity mode to show posts from the same **state/country**, not nearest-first by exact distance — this *replaces* the spec's original `ST_DWithin`/`ST_Distance` radius design (§2.4), it doesn't supplement it.
- **Terminology correction surfaced during this discussion**: "geosharding" (the term the user had heard) is a database-scaling technique — splitting data storage across servers by region for latency/compliance/scale — not a feed-ranking concept, and would be overkill at this app's size regardless. What was actually wanted is region *matching*, a query-shape change, not an infrastructure change.
- **Region label source: bundled boundary dataset + PostGIS `ST_Contains`**, not a third-party reverse-geocoding API — avoids per-post external cost/latency/dependency, at the cost of more upfront setup (loading region polygons once). Extends the spec's existing `place_label` reverse-geocoding assumption (§2.3) rather than introducing a new capability from scratch.
- **Still open, to resolve when Phase 5 actually starts:** the sparse-region fallback. Pure distance-radius proximity always finds *something* (just farther away); hard region-matching can return zero posts if nobody in a user's state/country has posted recently. Likely answer is widen to country, or drop to "Most liked" (already the spec's no-location default) — not decided yet, don't assume either without asking.

**Why:** captured before implementation so neither feature gets built against stale assumptions in a future session — see `[[project-phase-status]]` for the actual build log once these are underway.

**How to apply:** `CLAUDE.md`'s phase table now has "4.5 — Anonymous posting" inserted between Phases 4 and 5, and Phase 5's row is annotated as region-based rather than distance-radius. When 4.5 starts, follow the per-post/moderator-visible/server-side-enforcement decisions above. When Phase 5 starts, build region-matching via bundled boundaries and resolve the sparse-region fallback with the user before shipping — don't pick one unilaterally.
