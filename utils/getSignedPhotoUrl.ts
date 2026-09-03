/**
 * Mints a fresh, time-limited signed URL for a post photo stored in the
 * private `post-photos` Storage bucket.
 */
import { supabase } from '@/lib/supabase';

/** Requests a signed read URL (1h expiry) for the given Storage object path. */
export async function getSignedPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('post-photos').createSignedUrl(path, 3600); // URL expires in 1 hour

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
