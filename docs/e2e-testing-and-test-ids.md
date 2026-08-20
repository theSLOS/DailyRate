# E2E testing & test IDs

Status: **selectors in place, Cypress not yet installed.** The app exposes a
stable set of test IDs and the constants that name them; wiring up a runner is
a separate, still-outstanding step. This document covers both the convention
that exists today and what integrating Cypress will require, so the second half
isn't rediscovered from scratch.

---

## 1. Why `testID` and not something else

`react-native-web` renders the React Native `testID` prop as a `data-testid`
attribute on the DOM node (`react-native-css-interop` is not involved;
the mapping lives in `react-native-web/dist/modules/createDOMProps`, which
does `domProps['data-testid'] = testID`). One prop therefore serves both
platforms: `getByTestId` in React Native Testing Library, and
`[data-testid="..."]` in a browser-based E2E runner.

Selectors that look tempting but are not used:

| Selector                     | Why it's rejected                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `input[placeholder="Email"]` | Placeholder is user-facing copy; rewording it breaks tests for a non-reason                 |
| `input[type="email"]`        | Derived from `keyboardType`, a keyboard hint — dropping that prop silently breaks selection |
| `cy.contains('Sign in')`     | Label text is copy, and `Pressable` renders as `<div role="button">`, not `<button>`        |

## 2. The convention

Test IDs live in [`constants/testIds.ts`](../constants/testIds.ts) as a single
`TEST_IDS` object, never as inline string literals in JSX. This follows the
project's "no hardcoded strings" standard, and it pays off concretely: E2E
specs can import the same constant through the `@/*` path alias, so renaming a
selector updates the app and the specs together instead of leaving them to
drift.

```tsx
import { TEST_IDS } from '@/constants/testIds';

<TextInput testID={TEST_IDS.signIn.email} ... />
```

Naming: values are kebab-case and screen-prefixed (`sign-in-email`,
`sign-up-confirm-password`). The object is grouped by screen and declared
`as const` so key access is type-checked.

**Shared primitives must forward the prop.** `ButtonProps` in
[`components/ui/Button.tsx`](../components/ui/Button.tsx) is a closed type with
no spread, so `testID` is declared explicitly and passed through to the
underlying `Pressable`. Any new primitive in `components/ui/` needs the same
optional `testID?: string` passthrough, or callers can't label it.

### What gets an ID

Every interactive element (text inputs, buttons, pressables) plus anything a
test needs to assert on — error text, empty states, loading indicators.
Purely decorative elements don't need one.

## 3. Coverage today

| Screen                   | IDs                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `app/(auth)/sign-in.tsx` | `sign-in-email`, `sign-in-password`, `sign-in-submit`, `sign-in-error`                             |
| `app/(auth)/sign-up.tsx` | `sign-up-email`, `sign-up-password`, `sign-up-confirm-password`, `sign-up-submit`, `sign-up-error` |

The `(tabs)` group and the feed/post components have none yet.

## 4. How auth success is observable

Worth knowing before writing a login spec, because nothing on the sign-in
screen navigates:

1. `supabase.auth.signInWithPassword` resolves
2. `onAuthStateChange` fires, and [`hooks/useAuth.ts`](../hooks/useAuth.ts) sets `session`
3. [`app/(auth)/_layout.tsx`](<../app/(auth)/_layout.tsx>) sees a session and returns `<Redirect href="/(tabs)" />`

Expo Router route groups in parentheses do **not** appear in the URL, so
`(auth)/sign-in.tsx` serves at `/sign-in` and `(tabs)/index.tsx` serves at `/`.
A successful login is therefore a `/sign-in` → `/` transition — and it's a
strong assertion, because `(tabs)/_layout.tsx` redirects straight back to
`/sign-in` without a session.

Both layouts render an empty `<View>` while `loading` is true, so there is a
blank frame mid-transition. Retry-based assertions absorb this; assertions
expecting continuously-present content do not.

## 5. Integrating Cypress — what it will need

Not yet done. Recorded here so it isn't re-derived.

**Dependencies:** `cypress`, `eslint-plugin-cypress`. The lint plugin isn't
optional — `.eslintrc.json` extends `expo`, so `cy` and `Cypress` are undefined
globals, and `lint-staged` runs `eslint --max-warnings=0` on every staged
`*.{ts,tsx}` file.

**A separate tsconfig is mandatory.** The root `tsconfig.json` includes
`**/*.ts` and `@types/jest` is installed; Cypress ships Mocha + Chai globals.
Both declare `describe`, `it`, and `expect` with incompatible signatures, so
`cypress/tsconfig.json` must set `"types": ["cypress"]`, and `cypress` must be
added to the root config's `exclude` array.

**Dev server:** `app.json` sets `web.output: "single"`, i.e. a true SPA — one
`index.html`, client-side routing. `npx expo start --web` serves on port 8081.
Metro's first bundle is slow, so raise `defaultCommandTimeout`.

**Test credentials** go in a gitignored `cypress.env.json`, mirroring how
`server/.env.test.local` already works. Don't reuse `.env.local` — that holds
the app's Supabase keys, not test-account logins.

### Known uncaught exception (must be handled)

NativeWind throws on **every** page load under a browser runner:

```
Cannot manually set color scheme, as dark mode is type 'media'.
Please use StyleSheet.setFlag('darkMode', 'class')
```

This is a library bug, not an app defect. `tailwind.config.js` sets no
`darkMode` key, so Tailwind's default `'media'` applies. In
`react-native-css-interop/dist/runtime/web/color-scheme.js`, when the darkMode
flag isn't readable at module-init — always the case on web, since the
stylesheet is injected later — the library installs a `MutationObserver` on
`<head>` that calls `colorScheme.set()` unconditionally once the stylesheet
lands. But `set()` throws immediately when darkMode is `'media'`.

It is harmless and fires once: the observer disconnects _before_ the throw, and
in media mode the sync it attempts is a no-op anyway (dark styling is handled
by the CSS `@media (prefers-color-scheme)` query). It surfaces only under
Cypress because it's thrown asynchronously inside a MutationObserver callback,
where nothing but a global error handler can see it.

Handle it in the runner, scoped to this one message — a blanket ignore would
swallow real application errors:

```ts
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('Cannot manually set color scheme')) return false;
  return true;
});
```

Setting `darkMode: 'class'` in `tailwind.config.js` also silences it, but that
is a **product behaviour change** — the app would stop following the OS
light/dark preference — and shouldn't be driven by a test runner.

### Session persistence between specs

`lib/supabase.ts` sets `persistSession: true`, and on web AsyncStorage is
`localStorage`. A spec that signs in leaves the next one already authenticated
and redirected off `/sign-in`. Clear storage between tests, or use `cy.session()`
to cache and restore auth rather than driving the form repeatedly. Drive the
real sign-in form in exactly one spec — the one testing sign-in.

### The one-post-per-day wall

`posts` has `unique(user_id, local_date)` plus a DB-enforced entry window
(`get_entry_date` returns `null` in a 12pm–4pm dead zone). A spec that creates
a post succeeds **once per test account per day**, then fails on every rerun.
The server's Vitest suite hit exactly this and resolves it by skipping at
runtime (see `server/tests/concept2.test.ts`). Any E2E test that posts needs
the same treatment, a pool of accounts, or a cleanup step — don't assume it can
run on demand.
