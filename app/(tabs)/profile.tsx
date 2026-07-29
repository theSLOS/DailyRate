import { JSX } from 'react';
import { FlatList, Text, ActivityIndicator, View, Image } from 'react-native';
import { Link } from 'expo-router';
import { usePostHistory } from '@/hooks/usePostHistory';
import { useProfile } from '@/hooks/useProfile';
import { PostHistoryCard } from '@/components/PostHistoryCard';
import { RatingHistoryChart } from '@/components/RatingHistoryChart';
import { Centered } from '@/components/Centered';
import { useAuth } from '@/hooks/useAuth';
import { useFriendCount, useFriendRequests } from '@/hooks/useFriends';
import { UNNAMED_USER_LABEL } from '@/constants/profiles';

export default function MyProfileScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const historyQuery = usePostHistory(session?.user.id);
  const profileQuery = useProfile(session?.user.id);
  const countQuery = useFriendCount(session?.user.id);
  const requestsQuery = useFriendRequests(session?.user.id);
  const incomingCount =
    requestsQuery.data?.filter((request) => request.addressee_id === session?.user.id).length ?? 0;

  if (historyQuery.isLoading || profileQuery.isLoading || authLoading) {
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
  const profile = profileQuery.data;

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
      ListHeaderComponent={
        <>
          <View className="border border-gray-300 rounded-lg p-3 mb-3">
            {profile?.avatar_url && (
              <Image
                source={{ uri: profile.avatar_url }}
                resizeMode="contain"
                className="w-24 aspect-[4/5] rounded-lg mt-4"
              />
            )}
            <Text>{profile?.display_name ?? profile?.username ?? UNNAMED_USER_LABEL}</Text>
            <Link href="/friends">
              <Text>{countQuery.data ?? 0} friends</Text>
            </Link>
            <Link href="/requests">
              <Text>Friend requests{incomingCount > 0 ? ` (${incomingCount})` : ''}</Text>
            </Link>
          </View>
          <RatingHistoryChart posts={posts} />
        </>
      }
    />
  );
}
