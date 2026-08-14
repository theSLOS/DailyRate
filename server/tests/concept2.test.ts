import assert from 'node:assert';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestJwt } from './helpers/getTestJwt.js';

const LIVE_WINDOW_HOURS = 36;

// anonymous photo paths are a bare <uuid>.jpg since the Phase 4.5 rework — the
// fixture mimics that shape to prove the path survives the anonymity strip
const FIXTURE_PHOTO_PATH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg';
const FIXTURE_MESSAGE = 'concept2 fixture — anonymous strip';

type FeedRow = {
  id: string;
  created_at: string;
  moderation_status: string;
  is_anonymous: boolean;
  user_id: string | null;
  photo_url: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  region_country_code: string | null;
  region_state_code: string | null;
};

type FeedArgs = {
  variant: 'newest' | 'most_liked' | 'state' | 'country';
  region_code?: string | null;
  cursor_ts?: string | null;
  page_size?: number;
};

// static process.env reads only — eslint-config-expo forbids dynamic indexing
// (it breaks Expo's build-time inlining of EXPO_PUBLIC_* vars)
function supabaseUrl(): string {
  const v = process.env.SUPABASE_URL;
  assert(v != null, 'SUPABASE_URL missing — check server/.env');
  return v;
}

function anonKey(): string {
  const v = process.env.SUPABASE_ANON_KEY;
  assert(v != null, 'SUPABASE_ANON_KEY missing — check server/.env');
  return v;
}

function headers(jwt: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: anonKey(),
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(jwt: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(jwt), ...(init.headers as Record<string, string>) },
  });
}

async function feedShared(jwt: string, args: FeedArgs): Promise<FeedRow[]> {
  const res = await rest(jwt, 'rpc/feed_shared', { method: 'POST', body: JSON.stringify(args) });
  const data: unknown = await res.json();
  if (!res.ok) throw new Error(`feed_shared failed: ${JSON.stringify(data)}`);
  return data as FeedRow[];
}

