/**
 * Post/feed-related magic values: labels, polling interval, anonymity
 * copy, and the shared-feed page size / most-liked cap.
 */
export const ANONYMOUS_AUTHOR_LABEL = 'Anonymous';

export const POST_POLL_INTERVAL_MS = 7000;

export const ANONYMOUS_POST_WARNING =
  'Your name is hidden from other users, but moderators can still see who posted. Anonymous posts still reach the feeds of people you are friends with, where a small circle can make them easy to guess.';

export const HIDDEN_POSTS_STORAGE_KEY = 'hidden_post_ids';

export const LOCATION_RESOLVING_LABEL = 'Finding your location...';

export const FEED_PAGE_SIZE = 20;

// most-liked is a bounded top-N, not an infinite feed: like_count is mutable, so
// keyset pagination over it would skip and duplicate posts as counts change mid-scroll
export const MOST_LIKED_LIMIT = 50;

export const EXPLORE_FEED_LABELS = {
  newest: 'Newest',
  mostLiked: 'Most liked',
  region: 'Near you',
} as const;

export const REGION_TIER_NOTICES = {
  state: null,
  country: 'No recent posts in your area — showing your country.',
  mostLiked: 'No recent posts near you — showing the most liked instead.',
} as const;
