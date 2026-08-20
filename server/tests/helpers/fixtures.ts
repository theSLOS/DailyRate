import assert from 'node:assert';
import type { TestSession } from './accounts.js';

// static process.env reads only — eslint-config-expo forbids dynamic indexing
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

export async function restFetch(
  jwt: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey(),
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
  });
}

// deliberately sends the publishable key and NO Authorization header — this is
// exactly what anyone who extracts the key from the Expo bundle can do
export async function anonFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey(),
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string>),
    },
  });
}

export async function anonRows(path: string): Promise<unknown[]> {
  const res = await anonFetch(path);
  const data: unknown = await res.json();
  return Array.isArray(data) ? data : [];
}

// the entry-window rule lives in the DB (get_entry_date, shared by the insert
// trigger and the update/delete policies) — read it rather than reimplement it
export async function openEntryDate(jwt: string, userId: string): Promise<string | null> {
  const profRes = await restFetch(jwt, `profiles?select=timezone&id=eq.${userId}`);
  const prof = (await profRes.json()) as { timezone: string | null }[];
  const tz = prof[0]?.timezone ?? 'UTC';

  const res = await restFetch(jwt, 'rpc/get_entry_date', {
    method: 'POST',
    body: JSON.stringify({ ts: new Date().toISOString(), tz }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new Error(`get_entry_date failed: ${JSON.stringify(data)}`);
  return data as string | null;
}

export type FixtureResult = { postId: string | null; skipReason: string | null };

// returns a skipReason rather than throwing: a closed entry window and an
// already-used slot are both expected states, not test failures
export async function createLivePost(
  jwt: string,
  userId: string,
  message: string
): Promise<FixtureResult> {
  const entryDate = await openEntryDate(jwt, userId);
  if (entryDate === null) {
    return { postId: null, skipReason: 'entry window is in the 12pm–4pm dead zone' };
  }

  const res = await restFetch(jwt, 'posts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, rating: 7, message, local_date: entryDate }),
  });

  if (!res.ok) {
    return {
      postId: null,
      skipReason: `insert rejected (${res.status}) — the account may already have today's post`,
    };
  }
  return { postId: ((await res.json()) as { id: string }[])[0].id, skipReason: null };
}

export async function deletePost(jwt: string, postId: string): Promise<void> {
  await restFetch(jwt, `posts?id=eq.${postId}`, { method: 'DELETE' });
}

export type PoolFixture = {
  postId: string | null;
  jwt: string | null;
  skipReason: string | null;
};

// unique(user_id, local_date) caps each account at one post per day, so a
// single-account fixture skips for a reason that has nothing to do with the
// system being wrong. Walking the pool means the only surviving skip is the
// 12pm–4pm dead zone, which is a real property worth skipping for.
export async function createLivePostFromPool(
  sessions: TestSession[],
  message: string
): Promise<PoolFixture> {
  let lastReason = 'no test accounts configured';

  for (const session of sessions) {
    const result = await createLivePost(session.jwt, session.userId, message);
    if (result.postId !== null) {
      return { postId: result.postId, jwt: session.jwt, skipReason: null };
    }
    lastReason = result.skipReason ?? lastReason;

    // the dead zone is a property of the clock, not the account — every
    // account in the same timezone will fail identically, so stop early
    if (result.skipReason?.includes('dead zone') === true) break;
  }

  return { postId: null, jwt: null, skipReason: lastReason };
}
