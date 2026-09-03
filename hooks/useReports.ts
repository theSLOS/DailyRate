/**
 * Submits a moderation report against a post, comment, or user.
 */
import { supabase } from '@/lib/supabase';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { useMutation } from '@tanstack/react-query';

export type ReportTargetType = 'post' | 'comment' | 'user';

type SubmitReportInput = {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
};

/** Fire-and-forget: inserts a report row, no client-side read of reports exists. */
export function useSubmitReport(): UseMutationResult<void, PostgrestError, SubmitReportInput> {
  return useMutation({
    mutationFn: async ({ reporterId, targetType, targetId, reason }) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: reporterId,
        target_type: targetType,
        target_id: targetId,
        reason,
      });
      if (error) {
        throw error;
      }
    },
  });
}
