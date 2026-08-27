import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';

const app = createApp();

describe('GET /api/region', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions(1);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/region?lat=0&lng=0');
    expect(res.status).toBe(401);
  });

  it.each([
    ['?lng=0', 'lat and lng must both be numbers'],
    ['?lat=0', 'lat and lng must both be numbers'],
    ['?lat=abc&lng=0', 'lat and lng must both be numbers'],
  ])('rejects "%s"', async (query, fragment) => {
    const res = await request(app)
      .get(`/api/region${query}`)
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain(fragment);
  });

  // Sydney, AU — real coordinates so this exercises the actual RPC rather than
  // an arbitrary ocean point; not asserting the exact match since the seeded
  // region_boundaries data isn't this suite's concern
  it('resolves real coordinates without error', async () => {
    const res = await request(app)
      .get('/api/region?lat=-33.8688&lng=151.2093')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
  });
});
