/**
 * Shared-feed query config: the valid variants, which ones need a region
 * code, its validation regex, and page-size bounds.
 */
export const FEED_VARIANTS = ['newest', 'most_liked', 'state', 'country'] as const;

// the variants scoped to a region, and so the ones requiring a region code
export const REGION_VARIANTS = ['state', 'country'] as const;
export const REGION_REGEX = /^[A-Za-z0-9-]{1,16}$/;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
