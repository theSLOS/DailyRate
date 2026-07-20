import { Database } from '@/types/database';

export type Post = Database['public']['Tables']['posts']['Row'];

export type Comment = Database['public']['Tables']['comments']['Row'];

export type ProfilePublicRow = Database['public']['Views']['profiles_public']['Row'];

export type ExplorePost = Post & {
  author: Pick<ProfilePublicRow, 'username' | 'display_name' | 'avatar_url'>;
};
