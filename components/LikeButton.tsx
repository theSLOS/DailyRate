import { useLikeStatus, useToggleLike } from '@/hooks/useLikes';
import { JSX } from 'react';
import { Pressable, Text } from 'react-native';

export type LikeButtonProps = {
  postId: string;
  userId: string | undefined;
  likeCount: number;
};

export function LikeButton({ postId, userId, likeCount }: LikeButtonProps): JSX.Element {
  const likeStatusQuery = useLikeStatus(postId, userId);
  const toggleLike = useToggleLike();
  const liked = likeStatusQuery.data ?? false;

  const handlePress = (): void => {
    if (!userId) {
      console.warn('User ID is required to toggle like status');
      return;
    }
    toggleLike.mutate({ postId, userId, liked });
  };

  return (
    <Pressable onPress={handlePress} disabled={!userId || likeStatusQuery.isLoading}>
      <Text>{liked ? 'Unlike' : 'Like'}</Text>
      <Text>{likeCount} likes</Text>
    </Pressable>
  );
}
