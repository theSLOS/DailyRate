/**
 * Auth group layout — redirects to the tabs once signed in, otherwise
 * renders the sign-in/sign-up stack.
 */
import { Redirect, Stack } from 'expo-router';
import { JSX } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

/** Gates the auth stack behind session state: loading -> blank, signed in -> redirect, else the stack. */
export default function AuthLayout(): JSX.Element {
  const { session, loading } = useAuth();

  if (loading) return <View style={styles.fill} />;
  if (session) return <Redirect href="/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
