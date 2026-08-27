import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { restFetch, createLivePostFromPool, deletePost } from './helpers/fixtures.js';

const app = createApp();

describe('GET /api/posts/:id/like', () => {
  let sessions: TestSession[];
  let fixtureId: string | null = null;
  let fixtureJwt: string | null = null;
  let skipReason: string | null = null;

  beforeAll(async () => {
    sessions = await loadTestSessions();
    const result = await createLivePostFromPool(sessions, 'postLikeStatus fixture');
    fixtureId = result.postId;
    fixtureJwt = result.jwt;
    skipReason = result.skipReason;
  });

  afterAll(async () => {
    if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/posts/00000000-0000-0000-0000-000000000000/like');
    expect(res.status).toBe(401);
  });

  it("reflects the caller's own like, not the post owner's", async (ctx) => {
    if (skipReason !== null) ctx.skip(skipReason);
    assert(fixtureId !== null);
    const liker = sessions.find((s) => s.jwt !== fixtureJwt);
    assert(liker, 'need a second account to like as');

    const before = await request(app)
      .get(`/api/posts/${fixtureId}/like`)
      .set('Authorization', `Bearer ${liker.jwt}`);
    expect(before.status).toBe(200);
    expect(before.body).toBe(false);

    const insertRes = await restFetch(liker.jwt, 'likes', {
      method: 'POST',
      body: JSON.stringify({ post_id: fixtureId, user_id: liker.userId }),
    });
    assert(insertRes.ok, `like insert failed: ${insertRes.status}`);

    try {
      const after = await request(app)
        .get(`/api/posts/${fixtureId}/like`)
        .set('Authorization', `Bearer ${liker.jwt}`);
      expect(after.status).toBe(200);
      expect(after.body).toBe(true);

      // the post owner never liked their own post — must stay false even
      // though the post now has one like from someone else
      const ownerView = await request(app)
        .get(`/api/posts/${fixtureId}/like`)
        .set('Authorization', `Bearer ${fixtureJwt}`);
      expect(ownerView.body).toBe(false);
    } finally {
      await restFetch(liker.jwt, `likes?post_id=eq.${fixtureId}&user_id=eq.${liker.userId}`, {
        method: 'DELETE',
      });
    }
  });
});
