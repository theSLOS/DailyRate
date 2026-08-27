import { useInfiniteQuery, UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/apiClient';
import type { FeedPost } from '@/types/posts';
import { FEED_PAGE_SIZE, POST_POLL_INTERVAL_MS } from '@/constants/posts';
import { useHiddenPostsIds } from './useHiddenPosts';
import { requireDefined } from '@/utils/requireDefined';

export function useFriendsFeed(
  userId: string | undefined
): UseInfiniteQueryResult<InfiniteData<FeedPost[], string | undefined>, ApiError> {
  const { data: hiddenIds } = useHiddenPostsIds();

  return useInfiniteQuery({
    queryKey: ['posts', { scope: 'friends', userId }],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam: cursor }): Promise<FeedPost[]> => {
      requireDefined(userId, 'User ID is required');

      const path = cursor
        ? `/api/friends/feed?cursor=${encodeURIComponent(cursor)}`
        : '/api/friends/feed';
      return apiGet<FeedPost[]>(path);
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
