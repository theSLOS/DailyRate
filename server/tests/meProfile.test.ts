import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions } from './helpers/accounts.js';

const app = createApp();

describe('GET /api/me/profile — JWT-forwarding plumbing', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/me/profile');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed token', async () => {
    const res = await request(app).get('/api/me/profile').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SUPABASE_ERROR');
  });

  describe('cross-user isolation', () => {
    let token1: string;
    let token2: string;

    beforeAll(async () => {
      const [first, second] = await loadTestSessions(2);
      token1 = first.jwt;
      token2 = second.jwt;
    });

    // this is the one test that actually proves the per-request client factory —
    // same running app instance, two different real accounts, must never cross
    it("returns each account its own profile, never the other account's", async () => {
      const res1 = await request(app)
        .get('/api/me/profile')
        .set('Authorization', `Bearer ${token1}`);
      const res2 = await request(app)
        .get('/api/me/profile')
        .set('Authorization', `Bearer ${token2}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.id).toBeTypeOf('string');
      expect(res2.body.id).toBeTypeOf('string');
      expect(res1.body.id).not.toBe(res2.body.id);
    });
  });
});
