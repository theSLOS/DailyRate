/**
 * Types for the shared-feed gateway: the feed_shared RPC's row shape
 * (narrowed back to its true nullability), the parsed query, and the
 * endpoint's response envelope.
 */
import type { Database } from '../../../types/database.ts';
import { FEED_VARIANTS } from '../constants/feed.js';

type FeedSharedRaw = Database['public']['Functions']['feed_shared']['Returns'][number];

export type FeedSharedRow = Omit<
  FeedSharedRaw,
  | 'id'
  | 'rating'
  | 'message'
  | 'created_at'
  | 'local_date'
  | 'like_count'
  | 'is_anonymous'
  | 'comment_count'
  | 'moderation_status'
> & {
  id: string;
  rating: number;
  message: string;
  created_at: string;
  local_date: string;
  like_count: number;
  is_anonymous: boolean;
  comment_count: number;
  moderation_status: string;
};

export type FeedVariant = (typeof FEED_VARIANTS)[number];

export type ParsedFeedQuery = {
  variant: FeedVariant;
  regionCode: string | null;
  cursor: string | null;
  limit: number;
};

export type FeedResponse = {
  posts: FeedSharedRow[];
  nextCursor: string | null;
};
