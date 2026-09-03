/**
 * Fetches the current user's own full post history, no time filter.
 */
import { useQuery } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/apiClient';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Post } from '@/types/posts';
import { requireDefined } from '@/utils/requireDefined';

/** Fetches every post the current user has ever made, most recent first. */
export function usePostHistory(userId: string | undefined): UseQueryResult<Post[], ApiError> {
  return useQuery({
    queryKey: ['posts', { scope: 'history' }],
    queryFn: async (): Promise<Post[]> => {
      requireDefined(userId, 'User ID is required');
      return apiGet<Post[]>('/api/me/posts/history');
    },
    enabled: !!userId,
  });
}
