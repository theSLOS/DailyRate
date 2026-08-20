import { FEED_KEY_PREFIX, SENTINEL, SEPARATOR } from '../constants/redis.js';
import type { ParsedFeedQuery } from '../types/feed.js';

// unambiguous because no field can contain SEPARATOR or SENTINEL: variant is a
// closed set, limit is a bounded integer, cursor is toISOString() output, and
// regionCode is constrained to [A-Za-z0-9-] by REGION_REGEX
export function feedCacheKey(params: ParsedFeedQuery): string {
  return [
    FEED_KEY_PREFIX,
    params.variant,
    params.regionCode ?? SENTINEL,
    params.cursor ?? SENTINEL,
    String(params.limit),
  ].join(SEPARATOR);
}
