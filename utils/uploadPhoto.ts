import { supabase } from '@/lib/supabase';

export async function uploadPhoto(
  localUri: string,
  userId: string,
  entryDate: string
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const path = `${userId}/${entryDate}.jpg`;

  const { error } = await supabase.storage
    .from('post-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });

  if (error) {
    throw error;
  }

  return path;
}
