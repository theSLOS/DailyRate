import type { Database } from '@/types/database';
import { getEntryDate } from '@/utils/getEntryDate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
type Post = Database['public']['Tables']['posts']['Row'];
type UpsertPostInput = {
  userId: string;
  rating: number;
  message: string;
  photoUrl?: string | null;
};

export function useTodayPost(): UseQueryResult<Post | null, PostgrestError> {
  const entryDate = getEntryDate(new Date());

  return useQuery({
    queryKey: ['posts', { localDate: entryDate }],
    queryFn: async (): Promise<Post | null> => {
      if (!entryDate) {
        return null;
      }
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('local_date', entryDate)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data;
    },
    enabled: entryDate !== null,
  });
}

export function useUpsertPost(): UseMutationResult<Post, PostgrestError, UpsertPostInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertPostInput): Promise<Post> => {
      const entryDate = getEntryDate(new Date());
      if (!entryDate) {
        throw new Error('Invalid date');
      }

      const { data, error } = await supabase
        .from('posts')
        .upsert(
          {
            user_id: input.userId,
            rating: input.rating,
            message: input.message,
            photo_url: input.photoUrl ?? null,
            local_date: entryDate,
          },
          { onConflict: 'user_id,local_date' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
