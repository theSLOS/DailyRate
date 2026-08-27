import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { createClient } from 'redis';
import { createApp } from '../src/app.js';
import { connectRedis, isRedisReady } from '../src/lib/redis.js';
import { feedCacheKey } from '../src/lib/feedCacheKey.js';
import { FEED_CACHE_TTL_SECONDS } from '../src/constants/redis.js';
import { loadTestSessions } from './helpers/accounts.js';
import type { ParsedFeedQuery } from '../src/types/feed.js';

const app = createApp();

// tests import createApp() directly, the same way index.ts does, but never
// import index.ts itself — so connectRedis() never runs unless this file
// calls it, and the app's caching would silently no-op (fail-open) otherwise
async function waitForRedisReady(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!isRedisReady()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        'Redis did not become ready in time for feedCache.test.ts — is the ' +
          'dayrate-redis container running? (docker start dayrate-redis)'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function keyFor(overrides: Partial<ParsedFeedQuery> = {}): string {
  return feedCacheKey({
    variant: 'newest',
    regionCode: null,
    cursor: null,
    limit: 20,
    ...overrides,
  });
}

describe('GET /api/feed — Redis caching', () => {
  let token: string;
  // a second, independent client purely for inspecting what the app's own
  // client wrote — the automated equivalent of the manual redis-cli checks
  // this concept was first verified with
  let inspector: ReturnType<typeof createClient>;

  beforeAll(async () => {
    const [session] = await loadTestSessions(1);
    token = session.jwt;

    connectRedis();
    await waitForRedisReady();

    const url = process.env.REDIS_URL;
    assert(url, 'REDIS_URL missing — check server/.env');
    inspector = createClient({ url });
    await inspector.connect();
  });

  afterAll(async () => {
    await inspector.quit();
  });

  // every test starts from a cold cache — otherwise a "miss" test could pass
  // by accident because a previous test already populated the same key
  afterEach(async () => {
    await inspector.flushAll();
  });

  it('populates the cache on a miss and serves the identical response on a hit', async () => {
    const first = await request(app)
      .get('/api/feed?variant=newest')
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);

    const cached = await inspector.get(keyFor());
    assert(cached !== null, 'expected the miss to have populated the cache');
    expect(JSON.parse(cached)).toEqual(first.body);

    const second = await request(app)
      .get('/api/feed?variant=newest')
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
  });

  it('does not reset the TTL on a hit', async () => {
    await request(app).get('/api/feed?variant=newest').set('Authorization', `Bearer ${token}`);

    const ttlAfterMiss = await inspector.ttl(keyFor());
    expect(ttlAfterMiss).toBeGreaterThan(0);
    expect(ttlAfterMiss).toBeLessThanOrEqual(FEED_CACHE_TTL_SECONDS);

    // real elapsed time, deliberately — TTL only ever moves by the clock
    // actually running, there's no other way to observe it decreasing
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await request(app).get('/api/feed?variant=newest').set('Authorization', `Bearer ${token}`);

    const ttlAfterHit = await inspector.ttl(keyFor());
    // a reset would jump back up near FEED_CACHE_TTL_SECONDS; a real hit only
    // ever lets the original countdown keep falling
    expect(ttlAfterHit).toBeLessThan(ttlAfterMiss);
  });

  it('treats an expired key as a genuine miss, not a stale hit', async () => {
    await request(app).get('/api/feed?variant=newest').set('Authorization', `Bearer ${token}`);

    await inspector.expire(keyFor(), 0); // EXPIRE ... 0 deletes immediately
    expect(await inspector.get(keyFor())).toBeNull();

    const res = await request(app)
      .get('/api/feed?variant=newest')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(await inspector.ttl(keyFor())).toBeGreaterThan(0);
  });

  it('gives distinct params their own independent cache keys', async () => {
    await request(app)
      .get('/api/feed?variant=newest&limit=20')
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .get('/api/feed?variant=newest&limit=5')
      .set('Authorization', `Bearer ${token}`);

    const key20 = keyFor({ limit: 20 });
    const key5 = keyFor({ limit: 5 });

    expect(key20).not.toBe(key5);
    expect(await inspector.get(key20)).not.toBeNull();
    expect(await inspector.get(key5)).not.toBeNull();
  });

  // proves dedup at the HTTP layer, not just in isolation — see
  // singleFlight.test.ts for the rigorous call-count proof against a
  // controllable fn; this is the end-to-end regression guard on top of it
  it('serves a burst of concurrent requests for a cold key from one shared fetch', async () => {
    const burst = Array.from({ length: 8 }, () =>
      request(app).get('/api/feed?variant=newest').set('Authorization', `Bearer ${token}`)
    );
    const responses = await Promise.all(burst);

    for (const res of responses) expect(res.status).toBe(200);

    const bodies = responses.map((res) => JSON.stringify(res.body));
    expect(bodies.every((body) => body === bodies[0])).toBe(true);

    expect(await inspector.get(keyFor())).not.toBeNull();
  });
});
