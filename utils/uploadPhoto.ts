/**
 * Uploads a local photo to the `post-photos` Storage bucket under a random
 * UUID path (bucket-wide write policy — identity comes from the unguessable
 * path, not a per-user folder).
 */
import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';

/** Uploads the photo at localUri to Storage and returns its new object path. */
export async function uploadPhoto(localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const path = `${Crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from('post-photos')
    .upload(path, blob, { contentType: 'image/jpeg' });

  if (error) {
    throw error;
  }

  return path;
}
