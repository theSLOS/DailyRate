/**
 * Full friends list screen (linked from the Profile tab's friend count).
 */
import { JSX } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useFriendsList } from '@/hooks/useFriends';
import { Centered } from '@/components/Centered';
import { UNNAMED_USER_LABEL } from '@/constants/profiles';

/** Renders the current user's full friends list. */
export default function FriendsListScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const friendsQuery = useFriendsList(session?.user.id);

  if (friendsQuery.isLoading || authLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  if (friendsQuery.error) {
    return (
      <Centered>
        <Text>Couldn't load your friends.</Text>
      </Centered>
    );
  }

  const friends = friendsQuery.data ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Friends' }} />
      <ScrollView>
        {friends.length === 0 && (
          <Centered>
            <Text>No friends yet.</Text>
          </Centered>
        )}
        {friends.map((friendship) => (
          <View key={friendship.friend_id} className="border border-gray-300 rounded-lg p-3 mb-3">
            <Link href={{ pathname: '/profile/[id]', params: { id: friendship.friend_id } }}>
              <Text>
                {friendship.friend.display_name ?? friendship.friend.username ?? UNNAMED_USER_LABEL}
              </Text>
            </Link>
          </View>
        ))}
      </ScrollView>
    </>
  );
}
