import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';

const app = createApp();

describe('GET /api/friends/*', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions(2);
  });

  it.each(['/requests', '/ids', '/list'])(
    '%s rejects a request with no Authorization header',
    async (path) => {
      const res = await request(app).get(`/api/friends${path}`);
      expect(res.status).toBe(401);
    }
  );

  it("GET /requests returns an array of the caller's own pending requests", async () => {
    const res = await request(app)
      .get('/api/friends/requests')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /ids returns a flat array of friend ids, not row objects', async () => {
    const res = await request(app)
      .get('/api/friends/ids')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const id of res.body as unknown[]) expect(typeof id).toBe('string');
  });

  it('GET /list returns an array with embedded friend profiles', async () => {
    const res = await request(app)
      .get('/api/friends/list')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const row of res.body as { friend: unknown }[]) expect(row.friend).toBeDefined();
  });

  it('GET /count rejects a missing userId', async () => {
    const res = await request(app)
      .get('/api/friends/count')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAM');
  });

  it('GET /count returns a number for a real user', async () => {
    const res = await request(app)
      .get(`/api/friends/count?userId=${sessions[0].userId}`)
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('number');
  });
});
