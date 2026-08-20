export const FEED_VARIANTS = ['newest', 'most_liked', 'state', 'country'] as const;

// the variants scoped to a region, and so the ones requiring a region code
export const REGION_VARIANTS = ['state', 'country'] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
