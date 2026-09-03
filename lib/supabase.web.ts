/**
 * The single Supabase client instance for web — relies on the browser's own
 * storage (no AsyncStorage) and lets Supabase detect the session from the
 * URL, unlike the native variant in `supabase.ts`.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
