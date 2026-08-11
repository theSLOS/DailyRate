import {
  useAcceptFriendRequest,
  useDeleteFriendRequest,
  useFriendStatus,
  useRemoveFriendship,
  useSendFriendRequest,
} from '@/hooks/useFriends';
import { JSX } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';

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
        <Button
          label={sendRequest.isPending ? 'Sending…' : 'Add friend'}
          onPress={handleSendRequest}
          disabled={sendRequest.isPending}
        />
      );

    case 'outgoing':
      return (
        <Button
          label={deleteFriendRequest.isPending ? 'Cancelling…' : 'Cancel request'}
          onPress={handleCancelRequest}
          disabled={deleteFriendRequest.isPending}
        />
      );

    case 'incoming':
      return (
        <View>
          <Button
            label={acceptFriendRequest.isPending ? 'Accepting…' : 'Accept'}
            onPress={handleAccept}
            disabled={acceptFriendRequest.isPending}
          />
          <Button
            label={deleteFriendRequest.isPending ? 'Rejecting…' : 'Reject'}
            onPress={handleReject}
            disabled={deleteFriendRequest.isPending}
          />
        </View>
      );

    case 'friends':
      return (
        <Button
          label={removeFriendship.isPending ? 'Removing…' : 'Remove friend'}
          onPress={handleRemove}
          disabled={removeFriendship.isPending}
        />
      );

    case 'blocked':
    case 'self':
    case 'unknown':
      return null;
  }
}
