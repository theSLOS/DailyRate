import type { ExplorePost } from '@/types/posts';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { JSX } from 'react';
import { Image, Text, View } from 'react-native';
import { formatCoarseAge } from '@/utils/formatCoarseAge';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';

export type ExplorePostCardProps = { post: ExplorePost };

export function ExplorePostCard({ post }: ExplorePostCardProps): JSX.Element {
  const photoUrlQuery = useSignedPhotoUrl(post.photo_url);

  return (
    <View>
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
    </View>
  );
}
