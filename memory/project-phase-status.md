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

Phase 1 is next: posts table in Supabase + compose screen + one-per-day constraint.
