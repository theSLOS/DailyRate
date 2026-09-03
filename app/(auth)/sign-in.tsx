/**
 * Email/password sign-in screen.
 */
import { useState, JSX } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { TEST_IDS } from '@/constants/testIds';

/** Renders the sign-in form and submits credentials to Supabase auth. */
export default function SignInScreen(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Signs in with the entered email/password, surfacing any auth error. */
  async function handleSignIn(): Promise<void> {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      {error && (
        <Text testID={TEST_IDS.signIn.error} style={styles.error}>
          {error}
        </Text>
      )}
      <TextInput
        testID={TEST_IDS.signIn.email}
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        testID={TEST_IDS.signIn.password}
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button
        testID={TEST_IDS.signIn.submit}
        label={loading ? 'Signing in...' : 'Sign in'}
        onPress={handleSignIn}
        disabled={loading}
        variant="primary"
      />
      <Link href="/(auth)/sign-up">
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
  error: { color: 'red', marginBottom: 12 },
  link: { marginTop: 16, textAlign: 'center', color: '#555' },
});
