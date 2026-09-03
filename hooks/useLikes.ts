/**
 * Read and toggle whether the current user has liked a post — this app's
 * only optimistic mutation, flipping the like status and like_count ahead
 * of the network round trip and rolling back on failure.
 */
import { apiGet, ApiError, apiDelete, apiPut } from '@/lib/apiClient';
import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { FeedPost } from '@/types/posts';
import { useMutation, UseMutationResult, useQueryClient } from '@tanstack/react-query';

type ToggleLikeInput = { postId: string; userId: string; liked: boolean }; // liked = state BEFORE this toggle
type ToggleLikeContext = {
  previousLiked: boolean | undefined;
  previousPost: FeedPost | null | undefined;
};

/** Whether the current user has liked the given post. */
export function useLikeStatus(
  postId: string | undefined,
  userId: string | undefined
): UseQueryResult<boolean, ApiError> {
  return useQuery({
    queryKey: ['likes', { postId, userId }],
    // userId is kept as a param purely for the query key + enabled gate — the
    // server derives the caller's own id from the JWT, same as before this
    // moved off a direct `.eq('user_id', userId)` filter
    queryFn: async (): Promise<boolean> => {
      if (!postId || !userId) {
        throw new Error('Post ID and User ID are required');
      }
      return apiGet<boolean>(`/api/posts/${postId}/like`);
    },
    enabled: postId !== undefined && userId !== undefined,
  });
}

/** Likes or unlikes a post, optimistically flipping the cached status + like_count before the request resolves. */
export function useToggleLike(): UseMutationResult<
  void,
  ApiError,
  ToggleLikeInput,
  ToggleLikeContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, liked }) => {
      if (liked) {
        await apiDelete<void>(`/api/posts/${postId}/like`);
      } else {
        await apiPut<void>(`/api/posts/${postId}/like`);
      }
    },
    onMutate: async ({ postId, userId, liked }) => {
      const likeKey = ['likes', { postId, userId }];
      const postKey = ['posts', { id: postId }];
      await queryClient.cancelQueries({ queryKey: likeKey });
      await queryClient.cancelQueries({ queryKey: postKey });

      const previousLiked = queryClient.getQueryData<boolean>(likeKey);
      const previousPost = queryClient.getQueryData<FeedPost | null>(postKey);

      queryClient.setQueryData<boolean>(likeKey, !liked);
      queryClient.setQueryData<FeedPost | null>(postKey, (old) =>
        old ? { ...old, like_count: old.like_count + (!liked ? 1 : -1) } : old
      );

      return { previousLiked, previousPost };
    },
    onError: (_err, { postId, userId }, context) => {
      if (!context) return;
      queryClient.setQueryData(['likes', { postId, userId }], context.previousLiked);
      queryClient.setQueryData(['posts', { id: postId }], context.previousPost);
    },
    onSettled: (_data, _err, { postId, userId }) => {
      queryClient.invalidateQueries({ queryKey: ['likes', { postId, userId }] });
      queryClient.invalidateQueries({ queryKey: ['posts', { id: postId }] });
    },
  });
}
