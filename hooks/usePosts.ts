import { getEntryDate } from '@/utils/getEntryDate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Post } from '@/types/posts';
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

export function useTodayPost(
  userId: string | undefined
): UseQueryResult<Post | null, PostgrestError> {
  const entryDate = getEntryDate(new Date());

  return useQuery({
    queryKey: ['posts', { localDate: entryDate }],
    queryFn: async (): Promise<Post | null> => {
      if (!entryDate) {
        return null;
      }
      if (!userId) {
        throw new Error('User ID is required');
      }
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('local_date', entryDate)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }
      return data;
    },
    enabled: entryDate !== null && userId !== undefined,
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
            is_anonymous: input.isAnonymous,
            region_country_code: input.regionCountryCode,
            region_state_code: input.regionStateCode,
            place_label: input.placeLabel,
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
