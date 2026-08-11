import { ProfilePublicRow } from '@/types/posts';
import { PostgrestError } from '@supabase/supabase-js';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { requireDefined } from '@/utils/requireDefined';

export function useProfile(
  userId: string | undefined
): UseQueryResult<ProfilePublicRow | null, PostgrestError> {
  return useQuery({
    queryKey: ['profiles', { id: userId }],
    queryFn: async (): Promise<ProfilePublicRow | null> => {
      const id = requireDefined(userId, 'No User Id');
      const { data, error } = await supabase
        .from('profiles_public')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      return data;
    },
    enabled: userId !== undefined,
  });
}
