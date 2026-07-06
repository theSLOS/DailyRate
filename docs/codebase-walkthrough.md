# DayRate Codebase Walkthrough (Phase 0 snapshot)

A student-level tour of every part of the codebase as it exists after Phase 0: what
each piece is, why it's there, and how a request/render actually flows through the
app. Code snippets are pulled directly from the repo — file paths and line numbers
included so you can jump to the source.

This is a snapshot as of Phase 0 completion (2026-06-30). As Phase 1+ add files
(`hooks/usePosts.ts`, `app/compose.tsx`, etc.), extend this doc rather than treating
it as fixed.

---

## 1. The big picture

This is an **Expo** app — one React codebase that compiles to iOS, Android, *and*
web. There is no traditional backend server you write yourself; instead the app
talks directly to **Supabase** (a hosted Postgres database + auth service) from the
client. That's why you won't find `routes/`, `controllers/`, or an `api/` folder
like you might in a classic client-server web app — the "backend" is Supabase, and
your "frontend" folder structure covers both UI *and* the code that calls Supabase.

At a glance:

```
app/            what the user sees — one file = one screen/route (Expo Router)
components/     small reusable pieces of UI or platform-specific logic
hooks/          reusable stateful logic, especially anything touching Supabase
lib/            singletons / setup code (the Supabase client)
constants/      fixed values (colors) — no magic numbers scattered in components
```

The rule from `CLAUDE.md`: **screens don't talk to Supabase directly — they call a
hook.** Right now `useAuth` is the only hook, but Phase 1 introduces
`hooks/usePosts.ts`, and that pattern is what keeps data-fetching logic out of your
UI files.

---

## 2. Entry point and configuration

Before any of your code runs, three config files decide *how* the project is built.

### `package.json`

Declares the dependencies and the scripts that launch the app.

```json
"main": "expo-router/entry",
"scripts": {
  "start": "expo start",
  "web": "expo start --web"
}
```

`"main": "expo-router/entry"` is the important line — it tells Expo "don't look for
a hand-written `index.js`, use Expo Router's own entry file," which in turn scans
the `app/` folder and builds the navigation tree from the files it finds. This is
what makes the whole project **file-based routing**: you don't write a router
config; the folder structure *is* the router config.

### `app.json`

Expo's app manifest — icons, splash screen, bundler settings.

```json
"web": {
  "bundler": "metro",
  "output": "single"
}
```

`"output": "single"` is a decision already logged in
[`memory/project-phase-status.md`](../memory/project-phase-status.md): it forces
web output into classic SPA mode instead of static-rendering each route at build
time. That was necessary because Supabase Realtime's WebSocket setup code crashes
under Node during Expo Router's static-render pass. If you ever see a build fail on
web with a WebSocket-related crash, this is the first setting to check.

### `tsconfig.json`

```json
"compilerOptions": {
  "strict": true,
  "paths": { "@/*": ["./*"] }
}
```

Two things matter here: `"strict": true` is what CLAUDE.md's "no `any`" rule
depends on — the compiler enforces it. And the `@/*` path alias is why every import
in this codebase looks like `import { supabase } from '@/lib/supabase'` instead of
a relative `../../lib/supabase` — `@/` always means "from the project root,"
regardless of how deeply nested the importing file is.

---

## 3. File-based routing with Expo Router (`app/`)

This is the part most different from a typical React app, so it's worth slowing
down on.

**Rule:** every file in `app/` becomes a route. The file's path *is* the URL path
(and the native navigation path). A folder wrapped in parentheses — like `(auth)`
or `(tabs)` — is a **route group**: it organizes files and lets you attach a shared
layout, but the parentheses are invisible in the actual URL.

Current routes:

```
app/
  _layout.tsx           ← root layout, wraps EVERYTHING
  +not-found.tsx         ← 404 screen (Expo Router's special filename)
  (auth)/
    _layout.tsx           ← layout applied to all screens in this group
    sign-in.tsx            → app renders this at route "sign-in"
    sign-up.tsx             → and this at "sign-up"
  (tabs)/
    _layout.tsx           ← layout for the tab bar
    index.tsx               → the default/home tab
```

