/**
 * Read and write the current user's own daily post: today's entry (open
 * during the entry window) and the create/edit/delete mutations.
 */
import { getEntryDate } from '@/utils/getEntryDate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, ApiError, apiPost, apiDelete } from '@/lib/apiClient';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import type { Post } from '@/types/posts';
import { requireDefined } from '@/utils/requireDefined';
type UpsertPostInput = {
  userId: string;
  rating: number;
  message: string;
  photoUrl?: string | null;
  isAnonymous: boolean;
  regionCountryCode: string | null;
  regionStateCode: string | null;
  placeLabel: string | null;
};

/** Fetches the current user's post for today's entry date, or null outside the window / with no post yet. */
export function useTodayPost(userId: string | undefined): UseQueryResult<Post | null, ApiError> {
  const entryDate = getEntryDate(new Date());

  return useQuery({
    queryKey: ['posts', { localDate: entryDate }],
    queryFn: async (): Promise<Post | null> => {
      if (!entryDate) {
        return null;
      }
      requireDefined(userId, 'User ID is required');
      return apiGet<Post | null>(`/api/me/posts/today?localDate=${entryDate}`);
    },
    enabled: entryDate !== null && userId !== undefined,
  });
}

/** Creates or updates today's post (upsert on user_id + local_date). */
export function useUpsertPost(): UseMutationResult<Post, ApiError, UpsertPostInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input): Promise<Post> => {
      const entryDate = requireDefined(getEntryDate(new Date()), 'Invalid date');

      return apiPost<Post>('/api/posts', {
        rating: input.rating,
        message: input.message,
        photoUrl: input.photoUrl ?? null,
        localDate: entryDate,
        isAnonymous: input.isAnonymous,
        regionCountryCode: input.regionCountryCode,
        regionStateCode: input.regionStateCode,
        placeLabel: input.placeLabel,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

/** Deletes a post, only possible while it's still inside its entry window ("unsend today's entry"). */
export function useDeletePost(): UseMutationResult<Post, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId): Promise<Post> => apiDelete<Post>(`/api/posts/${postId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts'] }),
  });
}
