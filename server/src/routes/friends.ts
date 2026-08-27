import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';
import { DEFAULT_PAGE_SIZE } from '../constants/feed.js';

export const friendsRouter = Router();

friendsRouter.get('/requests', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('friend_requests')
    .select(
      '*, requester:profiles_public!friend_requests_requester_id_fkey(id, username, display_name, avatar_url), addressee:profiles_public!friend_requests_addressee_id_fkey(id, username, display_name, avatar_url)'
    )
    .order('created_at', { ascending: false });

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});

// flat string[] of friend ids, not the {friend_id}[] row shape — the client
// just wraps this in `new Set(...)` directly instead of mapping first
friendsRouter.get('/ids', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client.from('friendships').select('friend_id');

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data.map((row) => row.friend_id));
});

friendsRouter.get('/list', async (req, res) => {
  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('friendships')
    .select(
      '*, friend:profiles_public!friendships_friend_id_fkey(id, username, display_name, avatar_url)'
    )
    .order('created_at', { ascending: false });

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});

friendsRouter.get('/count', async (req, res) => {
  const userId = req.query.userId;
  if (typeof userId !== 'string' || userId === '') {
    throw new AppError(400, 'INVALID_PARAM', 'userId is required');
  }

  const client = getClientForRequest(req.jwt);
  const { data, error } = await client.rpc('friend_count', { target_user_id: userId });

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});

// the view already restricts rows to this viewer's friends (RLS-equivalent at
// the view level) — no additional user_id filter here, which would incorrectly
// drop friends' anonymous posts (their user_id is nulled by the view)
friendsRouter.get('/feed', async (req, res) => {
  const cursor = req.query.cursor;
  if (cursor !== undefined && typeof cursor !== 'string') {
    throw new AppError(400, 'INVALID_PARAM', 'cursor must be a single string');
  }

  const client = getClientForRequest(req.jwt);
  let query = client
    .from('posts_feed_friends')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(DEFAULT_PAGE_SIZE);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});
