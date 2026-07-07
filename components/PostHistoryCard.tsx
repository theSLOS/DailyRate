import type { Post } from '@/types/posts';
import { JSX } from 'react';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { View, Text, Image } from 'react-native';
type PostHistoryCardProps = { post: Post };

export function PostHistoryCard(props: PostHistoryCardProps): JSX.Element {
  const photoUrlQuery = useSignedPhotoUrl(props.post.photo_url);

  return (
    <View>
      <Text>{props.post.local_date}</Text>
      <Text>{props.post.rating}/10</Text>
      <Text>{props.post.message}</Text>
      {photoUrlQuery.data && (
        <Image
          source={{ uri: photoUrlQuery.data }}
          resizeMode="contain"
          className="w-24 aspect-[4/5] rounded-lg mt-4"
        />
      )}
    </View>
  );
}
