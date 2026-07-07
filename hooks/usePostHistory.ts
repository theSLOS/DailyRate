import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Post } from '@/types/posts';

export function usePostHistory(): UseQueryResult<Post[], PostgrestError> {
  return useQuery({
    queryKey: ['posts', { scope: 'history' }],
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('local_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
