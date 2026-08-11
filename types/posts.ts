import { Database } from '@/types/database';

export type Post = Database['public']['Tables']['posts']['Row'];

export type Comment = Database['public']['Tables']['comments']['Row'];

export type ProfilePublicRow = Database['public']['Views']['profiles_public']['Row'];

type PostsFeedRow = Database['public']['Views']['posts_feed']['Row'];

// Supabase's codegen marks every view column nullable regardless of the
// source column's actual nullability. These are copied straight from posts'
// non-null base columns, so they're narrowed back here — Omit/intersect
// instead of a hand-rolled type keeps this tied to the generated view, so a
// new view column shows up here automatically instead of silently missing.
export type FeedPost = Omit<
  PostsFeedRow,
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