Each `_layout.tsx` is not a screen itself — it's a wrapper that decides *what
navigator* (`Stack`, `Tabs`, etc.) governs the screens inside its folder, and it can
run logic (like an auth check) before any child screen renders.

### 3.1 Root layout — `app/_layout.tsx`

This file wraps the entire app, once, at the top.

```tsx
// app/_layout.tsx:19-39
export default function RootLayout(): JSX.Element | null {
  const [loaded, error] = useFonts({ ...FontAwesome.font });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}
```

Job: keep the native splash screen on screen (`SplashScreen.preventAutoHideAsync()`
at module load, line 17) until the icon font has finished loading, then hide it and
render the real app. This is a common Expo pattern — you don't want a flash of
missing icons before fonts are ready.

```tsx
// app/_layout.tsx:41-52
function RootLayoutNav(): JSX.Element {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
```

`RootLayoutNav` declares only *two* possible top-level destinations: the `(auth)`
group or the `(tabs)` group. It doesn't decide *which one* — that decision happens
one level down, inside each group's own layout. This is the key idea: **routing
decisions are pushed down to the layout that owns the relevant context**, rather
than one giant if/else at the top.

### 3.2 The auth gate — `app/(auth)/_layout.tsx`

```tsx
// app/(auth)/_layout.tsx:6-13
export default function AuthLayout(): JSX.Element {
  const { session, loading } = useAuth();

  if (loading) return <View style={styles.fill} />;
  if (session) return <Redirect href="/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

This is the "front door" logic for the sign-in/sign-up screens. It calls the
`useAuth` hook (covered in §5) to ask "is anyone logged in?" Three outcomes:

1. Still checking (`loading`) → render an empty view, don't flash a wrong screen.
2. Already have a `session` → immediately `<Redirect>` to the tabs group. (This
   is what stops a logged-in user from being able to navigate back to sign-in.)
3. No session → render the `Stack` navigator so `sign-in.tsx`/`sign-up.tsx` can
   show.

### 3.3 The same pattern, inverted — `app/(tabs)/_layout.tsx`

```tsx
// app/(tabs)/_layout.tsx:18-25
export default function TabLayout(): JSX.Element {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const headerShown = useClientOnlyValue(false, true);

  if (loading) return <View style={styles.fill} />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  ...
```

Notice this is the exact mirror image of the auth layout: if there's *no* session,
redirect to sign-in instead. Together, these two layouts form a complete gate —
whichever group you land in checks whether you're "allowed" to be there and bounces
you to the other one if not. Neither screen inside either group needs to know
anything about auth at all — `index.tsx` (§4.3) is pure UI.

### 3.4 `+not-found.tsx`

Expo Router reserves the `+` prefix for special files. `+not-found.tsx` is rendered
whenever a route doesn't match anything — the file-based equivalent of a classic
web server's 404 handler.

---

## 4. Screens — the actual UI

### 4.1 `app/(auth)/sign-in.tsx`

A standard controlled-form component: local `useState` for each field, plus
`loading`/`error` state for the async call.

```tsx
// app/(auth)/sign-in.tsx:12-18
async function handleSignIn(): Promise<void> {
  setLoading(true);
  setError(null);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) setError(error.message);
  setLoading(false);
}
```

Two things worth noticing as a learning point:

- It calls `supabase.auth.signInWithPassword` **directly** — this is allowed
  because Supabase Auth calls are the one exception CLAUDE.md doesn't route through
  a custom hook (auth session state itself lives in `useAuth`, but the *sign-in
  action* is a one-off imperative call, not a cached query).
- It checks `error` before doing anything else — this is the "always handle the
  error case" rule from CLAUDE.md's Supabase section, applied literally: line 16
  is the entire error-handling story for this call, and it's not skipped.

Once `signInWithPassword` succeeds, notice that `sign-in.tsx` does *not* navigate
anywhere itself. There's no `router.push()` call. That's because `useAuth`'s
`onAuthStateChange` subscription (§5) fires automatically, updates `session` in
every component that calls `useAuth`, and the `(auth)/_layout.tsx` gate (§3.2)
reacts to that change and redirects. **State change drives navigation, not the
other way around.**

### 4.2 `app/(auth)/sign-up.tsx`

Same shape as sign-in, with one extra client-side check before calling Supabase:

```tsx
// app/(auth)/sign-up.tsx:15-19
if (password !== confirmPassword) {
  setError('Passwords do not match');
  setLoading(false);
  return;
}
```

This is purely a client-side UX check (fail fast, don't waste a network call) — it
doesn't replace server-side validation, which Supabase Auth handles on its own
(e.g. password length/strength rules configured in the Supabase dashboard).

### 4.3 `app/(tabs)/index.tsx`

```tsx
// app/(tabs)/index.tsx
export default function HomeScreen(): JSX.Element {
  return (
    <View>
      <Text>DayRate</Text>
    </View>
  );
}
```

Deliberately a placeholder — this is the "empty home screen" that Phase 0's done
criteria asked for ("you can sign in ... and see an empty home screen"). Phase 1
replaces this with the compose/today screen.

---

## 5. `hooks/useAuth.ts` — the single source of truth for "who's logged in"

```ts
// hooks/useAuth.ts:5-25
export function useAuth(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
```

This is a classic **two-phase auth hook**:

1. On mount, `getSession()` asks Supabase's local storage "do we already have a
   valid session from last time?" (this is why `AsyncStorage` is wired into the
   client — see §6). This answers the question once, immediately.
2. `onAuthStateChange` then subscribes to *future* changes — sign-in, sign-out,
   token refresh — and keeps `session` in sync for as long as the component using
   this hook is mounted.
3. The cleanup function (`return () => subscription.unsubscribe()`) matters:
   without it, every component that calls `useAuth` would leak a subscription
   every time it unmounted and remounted.

Both `(auth)/_layout.tsx` and `(tabs)/_layout.tsx` call this same hook
independently — React hooks don't share state by default, but because the
underlying Supabase client *does* fan out `onAuthStateChange` events to every
listener, both layouts stay in sync with each other without any shared global
store. That's the mechanism behind the redirect-gate pattern in §3.2/§3.3.

---

## 6. `lib/supabase.ts` vs `lib/supabase.web.ts` — platform-specific files

```ts
// lib/supabase.ts (native)
import AsyncStorage from '@react-native-async-storage/async-storage';
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    detectSessionInUrl: false,
  },
});
```

```ts
// lib/supabase.web.ts (web)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,
  },
});
```

These two files export the *same* thing (`supabase`) but are configured
differently, and **you never choose between them yourself in code** — every import
just says `import { supabase } from '@/lib/supabase'`. Metro (the bundler) sees the
`.web.ts` suffix and automatically substitutes it in when building for the web
target, and falls back to the plain `.ts` file for iOS/Android. This "platform
extension" convention (`.web.ts`, `.ios.ts`, `.android.ts`) is an Expo/React Native
idiom you'll see again — `components/useClientOnlyValue.ts` and
`components/useColorScheme.ts` use the exact same trick.

Why they differ:
- Native has no browser `localStorage`, so the session must be persisted through
  `AsyncStorage` explicitly, and there's no URL to parse tokens out of
  (`detectSessionInUrl: false`).
- Web relies on the browser's own storage (default) and *does* need
  `detectSessionInUrl: true` to handle OAuth/magic-link redirects that return a
  token in the URL.

---

## 7. `components/` — shared UI and platform shims

Not all files here are visual components; some are platform-shim hooks that
happen to live in `components/` for historical Expo-template reasons.

- **`ExternalLink.tsx`** — wraps `expo-router`'s `Link` so that tapping an outside
  URL opens an in-app browser on native (`WebBrowser.openBrowserAsync`) but a real
  new tab on web (default `<a target="_blank">` behavior). One component, branching
  on `Platform.OS` internally rather than using two separate files — a good example
  of "when the difference is small, branch in one file; when it's structural, use
  `.web.ts`."

- **`useColorScheme.ts`** / **`useColorScheme.web.ts`** — native just re-exports
  React Native's built-in hook; the web version hard-codes `'light'` because
  server-side rendering has no OS theme to read.

- **`useClientOnlyValue.ts`** / **`useClientOnlyValue.web.ts`** — used once, in
  `(tabs)/_layout.tsx`, to decide whether the tab header is shown. On native it
  just returns the "client" value immediately (line 3 of the `.ts` file — no
  server exists). On web, it starts with the "server" value and swaps to the
  "client" value inside a `useEffect`, because Expo Router's web build does an
  initial static render pass where no client-only APIs are available yet — this
  avoids a hydration mismatch.

---

## 8. `constants/Colors.ts`

```ts
export default {
  light: { text: '#000', background: '#fff', tint: tintColorLight, ... },
  dark:  { text: '#fff', background: '#000', tint: tintColorDark,  ... },
};
```

A plain lookup table, indexed by the current color scheme (`Colors[colorScheme ??
'light'].tint` in `(tabs)/_layout.tsx:29`). This is the CLAUDE.md "no magic numbers"
rule applied to color values — hex codes only ever appear here, not scattered
through component `style` objects.

---

## 9. Full trace: cold start → authenticated home screen

Putting all the pieces together, here's the actual order of execution the first
time the app opens with a **valid saved session**:

1. `expo-router/entry` (via `package.json`'s `"main"`) scans `app/` and mounts
   `app/_layout.tsx`.
2. `RootLayout` (§3.1) blocks on font loading, holding the splash screen.
3. Fonts load → splash hides → `RootLayoutNav` renders a `Stack` offering
   `(auth)` and `(tabs)` as possible destinations, with `unstable_settings.
   initialRouteName = '(tabs)'` (line 14) as the starting guess.
4. `(tabs)/_layout.tsx` mounts, calls `useAuth()` (§5).
5. Inside `useAuth`, `getSession()` resolves — since there's a saved session in
   `AsyncStorage`, `session` is set and `loading` becomes `false`.
6. `(tabs)/_layout.tsx` re-renders: `loading` is false and `session` exists, so it
   renders the real `<Tabs>` navigator → `index.tsx` (§4.3) shows.

If instead there's **no saved session**, step 6 changes: `session` is `null`, so
`(tabs)/_layout.tsx` returns `<Redirect href="/(auth)/sign-in" />`, which mounts
`(auth)/_layout.tsx` → that layout's own `useAuth()` call also reports no session →
it renders its `<Stack>` → `sign-in.tsx` shows.

From there, if the user submits valid credentials:

7. `sign-in.tsx`'s `handleSignIn` (§4.1) calls `supabase.auth.signInWithPassword`.
8. Supabase's client fires `onAuthStateChange` internally.
9. **Every** mounted `useAuth()` instance receives that event and updates its own
   `session` state — right now that's just `(auth)/_layout.tsx`'s instance (since
   `(tabs)` isn't mounted yet).
10. `(auth)/_layout.tsx` re-renders, sees `session` is now truthy, and returns
    `<Redirect href="/(tabs)" />` — which mounts `(tabs)/_layout.tsx`, whose own
    `useAuth()` call immediately confirms the session and renders the tab bar.

No component ever explicitly calls a navigation function after sign-in — the
redirect gates in §3.2/§3.3 are what turn a state change into a screen change.

---

## 10. Patterns to expect as later phases land

These aren't built yet, but knowing the target shape now makes the diffs easier to
read when they land:

- **`hooks/usePosts.ts`** (Phase 1) will be the first hook that isn't about auth —
  it'll wrap TanStack Query's `useQuery`/`useMutation`, following the query-key
  convention from CLAUDE.md: `['posts', { feedType: 'proximity' }]`.
- **`types/database.ts`** will hold Supabase-generated types once the `posts` table
  exists, so `lib/supabase.ts`'s `createClient<Database>(...)` becomes fully typed
  instead of `any`-shaped responses.
- **`app/compose.tsx`** (or similar) will be the first screen with real business
  logic pushed into a hook rather than living in the component, per CLAUDE.md's
  "no business logic in components" rule — worth comparing against how thin
  `sign-in.tsx` already is.
