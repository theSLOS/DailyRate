import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { createLivePostFromPool, deletePost, restFetch } from './helpers/fixtures.js';

const app = createApp();

describe('PUT/DELETE /api/posts/:id/like', () => {
  let sessions: TestSession[];
  let fixtureId: string | null = null;
  let fixtureJwt: string | null = null;
  let skipReason: string | null = null;
  let liker: TestSession;

  beforeAll(async () => {
    sessions = await loadTestSessions();
    const result = await createLivePostFromPool(sessions, 'postLikeToggle fixture');
    fixtureId = result.postId;
    fixtureJwt = result.jwt;
    skipReason = result.skipReason;

    const found = sessions.find((s) => s.jwt !== fixtureJwt);
    assert(found, 'need a second account to like as');
    liker = found;
  });

  afterAll(async () => {
    if (fixtureId !== null) {
      // best-effort — cleans up a leftover like if an assertion failed
      // mid-test; a delete matching 0 rows is not an error
      await restFetch(liker.jwt, `likes?post_id=eq.${fixtureId}&user_id=eq.${liker.userId}`, {
        method: 'DELETE',
      });
    }
    if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
  });

  it('rejects a PUT with no Authorization header', async () => {
    const res = await request(app).put('/api/posts/00000000-0000-0000-0000-000000000000/like');
    expect(res.status).toBe(401);
  });

  it('likes, reflects in status + like_count, then unlikes back to baseline', async (ctx) => {
    if (skipReason !== null) ctx.skip(skipReason);
    assert(fixtureId !== null && fixtureJwt !== null);

    const before = await request(app)
      .get(`/api/posts/${fixtureId}`)
      .set('Authorization', `Bearer ${fixtureJwt}`);
    const baselineCount = before.body.like_count as number;

    const putRes = await request(app)
      .put(`/api/posts/${fixtureId}/like`)
      .set('Authorization', `Bearer ${liker.jwt}`);
    expect(putRes.status).toBe(204);

    const statusAfterLike = await request(app)
      .get(`/api/posts/${fixtureId}/like`)
      .set('Authorization', `Bearer ${liker.jwt}`);
    expect(statusAfterLike.body).toBe(true);

    const postAfterLike = await request(app)
      .get(`/api/posts/${fixtureId}`)
      .set('Authorization', `Bearer ${fixtureJwt}`);
    expect(postAfterLike.body.like_count).toBe(baselineCount + 1);

    const deleteRes = await request(app)
      .delete(`/api/posts/${fixtureId}/like`)
      .set('Authorization', `Bearer ${liker.jwt}`);
    expect(deleteRes.status).toBe(204);

    const statusAfterUnlike = await request(app)
      .get(`/api/posts/${fixtureId}/like`)
      .set('Authorization', `Bearer ${liker.jwt}`);
    expect(statusAfterUnlike.body).toBe(false);

    const postAfterUnlike = await request(app)
      .get(`/api/posts/${fixtureId}`)
      .set('Authorization', `Bearer ${fixtureJwt}`);
    expect(postAfterUnlike.body.like_count).toBe(baselineCount);
  });

  it('a duplicate like surfaces the unique-constraint violation as a 502, not a silent success', async (ctx) => {
    if (skipReason !== null) ctx.skip(skipReason);
    assert(fixtureId !== null);

    const first = await request(app)
      .put(`/api/posts/${fixtureId}/like`)
      .set('Authorization', `Bearer ${liker.jwt}`);
    expect(first.status).toBe(204);

    try {
      const second = await request(app)
        .put(`/api/posts/${fixtureId}/like`)
        .set('Authorization', `Bearer ${liker.jwt}`);
      expect(second.status).toBe(502);
      expect(second.body.error.code).toBe('SUPABASE_ERROR');
    } finally {
      await restFetch(liker.jwt, `likes?post_id=eq.${fixtureId}&user_id=eq.${liker.userId}`, {
        method: 'DELETE',
      });
    }
  });

  it('unliking when not liked is a 204 no-op, not an error', async (ctx) => {
    if (skipReason !== null) ctx.skip(skipReason);
    assert(fixtureId !== null);

    const res = await request(app)
      .delete(`/api/posts/${fixtureId}/like`)
      .set('Authorization', `Bearer ${liker.jwt}`);
    expect(res.status).toBe(204);
  });
});
