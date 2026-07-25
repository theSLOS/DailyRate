import { Database } from '@/types/database';

export type Post = Database['public']['Tables']['posts']['Row'];

export type Comment = Database['public']['Tables']['comments']['Row'];

export type ProfilePublicRow = Database['public']['Views']['profiles_public']['Row'];

export type FeedPost = {
  id: string;
  rating: number;
  message: string;
  created_at: string;
  local_date: string;
  like_count: number;
  is_anonymous: boolean;
  user_id: string | null;
  photo_url: string | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
  comment_count: number;
};
