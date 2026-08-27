import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';

const app = createApp();

describe('GET /api/friends/feed', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions(1);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/friends/feed');
    expect(res.status).toBe(401);
  });

  it('rejects a non-string cursor', async () => {
    const res = await request(app)
      .get('/api/friends/feed?cursor=2026-01-01&cursor=2026-01-02')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAM');
  });

  it('returns a bounded array without a cursor', async () => {
    const res = await request(app)
      .get('/api/friends/feed')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
