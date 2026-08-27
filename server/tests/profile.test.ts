import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadTestSessions, type TestSession } from './helpers/accounts.js';

const app = createApp();

describe('GET /api/profiles/:id', () => {
  let sessions: TestSession[];

  beforeAll(async () => {
    sessions = await loadTestSessions(1);
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get(`/api/profiles/${sessions[0].userId}`);
    expect(res.status).toBe(401);
  });

  it('returns a real profile for a real id, readable cross-account', async () => {
    const res = await request(app)
      .get(`/api/profiles/${sessions[0].userId}`)
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(res.body?.id).toBe(sessions[0].userId);
  });

  it('returns null for a nonexistent id', async () => {
    const res = await request(app)
      .get('/api/profiles/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${sessions[0].jwt}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
