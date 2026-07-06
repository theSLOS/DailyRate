# DayRate — Claude Collaboration Guide

## Interaction style

This project uses a **guide + review** workflow:

1. **Claude explains** the next step: what to build, why it's structured that way, and any decisions to make before writing code.
2. **You write the code.** Claude won't write it for you unless you're stuck and explicitly ask.
3. **You show Claude the result.** Paste the file or relevant section and ask for a review.
4. **Claude reviews** for correctness, structure, and standards (see below). Flags issues; explains the why.

When you're ready for the next step, say "next" or "what's next". Claude will explain the upcoming task at the right level of detail — not too high-level, not step-by-step hand-holding.

---

## Project reference

Full spec: `daily-rating-social-app-spec.md`  
Tech stack: Expo (React Native + Web) · TypeScript · Supabase (Postgres + PostGIS + RLS + Edge Functions) · TanStack Query · NativeWind · Expo Router

---

## Phase tracking

| Phase | Name | Status |
|---|---|---|
| 0 | Foundations & setup | complete |
| 1 | Core posting loop | complete |
| 2 | Personal history | not started |
| 3 | Explore feed + 36h rule | not started |
| 4 | Engagement + blocking/reporting | not started |
| 5 | Filtering & proximity | not started |
| 6 | Notifications | not started |
| 7 | Trust, safety & privacy | not started |
| 8 | Polish & performance | not started |
| 9 | Beta | not started |
| 10 | Launch | not started |

Update the status column as phases complete.

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
- [ ] No magic numbers or hardcoded strings (use constants)
- [ ] Named exports, no default exports on components
- [ ] No inline styles
- [ ] File lives in the right folder per the structure above
- [ ] Commit message follows the convention
