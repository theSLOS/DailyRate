import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { parseFeedQuery } from '../lib/parseFeedQuery.js';
import { AppError } from '../lib/errors.js';
import type { FeedResponse, FeedSharedRow, ParsedFeedQuery } from '../types/feed.js';

export const feedRouter = Router();

feedRouter.get('/', async (req, res) => {
  const params = parseFeedQuery(req.query);

  const client = getClientForRequest(req.jwt);

  const { data, error } = await client.rpc('feed_shared', {
    variant: params.variant,
    region_code: params.regionCode ?? undefined,
    cursor_ts: params.cursor ?? undefined,
    page_size: params.limit,
  });

  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);

  const posts = data as FeedSharedRow[];
  res.json({ posts, nextCursor: nextCursorFor(params, posts) } satisfies FeedResponse);
});

function nextCursorFor(params: ParsedFeedQuery, rows: FeedSharedRow[]): string | null {
  if (params.variant === 'most_liked') return null;
  if (rows.length < params.limit) return null;

  return rows[rows.length - 1].created_at;
}
