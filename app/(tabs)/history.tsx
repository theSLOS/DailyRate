import { JSX } from 'react';
import { FlatList, Text, ActivityIndicator } from 'react-native';
import { usePostHistory } from '@/hooks/usePostHistory';
import { PostHistoryCard } from '@/components/PostHistoryCard';
import { RatingHistoryChart } from '@/components/RatingHistoryChart';
import { Centered } from '@/components/Centered';
import { useAuth } from '@/hooks/useAuth';

export default function HistoryScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const historyQuery = usePostHistory(session?.user.id);

  if (historyQuery.isLoading || authLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  if (historyQuery.error) {
    return (
      <Centered>
        <Text>Couldn't load your history.</Text>
      </Centered>
    );
  }

  const posts = historyQuery.data ?? [];

  if (posts.length === 0) {
    return (
      <Centered>
        <Text>No days rated yet — come back after your first entry.</Text>
      </Centered>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(post) => post.id}
      renderItem={({ item }) => <PostHistoryCard post={item} />}
      ListHeaderComponent={<RatingHistoryChart posts={posts} />}
    />
  );
}
