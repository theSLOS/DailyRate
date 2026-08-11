# DayRate

The full project guide, spec, plan, and decisions live in `memory/` (tracked in
the repo). This root file exists so any Claude Code instance auto-loads the
guide regardless of setup — it imports the real one:

@memory/CLAUDE.md

Everything else:

- `memory/daily-rating-social-app-spec.md` — full product spec
- `memory/project-phase-status.md` — build log / current phase status (most current source)
- `memory/anonymity-and-proximity-decisions.md` — anonymous posting + region-proximity decisions
- `memory/front-server-caching-decisions.md` — Phase 5.5 front server + Redis / caching + RLS
- `memory/friends-feature-decisions.md` — Phase 4.7 friends (two-way follow) + soft-anonymity
- `docs/database-architecture.md` — schema / RLS reference (the *what*)
- `docs/feed-and-caching-architecture.md` — feed/caching/anonymity design rationale (the *why*)

> Note: two personal memory files (`user_js_familiarity.md`,
> `feedback_concept_explanation_format.md`) are intentionally kept local
> (gitignored) and do not sync across machines.
