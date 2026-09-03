/**
 * Header-right widget showing the signed-in user's display name/username,
 * rendering nothing if neither is set.
 */
import { JSX } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

/** Renders the current user's name in the tab header, or null if they have none set. */
export function HeaderProfileName(): JSX.Element | null {
  const { session } = useAuth();
  const profileQuery = useProfile(session?.user.id);

  const name = profileQuery.data?.display_name ?? profileQuery.data?.username;
  if (!name) return null;

  return (
    <Text className="text-gray-600 mr-4" numberOfLines={1}>
      {name}
    </Text>
  );
}
