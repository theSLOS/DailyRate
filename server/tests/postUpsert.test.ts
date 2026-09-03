import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { openEntryDate, deletePost } from './helpers/fixtures.js';

const app = createApp();

type OpenSlot = { session: TestSession; entryDate: string };

// walks the pool for an account whose entry window is currently open — same
// "the dead zone is a property of the clock, not the account" reasoning as
// createLivePostFromPool (helpers/fixtures.ts), but this suite creates its
// fixture THROUGH the route under test, not via a direct REST insert, since
// the creation itself is what's being verified here.
async function findOpenSlot(sessions: TestSession[]): Promise<OpenSlot | null> {
  for (const session of sessions) {
    const entryDate = await openEntryDate(session.jwt, session.userId);
    if (entryDate !== null) return { session, entryDate };
  }
  return null;
}

const DEAD_ZONE_SKIP = 'entry window is in the 12pm-4pm dead zone for every pooled account';

describe('POST /api/posts', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions();
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({ rating: 5, message: 'x', localDate: '2026-01-01' });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed body', async (ctx) => {
    const slot = await findOpenSlot(sessions);
    if (slot === null) ctx.skip(DEAD_ZONE_SKIP);
    assert(slot);

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${slot.session.jwt}`)
      .send({ message: 'missing rating and localDate' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAM');
  });

  describe('with an open entry window', () => {
    let slot: OpenSlot | null = null;
    let fixture: { id: string; user_id: string; rating: number } | null = null;
    let impersonatedId: string | null = null;

    beforeAll(async () => {
      slot = await findOpenSlot(sessions);
      if (slot === null) return;

      impersonatedId = sessions.find((s) => s.userId !== slot?.session.userId)?.userId ?? null;

      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${slot.session.jwt}`)
        .send({
          userId: impersonatedId, // attempted spoof — the server must ignore this
          rating: 7,
          message: 'postUpsert fixture',
          localDate: slot.entryDate,
          isAnonymous: false,
          regionCountryCode: null,
          regionStateCode: null,
          placeLabel: null,
        });

      if (res.status === 200) fixture = res.body;
    });

    afterAll(async () => {
      if (slot !== null && fixture !== null) await deletePost(slot.session.jwt, fixture.id);
    });

    it('created the fixture', (ctx) => {
      if (slot === null) ctx.skip(DEAD_ZONE_SKIP);
      expect(fixture).not.toBeNull();
    });

    it('derives user_id from the JWT, ignoring any value sent in the body', (ctx) => {
      if (slot === null) ctx.skip(DEAD_ZONE_SKIP);
      assert(slot && fixture, 'fixture was not created');

      expect(fixture.user_id).toBe(slot.session.userId);
      if (impersonatedId !== null) expect(fixture.user_id).not.toBe(impersonatedId);
    });

    it('upserts on (user_id, local_date) instead of creating a duplicate', async (ctx) => {
      if (slot === null) ctx.skip(DEAD_ZONE_SKIP);
      assert(slot && fixture, 'fixture was not created');

      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${slot.session.jwt}`)
        .send({
          rating: 2,
          message: 'postUpsert fixture — updated',
          localDate: slot.entryDate,
          isAnonymous: false,
          regionCountryCode: null,
          regionStateCode: null,
          placeLabel: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(fixture.id);
      expect(res.body.rating).toBe(2);
    });
  });
});
