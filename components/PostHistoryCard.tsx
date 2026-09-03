/**
 * A single entry on the "Your days" history list — date, rating, message,
 * photo, and a Delete action shown only while still inside the entry window.
 */
import type { Post } from '@/types/posts';
import { JSX } from 'react';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { View, Text, Image, Alert } from 'react-native';
import { useDeletePost } from '@/hooks/usePosts';
import { getEntryDate } from '@/utils/getEntryDate';
import { Button } from './ui/Button';
import { TEST_IDS } from '@/constants/testIds';
type PostHistoryCardProps = { post: Post };

/** Renders one history entry, with a confirm-then-delete action while it's still editable. */
export function PostHistoryCard({ post }: PostHistoryCardProps): JSX.Element {
  const photoUrlQuery = useSignedPhotoUrl(post.photo_url);
  const deletePost = useDeletePost();

  const isInCurrentWindow = post.local_date === getEntryDate(new Date());

  const handleDelete = (): void => {
    Alert.alert('Delete this entry?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deletePost.mutate(post.id, {
            onError: (error) => Alert.alert('Could not delete entry', error.message),
          }),
      },
    ]);
  };

  return (
    <View className="border border-gray-300 rounded-lg p-3 mb-3">
      <Text>{post.local_date}</Text>
      <Text>{post.rating}/10</Text>
      <Text>{post.message}</Text>
      {photoUrlQuery.data && (
        <Image
          source={{ uri: photoUrlQuery.data }}
          resizeMode="contain"
          className="w-24 aspect-[4/5] rounded-lg mt-4"
        />
      )}
      {isInCurrentWindow && (
        <Button
          label="Delete"
          onPress={handleDelete}
          disabled={deletePost.isPending}
          testID={TEST_IDS.postHistoryCard.delete}
        />
      )}
    </View>
  );
}
