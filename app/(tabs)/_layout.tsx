/**
 * Tab group layout: Explore/Home/Friends/Profile tabs, gated behind
 * session state, with the timezone backfill kicked off here.
 */
import React, { JSX } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useEnsureTimezone } from '@/hooks/useEnsureTimezone';
import { HeaderProfileName } from '@/components/HeaderProfileName';

/** Renders a themed FontAwesome tab bar icon. */
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}): JSX.Element {
  return <FontAwesome size={28} style={styles.tabBarIcon} {...props} />;
}

/** Gates the tab bar behind session state and renders the four main tabs. */
export default function TabLayout(): JSX.Element {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  useEnsureTimezone(session);
  const headerShown = useClientOnlyValue(false, true);

  if (loading) return <View style={styles.fill} />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        // prevents hydration error in React Navigation v6 on web
        headerShown,
        headerRight: () => <HeaderProfileName />,
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <TabBarIcon name="compass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="friends-feed"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
const styles = StyleSheet.create({
  tabBarIcon: {
    marginBottom: -3,
  },
  fill: {
    flex: 1,
  },
});
