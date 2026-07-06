import { supabase } from '@/lib/supabase';

export async function getSignedPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('post-photos').createSignedUrl(path, 3600); // URL expires in 1 hour

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
