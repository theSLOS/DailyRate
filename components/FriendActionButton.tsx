import {
  useAcceptFriendRequest,
  useDeleteFriendRequest,
  useFriendStatus,
  useRemoveFriendship,
  useSendFriendRequest,
} from '@/hooks/useFriends';
import { JSX } from 'react';
import { Pressable, Text, View } from 'react-native';

export type FriendActionButtonProps = {
  otherUserId: string;
  sessionUserId: string | undefined;
};

export function FriendActionButton({
  otherUserId,
  sessionUserId,
}: FriendActionButtonProps): JSX.Element | null {
  const status = useFriendStatus(otherUserId, sessionUserId);
  const sendRequest = useSendFriendRequest();
  const deleteFriendRequest = useDeleteFriendRequest();
  const acceptFriendRequest = useAcceptFriendRequest();
  const removeFriendship = useRemoveFriendship();

  const handleSendRequest = (): void => {
    if (!sessionUserId) {
      console.warn('Session user ID is required to send a friend request');
      return;
    }
    sendRequest.mutate({ requesterId: sessionUserId, addresseeId: otherUserId });
  };

  const handleCancelRequest = (): void => {
    if (!sessionUserId) {
      console.warn('Session user ID is required to cancel a friend request');
      return;
    }
    deleteFriendRequest.mutate({ requesterId: sessionUserId, addresseeId: otherUserId });
  };

  const handleAccept = (): void => {
    if (!sessionUserId) {
      console.warn('Session user ID is required to accept a friend request');
      return;
    }
    acceptFriendRequest.mutate({ otherUserId });
  };

  const handleReject = (): void => {
    if (!sessionUserId) {
      console.warn('Session user ID is required to reject a friend request');
      return;
    }
    deleteFriendRequest.mutate({ requesterId: otherUserId, addresseeId: sessionUserId });
  };

  const handleRemove = (): void => {
    if (!sessionUserId) {
      console.warn('Session user ID is required to remove a friendship');
      return;
    }
    removeFriendship.mutate({ otherUserId });
  };

  switch (status) {
    case 'none':
      return (
        <Pressable onPress={handleSendRequest} disabled={sendRequest.isPending}>
          <Text>{sendRequest.isPending ? 'Sending…' : 'Add friend'}</Text>
        </Pressable>
      );

    case 'outgoing':
      return (
        <Pressable onPress={handleCancelRequest} disabled={deleteFriendRequest.isPending}>
          <Text>{deleteFriendRequest.isPending ? 'Cancelling…' : 'Cancel request'}</Text>
        </Pressable>
      );

    case 'incoming':
      return (
        <View>
          <Pressable onPress={handleAccept} disabled={acceptFriendRequest.isPending}>
            <Text>{acceptFriendRequest.isPending ? 'Accepting…' : 'Accept'}</Text>
          </Pressable>
          <Pressable onPress={handleReject} disabled={deleteFriendRequest.isPending}>
            <Text>{deleteFriendRequest.isPending ? 'Rejecting…' : 'Reject'}</Text>
          </Pressable>
        </View>
      );

    case 'friends':
      return (
        <Pressable onPress={handleRemove} disabled={removeFriendship.isPending}>
          <Text>{removeFriendship.isPending ? 'Removing…' : 'Remove friend'}</Text>
        </Pressable>
      );

    case 'blocked':
    case 'self':
    case 'unknown':
      return null;
  }
}
