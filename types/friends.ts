/**
 * Friend-relationship types: the generated `friend_requests`/`friendships`
 * row shapes, plus the UI-facing status enum a viewer can have with another user.
 */
import type { Database } from '@/types/database';

export type FriendRequest = Database['public']['Tables']['friend_requests']['Row'];

export type Friendship = Database['public']['Tables']['friendships']['Row'];

export type FriendStatus =
  'unknown' | 'self' | 'blocked' | 'friends' | 'incoming' | 'outgoing' | 'none';
