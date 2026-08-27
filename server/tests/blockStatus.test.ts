import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';
import { restFetch } from './helpers/fixtures.js';

const app = createApp();

describe('GET /api/blocks/:userId/status', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions(2);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/blocks/00000000-0000-0000-0000-000000000000/status');
    expect(res.status).toBe(401);
  });

  it('reflects a real block, and is invisible from the blocked side', async () => {
    const [blocker, blocked] = sessions;

    const insertRes = await restFetch(blocker.jwt, 'blocks', {
      method: 'POST',
      body: JSON.stringify({ blocker_id: blocker.userId, blocked_id: blocked.userId }),
    });
    expect(insertRes.ok).toBe(true);

    try {
      const fromBlocker = await request(app)
        .get(`/api/blocks/${blocked.userId}/status`)
        .set('Authorization', `Bearer ${blocker.jwt}`);
      expect(fromBlocker.status).toBe(200);
      expect(fromBlocker.body).toBe(true);

      // blocks' SELECT RLS only exposes blocker_id = auth.uid() — the blocked
      // party can never discover they've been blocked through this endpoint
      const fromBlocked = await request(app)
        .get(`/api/blocks/${blocker.userId}/status`)
        .set('Authorization', `Bearer ${blocked.jwt}`);
      expect(fromBlocked.status).toBe(200);
      expect(fromBlocked.body).toBe(false);
    } finally {
      await restFetch(
        blocker.jwt,
        `blocks?blocker_id=eq.${blocker.userId}&blocked_id=eq.${blocked.userId}`,
        { method: 'DELETE' }
      );
    }
  });
});
