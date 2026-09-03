/**
 * Post reads and writes: single post / latest / like status / comments,
 * plus create-or-edit (upsert), delete, and like/unlike.
 */
import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { AppError } from '../lib/errors.js';
import { requireUserId } from '../middleware/requireAuth.js';

export const postsRouter = Router();

// registered before /:id — otherwise "/latest" would match :id="latest" first
/** The given user's most recent live post, or null. */
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

/** One post by id, or null if it doesn't exist / isn't visible to the caller. */
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
/** Whether the caller has liked the given post. */
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
/** A post's comments, flat and joined with each author's public profile. */
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

type UpsertPostBody = {
  rating: number;
  message: string;
  photoUrl?: string | null;
  localDate: string;
  isAnonymous: boolean;
  regionCountryCode: string | null;
  regionStateCode: string | null;
  placeLabel: string | null;
};

// shape check only — the DB's own constraints (rating range, non-null
// message, get_entry_date's window) are still the real enforcement, this
// just turns an obviously-malformed request into a 400 instead of a
// confusing 502 SUPABASE_ERROR
/** Validates and narrows a raw request body into an UpsertPostBody, or throws 400. */
function parseUpsertPostBody(body: unknown): UpsertPostBody {
  const b = body as Partial<UpsertPostBody>;
  if (
    typeof b.rating !== 'number' ||
    typeof b.message !== 'string' ||
    typeof b.localDate !== 'string'
  ) {
    throw new AppError(400, 'INVALID_PARAM', 'rating, message, and localDate are required');
  }
  return {
    rating: b.rating,
    message: b.message,
    photoUrl: b.photoUrl ?? null,
    localDate: b.localDate,
    isAnonymous: b.isAnonymous ?? false,
    regionCountryCode: b.regionCountryCode ?? null,
    regionStateCode: b.regionStateCode ?? null,
    placeLabel: b.placeLabel ?? null,
  };
}

/** Creates or updates the caller's post for the given local_date (upsert on user_id + local_date). */
postsRouter.post('/', async (req, res) => {
  const userId = requireUserId(req);
  const body = parseUpsertPostBody(req.body);

  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('posts')
    .upsert(
      {
        user_id: userId, // from requireUserId(req) — NOT req.body.userId
        rating: body.rating,
        message: body.message,
        photo_url: body.photoUrl,
        local_date: body.localDate, // trusted from the client, per this decision
        is_anonymous: body.isAnonymous,
        region_country_code: body.regionCountryCode,
        region_state_code: body.regionStateCode,
        place_label: body.placeLabel,
      },
      { onConflict: 'user_id,local_date' }
    )
    .select()
    .single();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.json(data);
});

/** Deletes a post, only possible while it's still inside its entry window (RLS-enforced). */
postsRouter.delete('/:id', async (req, res) => {
  requireUserId(req); // fails fast on a missing/malformed JWT — ownership itself is RLS's job, not this route's

  const client = getClientForRequest(req.jwt);
  const { data, error } = await client
    .from('posts')
    .delete()
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  if (data === null)
    throw new AppError(404, 'NOT_FOUND', 'Post not found or not deletable right now');
  res.json(data);
});

/** Likes a post as the caller. */
postsRouter.put('/:id/like', async (req, res) => {
  const userId = requireUserId(req);
  const client = getClientForRequest(req.jwt);
  const { error } = await client.from('likes').insert({ post_id: req.params.id, user_id: userId });
  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.status(204).send();
});

/** Unlikes a post as the caller (a no-op, not an error, if it wasn't liked). */
postsRouter.delete('/:id/like', async (req, res) => {
  const userId = requireUserId(req);
  const client = getClientForRequest(req.jwt);
  const { error } = await client
    .from('likes')
    .delete()
    .eq('post_id', req.params.id)
    .eq('user_id', userId);
  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);
  res.status(204).send();
});
