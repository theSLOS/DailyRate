/**
 * Fetches a given user's most recent live (36h-window) post, used e.g. to
 * link straight to someone's latest entry.
 */
import type { FeedPost } from '@/types/posts';
import type { UseQueryResult } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import { requireDefined } from '@/utils/requireDefined';

/** Fetches the given user's latest live post, or null if they have none right now. */
export function useLatestLivePost(
  userId: string | undefined
): UseQueryResult<FeedPost | null, ApiError> {
  return useQuery({
    queryKey: ['posts', { latestByUser: userId }],
    queryFn: async (): Promise<FeedPost | null> => {
      const id = requireDefined(userId, 'User ID is required');
      return apiGet<FeedPost | null>(`/api/posts/latest?userId=${id}`);
    },
    enabled: userId !== undefined,
  });
}
