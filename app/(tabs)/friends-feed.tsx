/**
 * The Friends tab: the personal, never-cached feed of posts from the
 * current user's friends, with infinite scroll.
 */
import { JSX } from 'react';
import { ActivityIndicator, FlatList, Text } from 'react-native';
import { Centered } from '@/components/Centered';
import { ExplorePostCard } from '@/components/ExplorePostCard';
import { useAuth } from '@/hooks/useAuth';
import { useFriendsFeed } from '@/hooks/useFriendsFeed';

/** Renders the current user's friends feed, handling its own loading/error/empty states. */
export default function FriendsFeedScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const friendsFeedQuery = useFriendsFeed(session?.user.id);

  if (authLoading || friendsFeedQuery.isLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  if (friendsFeedQuery.error) {
    return (
      <Centered>
        <Text>Couldn&apos;t load your friends&apos; posts.</Text>
      </Centered>
    );
  }

  const posts = friendsFeedQuery.data?.pages.flat() ?? [];

  if (posts.length === 0) {
    return (
      <Centered>
        <Text>No posts from your friends yet.</Text>
      </Centered>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <ExplorePostCard post={item} />}
      onEndReached={() => {
        if (friendsFeedQuery.hasNextPage && !friendsFeedQuery.isFetchingNextPage) {
          friendsFeedQuery.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      refreshing={friendsFeedQuery.isRefetching}
      onRefresh={() => friendsFeedQuery.refetch()}
      ListFooterComponent={friendsFeedQuery.isFetchingNextPage ? <ActivityIndicator /> : null}
    />
  );
}
