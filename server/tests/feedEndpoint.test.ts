import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { createLivePostFromPool, deletePost } from './helpers/fixtures.js';

const app = createApp();
const FIXTURE_MESSAGE = 'feedEndpoint fixture — GET /api/feed';

type FeedBody = {
  posts: { id: string; created_at: string; user_id: string | null }[];
  nextCursor: string | null;
};

async function getFeed(token: string, query: string): Promise<{ status: number; body: FeedBody }> {
  const res = await request(app).get(`/api/feed${query}`).set('Authorization', `Bearer ${token}`);
  return { status: res.status, body: res.body as FeedBody };
}

describe('GET /api/feed', () => {
  let sessions: TestSession[];
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    sessions = await loadTestSessions();
    tokenA = sessions[0].jwt;
    tokenB = sessions[1].jwt;
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/feed?variant=newest');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  describe('parameter validation', () => {
    it.each([
      ['', 'variant must be one of'],
      ['?variant=nope', 'variant must be one of'],
      ['?variant=newest&variant=state', 'variant must appear at most once'],
      ['?variant=state', 'region is required'],
      ['?variant=country', 'region is required'],
      ['?variant=newest&region=AU-NSW', 'region is only valid'],
      ['?variant=most_liked&cursor=2026-08-20T00:00:00Z', 'cursor is not valid'],
      ['?variant=newest&cursor=banana', 'cursor must be a valid ISO 8601'],
      ['?variant=newest&limit=0', 'limit must be an integer'],
      ['?variant=newest&limit=51', 'limit must be an integer'],
      ['?variant=newest&limit=abc', 'limit must be an integer'],
      ['?variant=newest&limit=20abc', 'limit must be an integer'],
    ])('rejects "%s"', async (query, fragment) => {
      const res = await request(app)
        .get(`/api/feed${query}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PARAM');
      expect(res.body.error.message).toContain(fragment);
    });
  });

  describe('content', () => {
    let fixtureId: string | null = null;
    let fixtureJwt: string | null = null;
    let skipReason: string | null = null;

    beforeAll(async () => {
      const result = await createLivePostFromPool(sessions, FIXTURE_MESSAGE);
      fixtureId = result.postId;
      fixtureJwt = result.jwt;

      if (result.skipReason !== null) {
        // a pre-existing live post from any account serves just as well —
        // the fixture only matters because an empty feed passes everything vacuously
        const { body } = await getFeed(tokenA, '?variant=newest&limit=1');
        skipReason = body.posts.length === 0 ? result.skipReason : null;
      }
    });

    afterAll(async () => {
      // must be the account that created it — the delete policy is owner-scoped
      if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
    });

    // the property the whole Redis cache design rests on, asserted at the HTTP
    // layer this time rather than at the RPC
    it('serves identical bodies to two different viewers', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const a = await getFeed(tokenA, '?variant=newest');
      const b = await getFeed(tokenB, '?variant=newest');

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.posts.length).toBeGreaterThan(0);
      expect(a.body).toEqual(b.body);
    });

    it('honours limit and emits a cursor when the page is full', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const { status, body } = await getFeed(tokenA, '?variant=newest&limit=1');

      expect(status).toBe(200);
      expect(body.posts).toHaveLength(1);
      expect(body.nextCursor).toBe(body.posts[0].created_at);
    });

    it('excludes the cursor row from the next page', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const first = await getFeed(tokenA, '?variant=newest&limit=1');
      assert(first.body.nextCursor !== null, 'expected a cursor from a full page');

      const cursor = first.body.nextCursor;
      const second = await getFeed(tokenA, `?variant=newest&cursor=${encodeURIComponent(cursor)}`);

      expect(second.status).toBe(200);
      expect(second.body.posts.map((p) => p.id)).not.toContain(first.body.posts[0].id);

      // holds whether page 2 has rows or not — with a single live post in the
      // window an empty page 2 is correct, not a pagination failure
      for (const post of second.body.posts) {
        expect(Date.parse(post.created_at)).toBeLessThan(Date.parse(cursor));
      }
    });

    it('never emits a cursor for most_liked', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const { status, body } = await getFeed(tokenA, '?variant=most_liked&limit=1');

      expect(status).toBe(200);
      expect(body.nextCursor).toBeNull();
    });
  });
});
