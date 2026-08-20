import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import {
  anonFetch,
  anonRows,
  createLivePostFromPool,
  deletePost,
  restFetch,
} from './helpers/fixtures.js';

// Regression suite for the 2026-08-20 finding: `posts`' SELECT policy passed
// its live branch for an unauthenticated caller, because `not exists (... where
// blocker_id = auth.uid() ...)` is TRUE when auth.uid() is null. Live posts,
// their authors, and the identity behind anonymous posts were all world-readable
// to anyone holding the publishable key — which ships in the Expo bundle.
//
// It went unnoticed for five weeks because every anon probe ran when nothing was
// inside the 36h window, and `[]` was read as proof of safety. So this suite
// proves the fixture is visible to someone FIRST, and only then asserts what anon
// cannot see. Without that ordering, every assertion below passes on an empty
// database.
const app = createApp();
const FIXTURE_MESSAGE = 'anon-view fixture — public post';
const FIXTURE_COMMENT = 'anon-view fixture — comment';

describe('anon visibility — what an unauthenticated caller can and cannot see', () => {
  let sessions: TestSession[];
  let owner: TestSession;
  let other: TestSession;
  let postId: string | null = null;
  let ownerJwt: string | null = null;
  let skipReason: string | null = null;

  beforeAll(async () => {
    sessions = await loadTestSessions();
    owner = sessions[0];
    other = sessions[1];

    const fixture = await createLivePostFromPool(sessions, FIXTURE_MESSAGE);
    postId = fixture.postId;
    ownerJwt = fixture.jwt;
    if (fixture.skipReason !== null) {
      skipReason = fixture.skipReason;
      return;
    }

    // engagement comes from the OTHER account: a comment and like by the post's
    // own author would still be visible to that author through the owner branch
    // of every policy, which is not the case under test
    const commentRes = await restFetch(other.jwt, 'comments', {
      method: 'POST',
      body: JSON.stringify({ post_id: postId, user_id: other.userId, body: FIXTURE_COMMENT }),
    });
    assert(commentRes.ok, `comment fixture failed: ${commentRes.status}`);

    const likeRes = await restFetch(other.jwt, 'likes', {
      method: 'POST',
      body: JSON.stringify({ post_id: postId, user_id: other.userId }),
    });
    assert(likeRes.ok, `like fixture failed: ${likeRes.status}`);
  });

  // deleting the post cascades the comment and the like. comments has no DELETE
  // policy at all, so this is the only way that row can be removed.
  afterAll(async () => {
    if (postId !== null && ownerJwt !== null) await deletePost(ownerJwt, postId);
  });

  describe('the fixture really is visible to an authenticated viewer', () => {
    it('serves the post through the gateway', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const res = await request(app)
        .get('/api/feed?variant=newest')
        .set('Authorization', `Bearer ${other.jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.posts.some((p: { id: string }) => p.id === postId)).toBe(true);
    });

    it('shows the comment and the like', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const comments = await (await restFetch(other.jwt, `comments?post_id=eq.${postId}`)).json();
      const likes = await (await restFetch(other.jwt, `likes?post_id=eq.${postId}`)).json();

      expect(comments).toHaveLength(1);
      expect(likes).toHaveLength(1);
    });
  });

  describe('anon cannot read', () => {
    it.each([
      ['posts', 'posts?select=id'],
      ['posts_feed', 'posts_feed?select=id'],
      ['posts_feed_friends', 'posts_feed_friends?select=id'],
      ['comments', 'comments?select=id'],
      ['likes', 'likes?select=post_id'],
      ['profiles', 'profiles?select=id'],
      ['blocks', 'blocks?select=blocker_id'],
      ['friendships', 'friendships?select=user_id'],
      ['friend_requests', 'friend_requests?select=requester_id'],
      ['reports', 'reports?select=id'],
      ['region_boundaries', 'region_boundaries?select=id'],
      // closed 20260820090000. It stays a plain view — the RLS bypass is what
      // renders cross-user author names — so an auth.uid() check was added
      // rather than security_invoker, which would have broken those names.
      ['profiles_public', 'profiles_public?select=id,username'],
    ])('%s returns no rows', async (_label, path) => {
      if (skipReason !== null) return;
      expect(await anonRows(path)).toEqual([]);
    });

    // security definer bypasses RLS, so the policy fix above cannot reach this
    // path — the in-body auth.uid() guard is the only thing closing it. It
    // raises rather than returning [] so a regression is loud, not silent.
    it('feed_shared raises 28000 rather than returning rows', async () => {
      const res = await anonFetch('rpc/feed_shared', {
        method: 'POST',
        body: JSON.stringify({ variant: 'newest' }),
      });
      const body = (await res.json()) as { code?: string };

      expect(res.ok).toBe(false);
      expect(body.code).toBe('28000');
    });

    it('the gateway rejects an unauthenticated feed request', async () => {
      const res = await request(app).get('/api/feed?variant=newest');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  // the same four columns must stay readable to a logged-in user: the view's
  // whole purpose is rendering post and comment authors across accounts, and
  // the obvious "fix" for the anon leak (security_invoker = on) would have
  // silently broken exactly this
  describe('an authenticated viewer still gets the profile directory', () => {
    it('profiles_public returns rows with a session', async () => {
      const res = await restFetch(other.jwt, 'profiles_public?select=id,username&limit=5');
      expect(((await res.json()) as unknown[]).length).toBeGreaterThan(0);
    });

    // posts_feed LEFT JOINs profiles_public, so a view that wrongly returns
    // nothing would not error — every author would quietly become null and the
    // app would label every post "Anonymous". Assert the name is really there.
    it('resolves another user as the author of a non-anonymous post', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const rows = (await (
        await restFetch(other.jwt, `posts_feed?select=id,author_display_name&id=eq.${postId}`)
      ).json()) as { author_display_name: string | null }[];

      expect(rows).toHaveLength(1);
      expect(rows[0].author_display_name).not.toBeNull();
    });
  });

  // guards the `is distinct from` half of the fix. Anon can no longer reach these
  // rows at all, so the strip is only observable between authenticated users —
  // which is exactly the behaviour that must not regress while fixing anon.
  describe('the anonymity strip still behaves for authenticated viewers', () => {
    beforeAll(async () => {
      if (skipReason !== null || postId === null || ownerJwt === null) return;
      await restFetch(ownerJwt, `posts?id=eq.${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_anonymous: true }),
      });
    });

    afterAll(async () => {
      if (skipReason !== null || postId === null || ownerJwt === null) return;
      await restFetch(ownerJwt, `posts?id=eq.${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_anonymous: false }),
      });
    });

    it('hides the author from another user', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const rows = (await (
        await restFetch(
          other.jwt,
          `posts_feed?select=id,user_id,author_display_name&id=eq.${postId}`
        )
      ).json()) as { user_id: string | null; author_display_name: string | null }[];

      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBeNull();
      expect(rows[0].author_display_name).toBeNull();
    });

    it('still shows the author to themselves', async (ctx) => {
      if (skipReason !== null) ctx.skip(skipReason);

      const rows = (await (
        await restFetch(owner.jwt, `posts_feed?select=id,user_id&id=eq.${postId}`)
      ).json()) as { user_id: string | null }[];

      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(owner.userId);
    });
  });
});
