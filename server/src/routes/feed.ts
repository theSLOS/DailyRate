/**
 * The shared-feed endpoint (GET /api/feed) — read-through Redis cache in
 * front of the viewer-independent feed_shared RPC, with single-flight
 * collapsing on the miss path so a burst of requests for a cold key only
 * triggers one fetch.
 */
import { Router } from 'express';
import { getClientForRequest } from '../lib/supabaseClient.js';
import { parseFeedQuery } from '../lib/parseFeedQuery.js';
import { AppError } from '../lib/errors.js';
import type { FeedResponse, FeedSharedRow, ParsedFeedQuery } from '../types/feed.js';
import { feedCacheKey } from '../lib/feedCacheKey.js';
import { getCache, setCache } from '../lib/redis.js';
import { FEED_CACHE_TTL_SECONDS } from '../constants/redis.js';
import { singleFlight } from '../lib/singleFlight.js';

export const feedRouter = Router();

type FeedSupabaseClient = ReturnType<typeof getClientForRequest>;

/** Serves a shared-feed page from Redis on a hit, or fetches (single-flighted) and caches it on a miss. */
feedRouter.get('/', async (req, res) => {
  const params = parseFeedQuery(req.query);

  const client = getClientForRequest(req.jwt);
  const key = feedCacheKey(params);

  const cached = await getCache<FeedResponse>(key);
  if (cached) {
    req.log.info({ key }, 'feed cache hit');
    return res.json(cached);
  }

  const { value: response, joined } = await singleFlight(key, () =>
    fetchAndCacheFeed(client, params, key)
  );

  req.log.info(
    { key, joined },
    joined ? 'feed cache miss (joined in-flight fetch)' : 'feed cache miss (fetching)'
  );
  res.json(response);
});

/** Computes the next page's cursor, or null for a bounded/exhausted result set. */
function nextCursorFor(params: ParsedFeedQuery, rows: FeedSharedRow[]): string | null {
  if (params.variant === 'most_liked') return null;
  if (rows.length < params.limit) return null;

  return rows[rows.length - 1].created_at;
}

/** Calls the feed_shared RPC, writes the result to Redis, and returns it. */
async function fetchAndCacheFeed(
  client: FeedSupabaseClient,
  params: ParsedFeedQuery,
  key: string
): Promise<FeedResponse> {
  const { data, error } = await client.rpc('feed_shared', {
    variant: params.variant,
    region_code: params.regionCode ?? undefined,
    cursor_ts: params.cursor ?? undefined,
    page_size: params.limit,
  });
  if (error) throw new AppError(502, 'SUPABASE_ERROR', error.message);

  const posts = data as FeedSharedRow[];
  const response: FeedResponse = { posts, nextCursor: nextCursorFor(params, posts) };

  await setCache(key, response, FEED_CACHE_TTL_SECONDS);
  return response;
}
