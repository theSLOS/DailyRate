/**
 * Derives the Redis key for a parsed shared-feed query, so identical
 * queries always hit the same cache entry.
 */
import { FEED_KEY_PREFIX, SENTINEL, SEPARATOR } from '../constants/redis.js';
import type { ParsedFeedQuery } from '../types/feed.js';

// unambiguous because no field can contain SEPARATOR or SENTINEL: variant is a
// closed set, limit is a bounded integer, cursor is toISOString() output, and
// regionCode is constrained to [A-Za-z0-9-] by REGION_REGEX
/** Builds the Redis cache key for a parsed feed query. */
export function feedCacheKey(params: ParsedFeedQuery): string {
  return [
    FEED_KEY_PREFIX,
    params.variant,
    params.regionCode ?? SENTINEL,
    params.cursor ?? SENTINEL,
    String(params.limit),
  ].join(SEPARATOR);
}
