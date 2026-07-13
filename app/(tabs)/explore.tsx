import { JSX } from 'react';
import { FlatList, Text, ActivityIndicator } from 'react-native';
import { Centered } from '@/components/Centered';
import { useAuth } from '@/hooks/useAuth';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { ExplorePostCard } from '@/components/ExplorePostCard';

export default function ExploreScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const exploreQuery = useExploreFeed(session?.user.id);

  if (exploreQuery.isLoading || authLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }
  if (exploreQuery.error) {
    return (
      <Centered>
        <Text>Couldn't load the explore feed.</Text>
      </Centered>
    );
  }

  const posts = exploreQuery.data?.pages.flat() ?? [];

  if (posts.length === 0) {
    return (
      <Centered>
        <Text>No posts to explore yet.</Text>
      </Centered>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <ExplorePostCard post={item} />}
      onEndReached={() => {
        if (exploreQuery.hasNextPage && !exploreQuery.isFetchingNextPage) {
          exploreQuery.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      refreshing={exploreQuery.isRefetching}
      onRefresh={() => exploreQuery.refetch()}
      ListFooterComponent={exploreQuery.isFetchingNextPage ? <ActivityIndicator /> : null}
    />
  );
}
