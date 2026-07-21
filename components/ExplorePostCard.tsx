import type { ExplorePost } from '@/types/posts';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { JSX } from 'react';
import { Image, Pressable, Text } from 'react-native';
import { formatCoarseAge } from '@/utils/formatCoarseAge';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';
import { Link } from 'expo-router';

export type ExplorePostCardProps = { post: ExplorePost };

export function ExplorePostCard({ post }: ExplorePostCardProps): JSX.Element {
  const photoUrlQuery = useSignedPhotoUrl(post.photo_url);

  return (
    <Link href={{ pathname: '/post/[id]', params: { id: post.id } }} asChild>
      <Pressable className="border border-gray-300 rounded-lg p-3 mb-3">
        <Text>{post.author.display_name ?? post.author.username ?? ANONYMOUS_AUTHOR_LABEL}</Text>
        <Text>{formatCoarseAge(post.created_at, new Date())}</Text>
        <Text>{post.rating}/10</Text>
        <Text>{post.message}</Text>
        {photoUrlQuery.data && (
          <Image
            source={{ uri: photoUrlQuery.data }}
            resizeMode="contain"
            className="w-24 aspect-[4/5] rounded-lg mt-4"
          />
        )}
        <Text>
          {post.like_count} likes · {post.comment_count} comments
        </Text>
      </Pressable>
    </Link>
  );
}