// the entry-window rule lives in the DB (get_entry_date, shared by the insert
// trigger and the update/delete policies) — read it rather than reimplement it
async function openEntryDate(jwt: string, userId: string): Promise<string | null> {
  const profRes = await rest(jwt, `profiles?select=timezone&id=eq.${userId}`);
  const prof = (await profRes.json()) as { timezone: string | null }[];
  const tz = prof[0]?.timezone ?? 'UTC';

  const res = await rest(jwt, 'rpc/get_entry_date', {
    method: 'POST',
    body: JSON.stringify({ ts: new Date().toISOString(), tz }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new Error(`get_entry_date failed: ${JSON.stringify(data)}`);
  return data as string | null;
}

async function expiredOwnPostIds(jwt: string, userId: string): Promise<string[]> {
  const res = await rest(jwt, `posts?select=id,created_at&user_id=eq.${userId}`);
  const data = (await res.json()) as { id: string; created_at: string }[];
  return data.filter((p) => ageHours(p.created_at) > LIVE_WINDOW_HOURS).map((p) => p.id);
}

function ageHours(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 3_600_000;
}

function uidFromJwt(jwt: string): string {
  const payload: unknown = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
  return (payload as { sub: string }).sub;
}

describe('Concept 2 — feed_shared is a viewer-independent feed source', () => {
  let jwtA: string;
  let jwtB: string;
  let uidA: string;
  let uidB: string;
  let feedA: FeedRow[];
  let feedB: FeedRow[];
  let anonFixtureId: string | null = null;
  let fixtureSkipReason: string | null = null;

  beforeAll(async () => {
    const emailA = process.env.TEST_ACCOUNT_1_EMAIL;
    const passwordA = process.env.TEST_ACCOUNT_1_PASSWORD;
    const emailB = process.env.TEST_ACCOUNT_2_EMAIL;
    const passwordB = process.env.TEST_ACCOUNT_2_PASSWORD;
    assert(
      emailA && passwordA && emailB && passwordB,
      'test account credentials missing — check server/.env.test.local'
    );

    jwtA = await getTestJwt(emailA, passwordA);
    jwtB = await getTestJwt(emailB, passwordB);
    uidA = uidFromJwt(jwtA);
    uidB = uidFromJwt(jwtB);

    const entryDate = await openEntryDate(jwtA, uidA);
    if (entryDate === null) {
      fixtureSkipReason = 'entry window is in the 12pm–4pm dead zone';
    } else {
      const res = await rest(jwtA, 'posts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: uidA,
          rating: 7,
          message: FIXTURE_MESSAGE,
          local_date: entryDate,
          is_anonymous: true,
          photo_url: FIXTURE_PHOTO_PATH,
        }),
      });
      if (res.ok) {
        anonFixtureId = ((await res.json()) as { id: string }[])[0].id;
      } else {
        fixtureSkipReason = `insert rejected (${res.status}) — account 1 may already have today's post`;
      }
    }

    feedA = await feedShared(jwtA, { variant: 'newest' });
    feedB = await feedShared(jwtB, { variant: 'newest' });
  });

  afterAll(async () => {
    if (anonFixtureId) {
      await rest(jwtA, `posts?id=eq.${anonFixtureId}`, { method: 'DELETE' });
    }
  });

  // the single property the whole Redis cache design rests on
  it('returns byte-identical rows to two different viewers', () => {
    expect(feedA).toEqual(feedB);
  });

  it("excludes the caller's own expired posts (owner bypass is gone)", async () => {
    const expiredA = await expiredOwnPostIds(jwtA, uidA);
    const expiredB = await expiredOwnPostIds(jwtB, uidB);
    expect(expiredA.length + expiredB.length).toBeGreaterThan(0);

    const idsA = new Set(feedA.map((r) => r.id));
    const idsB = new Set(feedB.map((r) => r.id));
    for (const id of expiredA) expect(idsA.has(id)).toBe(false);
    for (const id of expiredB) expect(idsB.has(id)).toBe(false);
  });

  // RLS enforces neither of these on this path any more — the RPC's where clause does
  it('returns only posts inside the 36h window', () => {
    for (const row of feedA) expect(ageHours(row.created_at)).toBeLessThan(LIVE_WINDOW_HOURS);
  });

  it('returns only approved posts', () => {
    for (const row of feedA) expect(row.moderation_status).toBe('approved');
  });

  describe('anonymity is stripped unconditionally', () => {
    it('created the anonymous fixture', (ctx) => {
      if (fixtureSkipReason !== null) ctx.skip(fixtureSkipReason);
      expect(anonFixtureId).not.toBeNull();
    });

    // the strip must not depend on auth.uid(): if it did, the author's own
    // request would cache their identity and serve it to everyone else
    it('hides the author from the author themselves', (ctx) => {
      if (fixtureSkipReason !== null) ctx.skip(fixtureSkipReason);
      const row = feedA.find((r) => r.id === anonFixtureId);
      expect(row, "fixture missing from its own author's feed").toBeDefined();
      expect(row?.user_id).toBeNull();
      expect(row?.author_username).toBeNull();
      expect(row?.author_display_name).toBeNull();
      expect(row?.author_avatar_url).toBeNull();
    });

    it('keeps photo_url — the path carries no identity post-rework', (ctx) => {
      if (fixtureSkipReason !== null) ctx.skip(fixtureSkipReason);
      const row = feedA.find((r) => r.id === anonFixtureId);
      expect(row?.photo_url).toBe(FIXTURE_PHOTO_PATH);
    });
  });

  describe('deliberate omissions — these assert accepted trade-offs, not bugs', () => {
    let blockedId: string | null = null;

    beforeAll(async () => {
      const other = feedA.find((r) => r.user_id !== null && r.user_id !== uidA);
      if (!other?.user_id) return;
      blockedId = other.user_id;
      await rest(jwtA, 'blocks', {
        method: 'POST',
        body: JSON.stringify({ blocker_id: uidA, blocked_id: blockedId }),
      });
    });

    afterAll(async () => {
      if (blockedId) {
        await rest(jwtA, `blocks?blocker_id=eq.${uidA}&blocked_id=eq.${blockedId}`, {
          method: 'DELETE',
        });
      }
    });

    // block filtering is client-side by design. If this goes red, someone moved it
    // server-side and made the feed per-viewer — i.e. uncacheable
    it("still returns a blocked user's post", async (ctx) => {
      if (blockedId === null) ctx.skip('no live post by another user to block against');
      const afterBlock = await feedShared(jwtA, { variant: 'newest' });
      expect(afterBlock.some((r) => r.user_id === blockedId)).toBe(true);
      expect(afterBlock).toEqual(feedB);
    });
  });

  describe('delete policy (entry window only)', () => {
    it("refuses another user's post", async (ctx) => {
      if (fixtureSkipReason !== null) ctx.skip(fixtureSkipReason);
      const res = await rest(jwtB, `posts?id=eq.${anonFixtureId}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      });
      expect(((await res.json()) as unknown[]).length).toBe(0);

      const still = await rest(jwtA, `posts?select=id&id=eq.${anonFixtureId}`);
      expect(((await still.json()) as unknown[]).length).toBe(1);
    });
  });

  describe('parameters', () => {
    it('filters by state when variant is state', async () => {
      const withState = feedA.find((r) => r.region_state_code !== null);
      if (!withState?.region_state_code) return;
      const rows = await feedShared(jwtA, {
        variant: 'state',
        region_code: withState.region_state_code,
      });
      for (const row of rows) expect(row.region_state_code).toBe(withState.region_state_code);
    });

    it('returns nothing for an unmatched region code', async () => {
      expect(await feedShared(jwtA, { variant: 'state', region_code: 'ZZ-NONE' })).toEqual([]);
    });

    it('honours page_size', async () => {
      const rows = await feedShared(jwtA, { variant: 'newest', page_size: 1 });
      expect(rows.length).toBeLessThanOrEqual(1);
    });

    it('excludes the cursor row itself when paginating', async () => {
      if (feedA.length === 0) return;
      const oldest = feedA[feedA.length - 1];
      const rows = await feedShared(jwtA, { variant: 'newest', cursor_ts: oldest.created_at });
      expect(rows.some((r) => r.id === oldest.id)).toBe(false);
    });
  });
});
