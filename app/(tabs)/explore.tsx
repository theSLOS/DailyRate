/**
 * The Explore tab: the shared newest/most-liked/region feed, with its
 * variant switcher, region-tier fallback notice, and infinite scroll.
 */
import { JSX, useState } from 'react';
import { FlatList, Text, ActivityIndicator, View } from 'react-native';
import { Centered } from '@/components/Centered';
import { useAuth } from '@/hooks/useAuth';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { useSessionRegion } from '@/hooks/useSessionRegion';
import { ExplorePostCard } from '@/components/ExplorePostCard';
import { FeedTypeSwitcher } from '@/components/FeedTypeSwitcher';
import { LOCATION_RESOLVING_LABEL, REGION_TIER_NOTICES } from '@/constants/posts';
import type { ExploreFeedType } from '@/types/feed';

/** Renders the Explore feed for the selected variant, handling its own loading/error/empty states. */
export default function ExploreScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const [feedType, setFeedType] = useState<ExploreFeedType>('newest');

  // gated so picking "Near you" is what triggers the location prompt, not opening Explore
  const regionQuery = useSessionRegion(session?.user.id, feedType === 'region');
  const region = regionQuery.data?.status === 'resolved' ? regionQuery.data.region : null;

  const exploreQuery = useExploreFeed(session?.user.id, feedType, region);

  const switcher = <FeedTypeSwitcher value={feedType} onChange={setFeedType} />;
  const posts = exploreQuery.data?.pages.flatMap((page) => page.posts) ?? [];
  const tier = exploreQuery.data?.pages[0]?.tier ?? null;
  const tierNotice = tier ? REGION_TIER_NOTICES[tier] : null;

  if (authLoading || (feedType === 'region' && regionQuery.isLoading)) {
    return (
      <View className="flex-1">
        {switcher}
        <Centered>
          <ActivityIndicator />
          {feedType === 'region' && <Text className="mt-2">{LOCATION_RESOLVING_LABEL}</Text>}
        </Centered>
      </View>
    );
  }

  if (exploreQuery.isLoading) {
    return (
      <View className="flex-1">
        {switcher}
        <Centered>
          <ActivityIndicator />
        </Centered>
      </View>
    );
  }

  if (exploreQuery.error) {
    return (
      <View className="flex-1">
        {switcher}
        <Centered>
          <Text>Couldn&apos;t load the explore feed.</Text>
        </Centered>
      </View>
    );
  }

  return (
    <View className="flex-1">
      {switcher}
      {tierNotice && <Text className="px-3 pb-2 text-gray-500">{tierNotice}</Text>}
      {posts.length === 0 ? (
        <Centered>
          <Text>No posts to explore yet.</Text>
        </Centered>
      ) : (
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
      )}
    </View>
  );
}
