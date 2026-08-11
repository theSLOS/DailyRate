import { useInfiniteQuery, UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import type { FeedPost } from '@/types/posts';
import { FEED_PAGE_SIZE, POST_POLL_INTERVAL_MS } from '@/constants/posts';
import { useHiddenPostsIds } from './useHiddenPosts';
import { requireDefined } from '@/utils/requireDefined';

export function useFriendsFeed(
  userId: string | undefined
): UseInfiniteQueryResult<InfiniteData<FeedPost[], string | undefined>, PostgrestError> {
  const { data: hiddenIds } = useHiddenPostsIds();

  return useInfiniteQuery({
    queryKey: ['posts', { scope: 'friends', userId }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam: cursor }): Promise<FeedPost[]> => {
      requireDefined(userId, 'User ID is required');

      // the view already restricts to this viewer's friends; no user_id filter here,
      // which would drop friends' anonymous posts (their user_id is nulled by the view)
      let query = supabase
        .from('posts_feed_friends')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(FEED_PAGE_SIZE);
      if (cursor) query = query.lt('created_at', cursor);

      const { data, error } = await query;
      if (error) throw error;
      return data as FeedPost[];
    },
    getNextPageParam: (lastPage) =>
      lastPage.length < FEED_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].created_at,
    select: (data) => ({
      ...data,
      pages: data.pages.map((page) => page.filter((p) => !hiddenIds?.has(p.id))),
    }),
    enabled: userId !== undefined,
    refetchInterval: POST_POLL_INTERVAL_MS,
  });
}
