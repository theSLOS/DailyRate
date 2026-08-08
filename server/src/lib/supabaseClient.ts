import assert from 'node:assert';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.ts';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export function getClientForRequest(jwt: string): SupabaseClient<Database> {
  assert(SUPABASE_URL != null);
  assert(SUPABASE_ANON_KEY != null);
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
