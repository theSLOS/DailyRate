import { useBlockStatus, useToggleBlock } from '@/hooks/useBlocks';
import { JSX } from 'react';
import { Pressable, Text } from 'react-native';

export type BlockButtonProps = {
  blockerId: string | undefined;
  blockedUserId: string;
};

export function BlockButton({ blockerId, blockedUserId }: BlockButtonProps): JSX.Element {
  const blockStatusQuery = useBlockStatus(blockedUserId);
  const toggleBlock = useToggleBlock();
  const isBlocked = blockStatusQuery.data ?? false;

  const handlePress = (): void => {
    if (!blockerId) {
      console.warn('Blocker ID is required to toggle block status');
      return;
    }
    toggleBlock.mutate({ blockerId, blockedUserId, isCurrentlyBlocked: isBlocked });
  };

  return (
    <Pressable onPress={handlePress} disabled={!blockerId || blockStatusQuery.isLoading}>
      <Text>{isBlocked ? 'Unblock' : 'Block'}</Text>
    </Pressable>
  );
}
