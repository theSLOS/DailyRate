import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';
import { requireUserId } from '../middleware/requireAuth.js';

export const postsRouter = Router();

// registered before /:id — otherwise "/latest" would match :id="latest" first
postsRouter.get('/latest', async (req, res) => {
  const userId = req.query.userId;
  if (typeof userId !== 'string' || userId === '') {
    throw new AppError(400, 'INVALID_PARAM', 'userId is required');
  }

  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('posts_feed')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});

postsRouter.get('/:id', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('posts_feed')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});

// caller's own like status — userId comes from the JWT, not the query
// string, unlike the old client hook which took it as a plain argument
postsRouter.get('/:id/like', async (req, res) => {
  const userId = requireUserId(req);
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('likes')
    .select('id')
    .eq('post_id', req.params.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data !== null);
});

// returns the flat joined rows, unprocessed — buildCommentTree (utils/buildCommentTree.ts)
// stays purely client-side, same as before this endpoint existed
postsRouter.get('/:id/comments', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('comments')
    .select('*, author:profiles_public(username, display_name, avatar_url)')
    .eq('post_id', req.params.id)
    .order('created_at', { ascending: true });

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});
