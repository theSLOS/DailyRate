import { useBlockStatus, useToggleBlock } from '@/hooks/useBlocks';
import { JSX } from 'react';
import { Button } from '@/components/ui/Button';

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
    <Button
      label={isBlocked ? 'Unblock' : 'Block'}
      onPress={handlePress}
      disabled={!blockerId || blockStatusQuery.isLoading}
    />
  );
}
