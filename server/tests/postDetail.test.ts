import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { createLivePostFromPool, deletePost } from './helpers/fixtures.js';

const app = createApp();

describe('GET /api/posts/:id', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions();
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/posts/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });

  it('returns null for a nonexistent id, not a 404', async () => {
    const res = await request(app)
      .get('/api/posts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  describe('with a real post', () => {
    let fixtureId: string | null = null;
    let fixtureJwt: string | null = null;
    let skipReason: string | null = null;

    beforeAll(async () => {
      const result = await createLivePostFromPool(sessions, 'postDetail fixture');
      fixtureId = result.postId;
      fixtureJwt = result.jwt;
      skipReason = result.skipReason;
    });

    afterAll(async () => {
      if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
    });

    it('returns the post to its own author', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureId !== null && fixtureJwt !== null);

      const res = await request(app)
        .get(`/api/posts/${fixtureId}`)
        .set('Authorization', `Bearer ${fixtureJwt}`);

      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(fixtureId);
    });

    it('returns the same live post to a different viewer', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureId !== null);
      const other = sessions.find((s) => s.jwt !== fixtureJwt);
      assert(other, 'need a second account');

      const res = await request(app)
        .get(`/api/posts/${fixtureId}`)
        .set('Authorization', `Bearer ${other.jwt}`);

      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(fixtureId);
    });
  });
});

describe('GET /api/posts/latest', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions();
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/posts/latest?userId=x');
    expect(res.status).toBe(401);
  });

  it('rejects a missing userId', async () => {
    const res = await request(app)
      .get('/api/posts/latest')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAM');
  });

  describe('with a real post', () => {
    let fixtureId: string | null = null;
    let fixtureJwt: string | null = null;
    let fixtureUserId: string | null = null;
    let skipReason: string | null = null;

    beforeAll(async () => {
      const result = await createLivePostFromPool(sessions, 'postDetail fixture — latest');
      fixtureId = result.postId;
      fixtureJwt = result.jwt;
      skipReason = result.skipReason;
      fixtureUserId = sessions.find((s) => s.jwt === fixtureJwt)?.userId ?? null;
    });

    afterAll(async () => {
      if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
    });

    it("returns that account's latest post to another viewer", async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureId !== null && fixtureUserId !== null);
      const other = sessions.find((s) => s.jwt !== fixtureJwt);
      assert(other, 'need a second account');

      const res = await request(app)
        .get(`/api/posts/latest?userId=${fixtureUserId}`)
        .set('Authorization', `Bearer ${other.jwt}`);

      expect(res.status).toBe(200);
      expect(res.body?.id).toBe(fixtureId);
    });
  });
});
