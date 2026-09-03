/**
 * Fetches a single post by id (own post at any age, or anyone's live +
 * approved post), polling while mounted so like/comment counts stay fresh.
 */
import type { FeedPost } from '@/types/posts';
import type { UseQueryResult } from '@tanstack/react-query';
import { apiGet, ApiError } from '@/lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import { POST_POLL_INTERVAL_MS } from '@/constants/posts';
import { requireDefined } from '@/utils/requireDefined';

/** Fetches one post by id, or null if it doesn't exist/isn't visible to the caller. */
export function usePost(postId: string | undefined): UseQueryResult<FeedPost | null, ApiError> {
  return useQuery({
    queryKey: ['posts', { id: postId }],
    queryFn: async (): Promise<FeedPost | null> => {
      const id = requireDefined(postId, 'Post ID is required');
      return apiGet<FeedPost | null>(`/api/posts/${id}`);
    },
    enabled: postId !== undefined,
    refetchInterval: POST_POLL_INTERVAL_MS,
  });
}
