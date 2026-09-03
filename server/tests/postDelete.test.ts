import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { createLivePostFromPool, deletePost, openEntryDate } from './helpers/fixtures.js';

const app = createApp();

describe('DELETE /api/posts/:id', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions();
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).delete('/api/posts/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });

  describe('with a real post', () => {
    let fixtureId: string | null = null;
    let fixtureJwt: string | null = null;
    let skipReason: string | null = null;

    beforeAll(async () => {
      const result = await createLivePostFromPool(sessions, 'postDelete fixture');
      fixtureId = result.postId;
      fixtureJwt = result.jwt;
      skipReason = result.skipReason;
    });

    // a no-op if the happy-path test below already consumed the fixture —
    // deleting a nonexistent row isn't an error at the REST layer this uses
    afterAll(async () => {
      if (fixtureId !== null && fixtureJwt !== null) await deletePost(fixtureJwt, fixtureId);
    });

    it('another account cannot delete it', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureId !== null && fixtureJwt !== null);
      const other = sessions.find((s) => s.jwt !== fixtureJwt);
      assert(other, 'need a second account');

      const res = await request(app)
        .delete(`/api/posts/${fixtureId}`)
        .set('Authorization', `Bearer ${other.jwt}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');

      // confirm it survived the failed cross-account attempt, not just that
      // the delete call itself returned the right status code
      const check = await request(app)
        .get(`/api/posts/${fixtureId}`)
        .set('Authorization', `Bearer ${fixtureJwt}`);
      expect(check.body?.id).toBe(fixtureId);
    });

    it('the owner can delete it, inside the entry window', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureId !== null && fixtureJwt !== null);

      const res = await request(app)
        .delete(`/api/posts/${fixtureId}`)
        .set('Authorization', `Bearer ${fixtureJwt}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fixtureId);
    });

    it('deleting the same post again returns 404, not a silent success', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);
      assert(fixtureId !== null && fixtureJwt !== null);

      const res = await request(app)
        .delete(`/api/posts/${fixtureId}`)
        .set('Authorization', `Bearer ${fixtureJwt}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('an out-of-window post', () => {
    it("can't be deleted, even by its owner", async (ctx) => {
      const session = sessions[0];

      // when the entry window is open, this excludes today's own post and
      // leaves only genuinely older ones; in the 12pm-4pm dead zone
      // openEntryDate returns null, which every real local_date fails to
      // equal — so ANY of this account's posts qualifies, which is exactly
      // correct: nothing is deletable for anyone during the dead zone either
      const entryDate = await openEntryDate(session.jwt, session.userId);

      const historyRes = await request(app)
        .get('/api/me/posts/history')
        .set('Authorization', `Bearer ${session.jwt}`);
      assert(historyRes.status === 200);

      const outOfWindow = (historyRes.body as { id: string; local_date: string }[]).find(
        (p) => p.local_date !== entryDate
      );
      if (!outOfWindow) {
        ctx.skip("no out-of-window post exists in this account's history to test against");
      }
      assert(outOfWindow);

      const res = await request(app)
        .delete(`/api/posts/${outOfWindow.id}`)
        .set('Authorization', `Bearer ${session.jwt}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
