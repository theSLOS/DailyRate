import assert from 'node:assert';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getTestJwt } from './helpers/getTestJwt.js';

const app = createApp();

describe('Concept 1 — JWT-forwarding plumbing (GET /api/me/profile)', () => {
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
      const email1 = process.env.TEST_ACCOUNT_1_EMAIL;
      const password1 = process.env.TEST_ACCOUNT_1_PASSWORD;
      const email2 = process.env.TEST_ACCOUNT_2_EMAIL;
      const password2 = process.env.TEST_ACCOUNT_2_PASSWORD;
      assert(
        email1 && password1 && email2 && password2,
        'test account credentials missing — check server/.env.test.local (see .env.test.example)'
      );

      token1 = await getTestJwt(email1, password1);
      token2 = await getTestJwt(email2, password2);
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
