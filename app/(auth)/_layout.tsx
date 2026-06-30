import { Redirect, Stack } from 'expo-router';
import { JSX } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

export default function AuthLayout(): JSX.Element {
  const { session, loading } = useAuth();

  if (loading) return <View style={styles.fill} />;
  if (session) return <Redirect href="/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
