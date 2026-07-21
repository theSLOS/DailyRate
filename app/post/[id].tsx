import { useLocalSearchParams } from 'expo-router';
import { usePost } from '@/hooks/usePost';
import { JSX, useState } from 'react';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { Stack } from 'expo-router';
import { Centered } from '@/components/Centered';
import { ActivityIndicator, ScrollView, Text, Image, RefreshControl, View } from 'react-native';
import { formatCoarseAge } from '@/utils/formatCoarseAge';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';
import { useAuth } from '@/hooks/useAuth';
import { LikeButton } from '@/components/LikeButton';
import { BlockButton } from '@/components/BlockButton';
import { ReportButton } from '@/components/ReportButton';
import { CommentThread } from '@/components/CommentThread';
import { useQueryClient } from '@tanstack/react-query';

export default function PostDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postQuery = usePost(id);
  const photoUrlQuery = useSignedPhotoUrl(postQuery.data?.photo_url ?? null);
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['posts', { id }] }),
      queryClient.invalidateQueries({ queryKey: ['comments', { postId: id }] }),
    ]);
    setRefreshing(false);
  };

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
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View className="border border-gray-300 rounded-lg p-3 mb-3">
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
            {session?.user.id !== postQuery.data.user_id && (
              <>
                <BlockButton blockerId={session?.user.id} blockedUserId={postQuery.data.user_id} />
                <ReportButton
                  reporterId={session?.user.id}
                  targetType="post"
                  targetId={postQuery.data.id}
                />
              </>
            )}
          </View>
          <CommentThread postId={postQuery.data.id} userId={session?.user.id} />
        </ScrollView>
      )}
    </>
  );
}
