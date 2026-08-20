import assert from 'node:assert';

export async function getTestJwt(email: string, password: string): Promise<string> {
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

  return (data as { access_token: string }).access_token;
}

export function uidFromJwt(jwt: string): string {
  const payload: unknown = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
  return (payload as { sub: string }).sub;
}
