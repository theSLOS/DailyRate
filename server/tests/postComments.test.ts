import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { restFetch, createLivePostFromPool, deletePost } from './helpers/fixtures.js';

const app = createApp();

describe('GET /api/posts/:id/comments', () => {
  let sessions: TestSession[];
  let fixtureId: string | null = null;
  let fixtureJwt: string | null = null;
  let skipReason: string | null = null;
  let commentId: string | null = null;

  beforeAll(async () => {
    sessions = await loadTestSessions();
    const result = await createLivePostFromPool(sessions, 'postComments fixture');
    fixtureId = result.postId;
    fixtureJwt = result.jwt;
    skipReason = result.skipReason;

    if (fixtureId !== null && fixtureJwt !== null) {
      const commenter = sessions.find((s) => s.jwt !== fixtureJwt) ?? sessions[0];
      const res = await restFetch(commenter.jwt, 'comments', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          post_id: fixtureId,
          user_id: commenter.userId,
          body: 'postComments fixture comment',
        }),
      });
      if (res.ok) commentId = ((await res.json()) as { id: string }[])[0].id;
    }
  });

  afterAll(async () => {
    if (commentId !== null)
      await restFetch(sessions[0].jwt, `comments?id=eq.${commentId}`, { method: 'DELETE' });
    if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/posts/00000000-0000-0000-0000-000000000000/comments');
    expect(res.status).toBe(401);
  });

  it('returns the joined comment with its author, visible to any viewer', async (ctx) => {
    if (skipReason !== null) ctx.skip(skipReason);
    assert(fixtureId !== null && commentId !== null);
    const viewer = sessions.find((s) => s.jwt !== fixtureJwt) ?? sessions[0];

    const res = await request(app)
      .get(`/api/posts/${fixtureId}/comments`)
      .set('Authorization', `Bearer ${viewer.jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const row = (res.body as { id: string; author: unknown }[]).find((c) => c.id === commentId);
    expect(row).toBeDefined();
    expect(row?.author).toBeDefined();
  });
});
