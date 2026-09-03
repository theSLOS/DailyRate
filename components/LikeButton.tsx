/**
 * Like/unlike toggle button for a post, showing the current like count.
 */
import { useLikeStatus, useToggleLike } from '@/hooks/useLikes';
import { JSX } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';

export type LikeButtonProps = {
  postId: string;
  userId: string | undefined;
  likeCount: number;
};

/** Renders "Like"/"Unlike" plus the like count, and toggles the like on press. */
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
    <View>
      <Button
        label={liked ? 'Unlike' : 'Like'}
        onPress={handlePress}
        disabled={!userId || likeStatusQuery.isLoading}
      />
      <Text>{likeCount} likes</Text>
    </View>
  );
}
