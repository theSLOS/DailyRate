import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { usePost } from '@/hooks/usePost';
import { JSX, useState } from 'react';
import { useSignedPhotoUrl } from '@/hooks/useSignedPhotoUrl';
import { Centered } from '@/components/Centered';
import { ActivityIndicator, ScrollView, Text, Image, RefreshControl, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { formatCoarseAge } from '@/utils/formatCoarseAge';
import { ANONYMOUS_AUTHOR_LABEL } from '@/constants/posts';
import { useAuth } from '@/hooks/useAuth';
import { LikeButton } from '@/components/LikeButton';
import { BlockButton } from '@/components/BlockButton';
import { ReportButton } from '@/components/ReportButton';
import { CommentThread } from '@/components/CommentThread';
import { useQueryClient } from '@tanstack/react-query';
import { useHidePost } from '@/hooks/useHiddenPosts';

export default function PostDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postQuery = usePost(id);
  const photoUrlQuery = useSignedPhotoUrl(postQuery.data?.photo_url ?? null);
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const hidePost = useHidePost();
  const router = useRouter();
  const post = postQuery.data;

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
      {!postQuery.isLoading && !postQuery.error && !post && (
        <Centered>
          <Text>This post is no longer available.</Text>
        </Centered>
      )}
      {post && (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View className="border border-gray-300 rounded-lg p-3 mb-3">
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
                className="w-full aspect-[4/5] rounded-lg mt-4"
              />
            )}
            <LikeButton postId={post.id} userId={session?.user.id} likeCount={post.like_count} />
            {session?.user.id !== post.user_id && (
              <>
                <ReportButton reporterId={session?.user.id} targetType="post" targetId={post.id} />
                <Button
                  label="Hide this post"
                  onPress={() => {
                    hidePost.mutate(post.id);
                    router.back();
                  }}
                />
              </>
            )}
            {post.user_id !== null && session?.user.id !== post.user_id && (
              <BlockButton blockerId={session?.user.id} blockedUserId={post.user_id} />
            )}
          </View>
          <CommentThread postId={post.id} userId={session?.user.id} />
        </ScrollView>
      )}
    </>
  );
}
