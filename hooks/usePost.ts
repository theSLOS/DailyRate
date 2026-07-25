import type { FeedPost } from '@/types/posts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { POST_POLL_INTERVAL_MS } from '@/constants/posts';

export function usePost(
  postId: string | undefined
): UseQueryResult<FeedPost | null, PostgrestError> {
  return useQuery({
    queryKey: ['posts', { id: postId }],
    queryFn: async (): Promise<FeedPost | null> => {
      if (!postId) {
        throw new Error('Post ID is required');
      }
      const { data, error } = await supabase
        .from('posts_feed')
        .select('*')
        .eq('id', postId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data as FeedPost | null;
    },
    enabled: postId !== undefined,
    refetchInterval: POST_POLL_INTERVAL_MS,
  });
}
