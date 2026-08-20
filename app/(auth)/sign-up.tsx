import { useState, JSX } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { TEST_IDS } from '@/constants/testIds';

export default function SignUpScreen(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPassword, setConfirmPassword] = useState('');
  async function handleSignUp(): Promise<void> {
    setLoading(true);
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up</Text>
      {error && (
        <Text testID={TEST_IDS.signUp.error} style={styles.error}>
          {error}
        </Text>
      )}
      <TextInput
        testID={TEST_IDS.signUp.email}
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        testID={TEST_IDS.signUp.password}
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TextInput
        testID={TEST_IDS.signUp.confirmPassword}
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      <Button
        testID={TEST_IDS.signUp.submit}
        label={loading ? 'Signing up...' : 'Sign up'}
        onPress={handleSignUp}
        disabled={loading}
        variant="primary"
      />
      <Link href="/(auth)/sign-in">
        <Text style={styles.link}>Already have an account? Sign in</Text>
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
