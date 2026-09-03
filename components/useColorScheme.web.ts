/**
 * Web variant — always reports 'light', since RN styles don't support SSR
 * and there's no reliable server-side color scheme to read. See
 * useColorScheme.ts for the native variant.
 */

// RN styles don't support SSR; always return 'light' on server
/** Always returns 'light' (no SSR-safe way to read the real scheme on web). */
export function useColorScheme(): 'light' {
  return 'light';
}
