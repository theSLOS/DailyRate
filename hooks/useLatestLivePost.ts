import type { FeedPost } from '@/types/posts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export function useLatestLivePost(
  userId: string | undefined
): UseQueryResult<FeedPost | null, PostgrestError> {
  return useQuery({
    queryKey: ['posts', { latestByUser: userId }],
    queryFn: async (): Promise<FeedPost | null> => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const { data, error } = await supabase
        .from('posts_feed')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data as FeedPost | null;
    },
    enabled: userId !== undefined,
  });
}
