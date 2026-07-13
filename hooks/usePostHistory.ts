import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Post } from '@/types/posts';

export function usePostHistory(userId: string | undefined): UseQueryResult<Post[], PostgrestError> {
  return useQuery({
    queryKey: ['posts', { scope: 'history' }],
    queryFn: async (): Promise<Post[]> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', userId)
        .order('local_date', { ascending: false });
      if (error) throw error;

      return data;
    },
    enabled: !!userId,
  });
}
