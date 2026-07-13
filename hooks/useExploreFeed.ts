import { useInfiniteQuery, UseInfiniteQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Post } from '@/types/posts';

const PAGE_SIZE = 20;

export function useExploreFeed(
  userId: string | undefined
): UseInfiniteQueryResult<Post[], PostgrestError> {
  return useInfiniteQuery({
    queryKey: ['posts', { scope: 'explore' }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam: cursor }): Promise<Post[]> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      let query = supabase
        .from('posts')
        .select('*')
        .neq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage) => {
      return lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].created_at;
    },
    enabled: userId !== undefined,
  });
}
