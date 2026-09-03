/**
 * Native variant of the client/server value selector — native has no
 * server/build-time render, so this just always returns the client value.
 * See useClientOnlyValue.web.ts for the web variant.
 */

// This function is web-only as native doesn't currently support server (or build-time) rendering.
/** Returns the client value (native has no server render to differ from). */
export function useClientOnlyValue<S, C>(server: S, client: C): S | C {
  return client;
}
