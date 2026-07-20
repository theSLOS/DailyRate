import { supabase } from '@/lib/supabase';
import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ExplorePost } from '@/types/posts';
import { useMutation, UseMutationResult, useQueryClient } from '@tanstack/react-query';

type ToggleLikeInput = { postId: string; userId: string; liked: boolean }; // liked = state BEFORE this toggle
type ToggleLikeContext = {
  previousLiked: boolean | undefined;
  previousPost: ExplorePost | null | undefined;
};

export function useLikeStatus(
  postId: string | undefined,
  userId: string | undefined
): UseQueryResult<boolean, PostgrestError> {
  return useQuery({
    queryKey: ['likes', { postId, userId }],
    queryFn: async (): Promise<boolean> => {
      if (!postId || !userId) {
        throw new Error('Post ID and User ID are required');
      }
      const { data, error } = await supabase
        .from('likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data !== null;
    },
    enabled: postId !== undefined && userId !== undefined,
  });
}

export function useToggleLike(): UseMutationResult<
  void,
  PostgrestError,
  ToggleLikeInput,
  ToggleLikeContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, userId, liked }) => {
      if (liked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: userId });
        if (error) throw error;
      }
    },
    onMutate: async ({ postId, userId, liked }) => {
      const likeKey = ['likes', { postId, userId }];
      const postKey = ['posts', { id: postId }];
      await queryClient.cancelQueries({ queryKey: likeKey });
      await queryClient.cancelQueries({ queryKey: postKey });

      const previousLiked = queryClient.getQueryData<boolean>(likeKey);
      const previousPost = queryClient.getQueryData<ExplorePost | null>(postKey);

      queryClient.setQueryData<boolean>(likeKey, !liked);
      queryClient.setQueryData<ExplorePost | null>(postKey, (old) =>
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
