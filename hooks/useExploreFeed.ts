import { useInfiniteQuery, UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ExplorePost } from '@/types/posts';

const PAGE_SIZE = 20;

export function useExploreFeed(
  userId: string | undefined
): UseInfiniteQueryResult<InfiniteData<ExplorePost[], string | undefined>, PostgrestError> {
  return useInfiniteQuery({
    queryKey: ['posts', { scope: 'explore' }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam: cursor }): Promise<ExplorePost[]> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      let query = supabase
        .from('posts')
        .select('*, author:profiles_public(username, display_name, avatar_url)')
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
