/**
 * The caller's own resources, id derived from the JWT rather than a
 * client-supplied param: profile, today's post, and full history.
 */
import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';
import { requireUserId } from '../middleware/requireAuth.js';

export const meRouter = Router();

/** The caller's own profile row. */
meRouter.get('/profile', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client.from('profiles').select('*').single();

  if (error) {
    throw new AppError(502, 'SUPABASE_ERROR', error.message);
  }

  res.json(data);
});

// localDate is computed client-side (utils/getEntryDate.ts mirrors the DB's
// get_entry_date) and passed in rather than recomputed here — this endpoint
// moves the call, not the business logic that decides "what day is it"
/** The caller's own post for the given local_date, or null. */
meRouter.get('/posts/today', async (req, res) => {
  const userId = requireUserId(req);
  const localDate = req.query.localDate;
  if (typeof localDate !== 'string' || localDate === '') {
    throw new AppError(400, 'INVALID_PARAM', 'localDate is required');
  }

  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('posts')
    .select('*')
    .eq('local_date', localDate)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});

// explicit user_id filter, same as the client hook it replaces — posts' RLS
// is "select own or live posts", so leaving this off would silently widen
// "my history" to include other users' live posts too (the exact Phase 3 bug)
/** The caller's own full post history, most recent local_date first. */
meRouter.get('/posts/history', async (req, res) => {
  const userId = requireUserId(req);
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .order('local_date', { ascending: false });

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});
