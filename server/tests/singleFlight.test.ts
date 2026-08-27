import { describe, it, expect, vi } from 'vitest';
import { singleFlight } from '../src/lib/singleFlight.js';

// a manually-resolvable promise — lets a test control exactly when the
// "work" finishes instead of racing real timers, so dedup can be proven
// deterministically rather than by luck
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// every test below uses its own key — singleFlight's in-flight map is a
// module-level singleton shared across this whole file, so a reused key
// would let one test's leftover state leak into the next
describe('singleFlight', () => {
  it('collapses concurrent calls for the same key into exactly one fn invocation', async () => {
    const work = deferred<string>();
    const fn = vi.fn(() => work.promise);

    const leader = singleFlight('collapse', fn);
    const follower1 = singleFlight('collapse', fn);
    const follower2 = singleFlight('collapse', fn);

    work.resolve('shared result');
    const [r1, r2, r3] = await Promise.all([leader, follower1, follower2]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ value: 'shared result', joined: false });
    expect(r2).toEqual({ value: 'shared result', joined: true });
    expect(r3).toEqual({ value: 'shared result', joined: true });
  });

  it('does not dedupe a second wave issued after the first has already resolved', async () => {
    const fn = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    const first = await singleFlight('sequential', fn);
    const second = await singleFlight('sequential', fn);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(first).toEqual({ value: 'first', joined: false });
    expect(second).toEqual({ value: 'second', joined: false });
  });

  it('does not dedupe across different keys', async () => {
    const fnA = vi.fn().mockResolvedValue('a');
    const fnB = vi.fn().mockResolvedValue('b');

    const [a, b] = await Promise.all([singleFlight('key-a', fnA), singleFlight('key-b', fnB)]);

    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ value: 'a', joined: false });
    expect(b).toEqual({ value: 'b', joined: false });
  });

  it('frees the key on failure instead of poisoning it, so a later call retries', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rpc exploded'))
      .mockResolvedValueOnce('recovered');

    await expect(singleFlight('retry-after-failure', fn)).rejects.toThrow('rpc exploded');

    const retry = await singleFlight('retry-after-failure', fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(retry).toEqual({ value: 'recovered', joined: false });
  });

  it('propagates a leader rejection to every follower waiting on it', async () => {
    const work = deferred<string>();
    const fn = vi.fn(() => work.promise);

    const leader = singleFlight('shared-failure', fn);
    const follower = singleFlight('shared-failure', fn);

    work.reject(new Error('boom'));

    await expect(leader).rejects.toThrow('boom');
    await expect(follower).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
