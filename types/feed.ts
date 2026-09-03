/**
 * Shared-feed variant and region-fallback-tier types used by the Explore
 * feed and its state -> country -> most-liked fallback.
 */
export type ExploreFeedType = 'newest' | 'mostLiked' | 'region';

// which tier of the state -> country -> most-liked fallback a region page was served from
export type RegionFeedTier = 'state' | 'country' | 'mostLiked';
