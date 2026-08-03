import { JSX } from 'react';
import { Text } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

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
