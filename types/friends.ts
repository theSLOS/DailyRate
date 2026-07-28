import type { Database } from '@/types/database';

export type FriendRequest = Database['public']['Tables']['friend_requests']['Row'];

export type FriendStatus =
  'unknown' | 'self' | 'blocked' | 'friends' | 'incoming' | 'outgoing' | 'none';
