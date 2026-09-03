/**
 * Collapses concurrent callers of the same key into one in-flight call, so
 * a burst of requests for a cold cache entry triggers exactly one fetch.
 */
type SingleFlightResult<T> = { value: T; joined: boolean };

const inFlight = new Map<string, Promise<unknown>>();

/** Runs fn for key, or joins an already-in-flight call for the same key instead of starting a new one. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<SingleFlightResult<T>> {
  const excisting = inFlight.get(key);
  if (excisting) {
    return excisting.then((value) => ({ value: value as T, joined: true }));
  }

  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);

  return promise.then((value) => ({ value, joined: false }));
}
