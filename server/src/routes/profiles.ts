import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';

export const profilesRouter = Router();

profilesRouter.get('/:id', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('profiles_public')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});
