/**
 * Block/unblock toggle button for a post's author, shown on the post detail screen.
 */
import { useBlockStatus, useToggleBlock } from '@/hooks/useBlocks';
import { JSX } from 'react';
import { Button } from '@/components/ui/Button';

export type BlockButtonProps = {
  blockerId: string | undefined;
  blockedUserId: string;
};

/** Renders "Block"/"Unblock" for the given user and toggles the block relationship on press. */
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
