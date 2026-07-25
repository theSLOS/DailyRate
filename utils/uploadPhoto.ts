import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';

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
