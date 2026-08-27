import assert from 'node:assert';

export type FreshSession = { accessToken: string; expiresAt: number }; // expiresAt: unix seconds

export async function getTestJwt(email: string, password: string): Promise<FreshSession> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  assert(supabaseUrl != null, 'SUPABASE_URL missing — check server/.env');
  assert(anonKey != null, 'SUPABASE_ANON_KEY missing — check server/.env');

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data: unknown = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to get test JWT for ${email}: ${JSON.stringify(data)}`);
  }

  const { access_token, expires_at, expires_in } = data as {
    access_token: string;
    expires_at?: number;
    expires_in?: number;
  };
  // expires_at (unix seconds) is what GoTrue actually returns; expires_in
  // (seconds from now) is the fallback in case that ever changes shape
  const expiresAt = expires_at ?? Math.floor(Date.now() / 1000) + (expires_in ?? 3600);

  return { accessToken: access_token, expiresAt };
}

export function uidFromJwt(jwt: string): string {
  const payload: unknown = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
  return (payload as { sub: string }).sub;
}
