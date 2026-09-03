/**
 * Incoming/outgoing friend requests screen, with accept/reject/cancel actions.
 */
import { JSX } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import {
  useAcceptFriendRequest,
  useDeleteFriendRequest,
  useFriendRequests,
} from '@/hooks/useFriends';
import { Centered } from '@/components/Centered';
import { UNNAMED_USER_LABEL } from '@/constants/profiles';

/** Resolves the display label for a requester/addressee profile. */
function profileLabel(profile: { display_name: string | null; username: string | null }): string {
  return profile.display_name ?? profile.username ?? UNNAMED_USER_LABEL;
}

/** Renders the current user's incoming and outgoing friend requests with their actions. */
export default function FriendRequestsScreen(): JSX.Element {
  const { session, loading: authLoading } = useAuth();
  const requestsQuery = useFriendRequests(session?.user.id);
  const acceptRequest = useAcceptFriendRequest();
  const deleteRequest = useDeleteFriendRequest();

  if (requestsQuery.isLoading || authLoading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }

  if (requestsQuery.error) {
    return (
      <Centered>
        <Text>Couldn't load friend requests.</Text>
      </Centered>
    );
  }

  const requests = requestsQuery.data ?? [];
  const incoming = requests.filter((request) => request.addressee_id === session?.user.id);
  const outgoing = requests.filter((request) => request.requester_id === session?.user.id);

  return (
    <>
      <Stack.Screen options={{ title: 'Friend requests' }} />
      <ScrollView>
        {incoming.length === 0 && outgoing.length === 0 && (
          <Centered>
            <Text>No pending friend requests.</Text>
          </Centered>
        )}

        {incoming.length > 0 && (
          <View>
            <Text>Incoming</Text>
            {incoming.map((request) => (
              <View
                key={request.requester_id}
                className="border border-gray-300 rounded-lg p-3 mb-3"
              >
                <Link href={{ pathname: '/profile/[id]', params: { id: request.requester_id } }}>
                  <Text>{profileLabel(request.requester)}</Text>
                </Link>
                <Pressable
                  onPress={() => acceptRequest.mutate({ otherUserId: request.requester_id })}
                  disabled={acceptRequest.isPending}
                >
                  <Text>{acceptRequest.isPending ? 'Accepting…' : 'Accept'}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    deleteRequest.mutate({
                      requesterId: request.requester_id,
                      addresseeId: request.addressee_id,
                    })
                  }
                  disabled={deleteRequest.isPending}
                >
                  <Text>{deleteRequest.isPending ? 'Rejecting…' : 'Reject'}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {outgoing.length > 0 && (
          <View>
            <Text>Outgoing</Text>
            {outgoing.map((request) => (
              <View
                key={request.addressee_id}
                className="border border-gray-300 rounded-lg p-3 mb-3"
              >
                <Link href={{ pathname: '/profile/[id]', params: { id: request.addressee_id } }}>
                  <Text>{profileLabel(request.addressee)}</Text>
                </Link>
                <Pressable
                  onPress={() =>
                    deleteRequest.mutate({
                      requesterId: request.requester_id,
                      addresseeId: request.addressee_id,
                    })
                  }
                  disabled={deleteRequest.isPending}
                >
                  <Text>{deleteRequest.isPending ? 'Cancelling…' : 'Cancel request'}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}
