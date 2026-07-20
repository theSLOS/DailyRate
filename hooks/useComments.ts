import { supabase } from '@/lib/supabase';
import type { Comment, ExplorePost, ProfilePublicRow } from '@/types/posts';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type CommentWithAuthor = Comment & {
  author: Pick<ProfilePublicRow, 'username' | 'display_name' | 'avatar_url'>;
};

export function useComments(
  postId: string | undefined
): UseQueryResult<CommentWithAuthor[], PostgrestError> {
  return useQuery({
    queryKey: ['comments', { postId }],
    queryFn: async (): Promise<CommentWithAuthor[]> => {
      if (!postId) {
        throw new Error('Post ID is required');
      }
      const { data, error } = await supabase
        .from('comments')
        .select('*, author:profiles_public(username, display_name, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: postId !== undefined,
  });
}

type SubmitCommentInput = { postId: string; userId: string; body: string };
type SubmitCommentContext = {
  previousComments: CommentWithAuthor[] | undefined;
  previousPost: ExplorePost | null | undefined;
  postId: string;
};

export function useSubmitComment(): UseMutationResult<
  void,
  PostgrestError,
  SubmitCommentInput,
  SubmitCommentContext
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, userId, body }) => {
      const { error } = await supabase
        .from('comments')
        .insert({ post_id: postId, user_id: userId, body });
      if (error) {
        throw error;
      }
    },
    onMutate: async ({ postId, userId, body }) => {
      const commentsKey = ['comments', { postId }];
      const postKey = ['posts', { id: postId }];
      await queryClient.cancelQueries({ queryKey: commentsKey });
      await queryClient.cancelQueries({ queryKey: postKey });

      const previousComments = queryClient.getQueryData<CommentWithAuthor[]>(commentsKey);
      const previousPost = queryClient.getQueryData<ExplorePost | null>(postKey);

      const tempComment: CommentWithAuthor = {
        id: `temp-${Date.now()}`,
        post_id: postId,
        user_id: userId,
        parent_comment_id: null,
        body: body,
        created_at: new Date().toISOString(),
        author: {
          username: null,
          display_name: null,
          avatar_url: null,
        },
      };

      queryClient.setQueryData<CommentWithAuthor[]>(commentsKey, (old) => [
        ...(old ?? []),
        tempComment,
      ]);
      queryClient.setQueryData<ExplorePost | null>(postKey, (old) =>
        old ? { ...old, comment_count: old.comment_count + 1 } : old
      );

      return { previousComments, previousPost, postId };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      queryClient.setQueryData(['comments', { postId: context.postId }], context.previousComments);
      queryClient.setQueryData(['posts', { id: context.postId }], context.previousPost);
    },
    onSettled: (_data, _err, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', { postId }] });
      queryClient.invalidateQueries({ queryKey: ['posts', { id: postId }] });
    },
  });
}
