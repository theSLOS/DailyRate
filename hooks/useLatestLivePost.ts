import type { FeedPost } from '@/types/posts';
import type { UseQueryResult } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import { requireDefined } from '@/utils/requireDefined';

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
