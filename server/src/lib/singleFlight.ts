type SingleFlightResult<T> = { value: T; joined: boolean };

const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<SingleFlightResult<T>> {
  const excisting = inFlight.get(key);
  if (excisting) {
    return excisting.then((value) => ({ value: value as T, joined: true }));
  }

  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);

  return promise.then((value) => ({ value, joined: false }));
}
