import type { ExplorePost } from '@/types/posts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export function usePost(
  postId: string | undefined
): UseQueryResult<ExplorePost | null, PostgrestError> {
  return useQuery({
    queryKey: ['posts', { id: postId }],
    queryFn: async (): Promise<ExplorePost | null> => {
      if (!postId) {
        throw new Error('Post ID is required');
      }
      const { data, error } = await supabase
        .from('posts')
        .select('*, author:profiles_public(username, display_name, avatar_url)')
        .eq('id', postId)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data;
    },
    enabled: postId !== undefined,
  });
}
