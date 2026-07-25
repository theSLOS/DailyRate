import { useInfiniteQuery, UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import type { FeedPost } from '@/types/posts';
import { POST_POLL_INTERVAL_MS } from '@/constants/posts';
import { useHiddenPostsIds } from './useHiddenPosts';

const PAGE_SIZE = 20;

export function useExploreFeed(
  userId: string | undefined
): UseInfiniteQueryResult<InfiniteData<FeedPost[], string | undefined>, PostgrestError> {
  const { data: hiddenIds } = useHiddenPostsIds();

  return useInfiniteQuery({
    queryKey: ['posts', { scope: 'explore' }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam: cursor }): Promise<FeedPost[]> => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      let query = supabase
        .from('posts_feed')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as FeedPost[];
    },
    getNextPageParam: (lastPage) => {
      return lastPage.length < PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].created_at;
    },
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) =>
        page.filter((p) => p.user_id !== userId && !hiddenIds?.has(p.id))
      ),
    }),
    enabled: userId !== undefined,
    refetchInterval: POST_POLL_INTERVAL_MS,
  });
}
