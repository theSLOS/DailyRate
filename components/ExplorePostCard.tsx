/**
 * A single post card in the Explore feed — author (or "Anonymous"), age,
 * place, rating, message, photo, and engagement counts, tapping through to
 * the post detail screen.
 */
import type { FeedPost } from '@/types/posts';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { JSX } from 'react';
import { Image, Pressable, Text } from 'react-native';
import { formatCoarseAge } from '@/utils/formatCoarseAge';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';
import { Link } from 'expo-router';

export type ExplorePostCardProps = { post: FeedPost };

/** Renders one feed post as a tappable card linking to its detail screen. */
export function ExplorePostCard({ post }: ExplorePostCardProps): JSX.Element {
  const photoUrlQuery = useSignedPhotoUrl(post.photo_url);

  return (
    <Link href={{ pathname: '/post/[id]', params: { id: post.id } }} asChild>
      <Pressable className="border border-gray-300 rounded-lg p-3 mb-3">
        {post.user_id !== null ? (
          <Link href={{ pathname: '/profile/[id]', params: { id: post.user_id } }}>
            <Text>
              {post.author_display_name ?? post.author_username ?? ANONYMOUS_AUTHOR_LABEL}
            </Text>
          </Link>
        ) : (
          <Text>{ANONYMOUS_AUTHOR_LABEL}</Text>
        )}
        <Text>{formatCoarseAge(post.created_at, new Date())}</Text>
        {post.place_label && <Text className="text-gray-500">{post.place_label}</Text>}
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
