import { useLocalSearchParams } from 'expo-router';
import { usePost } from '@/hooks/usePost';
import { JSX } from 'react';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { Stack } from 'expo-router';
import { Centered } from '@/components/Centered';
import { ActivityIndicator, ScrollView, Text, Image } from 'react-native';
import { formatCoarseAge } from '@/utils/formatCoarseAge';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';
import { useAuth } from '@/hooks/useAuth';
import { LikeButton } from '@/components/LikeButton';
import { CommentThread } from '@/components/CommentThread';

export default function PostDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postQuery = usePost(id);
  const photoUrlQuery = useSignedPhotoUrl(postQuery.data?.photo_url ?? null);
  const { session } = useAuth();

  return (
    <>
      <Stack.Screen options={{ title: 'Post' }} />
      {/* three states below, mirroring explore.tsx/history.tsx */}
      {postQuery.isLoading && (
        <Centered>
          <ActivityIndicator />
        </Centered>
      )}
      {postQuery.error && (
        <Centered>
          <Text>Couldn't load this post.</Text>
        </Centered>
      )}
      {!postQuery.isLoading && !postQuery.error && !postQuery.data && (
        <Centered>
          <Text>This post is no longer available.</Text>
        </Centered>
      )}
      {postQuery.data && (
        <ScrollView>
          <Text>
            {postQuery.data.author.display_name ??
              postQuery.data.author.username ??
              ANONYMOUS_AUTHOR_LABEL}
          </Text>
          <Text>{formatCoarseAge(postQuery.data.created_at, new Date())}</Text>
          <Text>{postQuery.data.rating}/10</Text>
          <Text>{postQuery.data.message}</Text>
          {photoUrlQuery.data && (
            <Image
              source={{ uri: photoUrlQuery.data }}
              resizeMode="contain"
              className="w-full aspect-[4/5] rounded-lg mt-4"
            />
          )}
          <LikeButton
            postId={postQuery.data.id}
            userId={session?.user.id}
            likeCount={postQuery.data.like_count}
          />
          <CommentThread postId={postQuery.data.id} userId={session?.user.id} />
        </ScrollView>
      )}
    </>
  );
}
