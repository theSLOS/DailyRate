import { ProfilePublicRow } from '@/types/posts';
import { PostgrestError } from '@supabase/supabase-js';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useProfile(
  userId: string | undefined
): UseQueryResult<ProfilePublicRow | null, PostgrestError> {
  return useQuery({
    queryKey: ['profiles', { id: userId }],
    queryFn: async (): Promise<ProfilePublicRow | null> => {
      if (!userId) {
        throw new Error('No User Id');
      }
      const { data, error } = await supabase
        .from('profiles_public')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      return data;
    },
    enabled: userId !== undefined,
  });
}
