import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { restFetch, createLivePostFromPool, deletePost } from './helpers/fixtures.js';

const app = createApp();

describe('GET /api/me/posts/today', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions();
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/me/posts/today?localDate=2026-01-01');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a missing localDate', async () => {
    const res = await request(app)
      .get('/api/me/posts/today')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAM');
  });

  it('returns null for a date with no post', async () => {
    const res = await request(app)
      .get('/api/me/posts/today?localDate=1999-01-01')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  describe('with a real post', () => {
    let fixtureId: string | null = null;
    let fixtureJwt: string | null = null;
    let fixtureDate: string | null = null;
    let skipReason: string | null = null;

    beforeAll(async () => {
      const result = await createLivePostFromPool(sessions, 'mePosts fixture — today');
      fixtureId = result.postId;
      fixtureJwt = result.jwt;
      skipReason = result.skipReason;

      if (fixtureId !== null && fixtureJwt !== null) {
        const res = await restFetch(fixtureJwt, `posts?id=eq.${fixtureId}&select=local_date`);
        const rows = (await res.json()) as { local_date: string }[];
        fixtureDate = rows[0]?.local_date ?? null;
      }
    });

    afterAll(async () => {
      if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
    });

    it('created the fixture', (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      expect(fixtureId).not.toBeNull();
    });

    it("returns the caller's own post for that date", async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureJwt !== null && fixtureDate !== null);

      const res = await request(app)
        .get(`/api/me/posts/today?localDate=${fixtureDate}`)
        .set('Authorization', `Bearer ${fixtureJwt}`);

      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(fixtureId);
    });

    it("never returns another account's post for the same date", async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureDate !== null);
      const other = sessions.find((s) => s.jwt !== fixtureJwt);
      assert(other, 'need a second account to prove isolation');

      const res = await request(app)
        .get(`/api/me/posts/today?localDate=${fixtureDate}`)
        .set('Authorization', `Bearer ${other.jwt}`);

      expect(res.status).toBe(200);
      expect(res.body?.id).not.toBe(fixtureId);
    });
  });
});

describe('GET /api/me/posts/history', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions(2);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/me/posts/history');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the caller’s own posts, most recent local_date first', async () => {
    const res = await request(app)
      .get('/api/me/posts/history')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const dates = (res.body as { local_date: string }[]).map((p) => p.local_date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('never returns another account’s posts', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/api/me/posts/history').set('Authorization', `Bearer ${sessions[0].jwt}`),
      request(app).get('/api/me/posts/history').set('Authorization', `Bearer ${sessions[1].jwt}`),
    ]);

    const idsA = new Set((a.body as { id: string }[]).map((p) => p.id));
    const idsB = new Set((b.body as { id: string }[]).map((p) => p.id));

    expect([...idsA].filter((id) => idsB.has(id))).toHaveLength(0);
  });
});
