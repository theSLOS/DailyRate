import { PostgrestError } from '@supabase/supabase-js';
import {
  UseMutationResult,
  UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { requireDefined } from '@/utils/requireDefined';

export function useBlockStatus(
  blockedUserId: string | undefined
): UseQueryResult<boolean, PostgrestError> {
  return useQuery({
    queryKey: ['blocks', { blockedUserId }],
    queryFn: async (): Promise<boolean> => {
      const id = requireDefined(blockedUserId, 'Blocked User ID needed');
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('blocked_id', id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return !!data;
    },
    enabled: blockedUserId !== undefined,
  });
}

type ToggleBlockInput = { blockerId: string; blockedUserId: string; isCurrentlyBlocked: boolean };

export function useToggleBlock(): UseMutationResult<void, PostgrestError, ToggleBlockInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ blockerId, blockedUserId, isCurrentlyBlocked }) => {
      if (isCurrentlyBlocked) {
        const { error } = await supabase
          .from('blocks')
          .delete()
          .eq('blocker_id', blockerId)
          .eq('blocked_id', blockedUserId);
        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('blocks')
          .insert({ blocker_id: blockerId, blocked_id: blockedUserId });
        if (error) {
          throw error;
        }
      }
    },
    onSuccess: (_data, { blockedUserId }) => {
      queryClient.invalidateQueries({ queryKey: ['blocks', { blockedUserId }] });
    },
  });
}
