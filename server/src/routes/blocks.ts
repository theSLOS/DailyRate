import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';

export const blocksRouter = Router();

// no explicit blocker_id filter, matching the client hook it replaces — RLS on
// `blocks` already scopes SELECT to blocker_id = auth.uid() only (Phase 4
// blocking Concept 1), so this can't leak whether someone else blocked :userId
blocksRouter.get('/:userId/status', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('blocks')
    .select('*')
    .eq('blocked_id', req.params.userId)
    .maybeSingle();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data !== null);
});
