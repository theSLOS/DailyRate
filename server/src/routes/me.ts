import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';

export const meRouter = Router();

meRouter.get('/profile', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client.from('profiles').select('*').single();

  if (error) {
    throw new AppError(502, 'SUPABASE_ERROR', error.message);
  }

  res.json(data);
});
