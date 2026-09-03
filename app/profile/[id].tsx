/**
 * Another user's profile screen: their public info, friend action button,
 * report action, and latest live post. Redirects to the own-profile tab if
 * the viewed id is the signed-in user's own.
 */
import { useLocalSearchParams, Redirect, Stack } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useFriendCount } from '@/hooks/useFriends';
import { useLatestLivePost } from '@/hooks/useLatestLivePost';
import { FriendActionButton } from '@/components/FriendActionButton';
import { ReportButton } from '@/components/ReportButton';
import { ExplorePostCard } from '@/components/ExplorePostCard';
import { Centered } from '@/components/Centered';
import { JSX } from 'react';
import { ActivityIndicator, View, Text, Image } from 'react-native';
import { UNNAMED_USER_LABEL } from '@/constants/profiles';

/** Renders another user's public profile, or redirects home if it's the viewer's own. */
export default function ProfileScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, loading: authLoading } = useAuth();
  const profileQuery = useProfile(id);
  const countQuery = useFriendCount(id);
  const latestPostQuery = useLatestLivePost(id);

  // 1. still resolving session — same authLoading gate as history.tsx/index.tsx
  if (authLoading)
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );

  // 2. now session is known — safe to compare without a stale flash
  if (id === session?.user.id) return <Redirect href="/(tabs)/profile" />;

  const profile = profileQuery.data;

  return (
    <>
      <Stack.Screen options={{ title: 'Profile' }} />
      {profileQuery.isLoading && (
        <Centered>
          <ActivityIndicator />
        </Centered>
      )}
      {profileQuery.error && (
        <Centered>
          <Text>Couldn't load this profile.</Text>
        </Centered>
      )}
      {!profileQuery.isLoading && !profileQuery.error && !profile && (
        <Centered>
          <Text>This profile doesn't exist.</Text>
        </Centered>
      )}
      {profile && (
        <View className="border border-gray-300 rounded-lg p-3 mb-3">
          {profile.avatar_url && (
            <Image
              source={{ uri: profile.avatar_url }}
              resizeMode="contain"
              className="w-full aspect-[4/5] rounded-lg mt-4"
            />
          )}
          <Text>{profile.display_name ?? profile.username ?? UNNAMED_USER_LABEL}</Text>
          <Text>{countQuery.data ?? 0} friends</Text>
          <FriendActionButton otherUserId={id} sessionUserId={session?.user.id} />
          <ReportButton reporterId={session?.user.id} targetType="user" targetId={id} />
        </View>
      )}
      {latestPostQuery.error && <Text>Couldn't load their latest post.</Text>}
      {latestPostQuery.data && <ExplorePostCard post={latestPostQuery.data} />}
      {!latestPostQuery.isLoading && !latestPostQuery.error && !latestPostQuery.data && (
        <Text>No recent post.</Text>
      )}
    </>
  );
}
