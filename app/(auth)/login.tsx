import { useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { login } from '../../lib/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Cardoc</Text>
      <Text style={styles.subtitle}>Sign in to your documents</Text>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={() => void submit()} disabled={loading} accessibilityRole="button">
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
      <Link href="/register" style={styles.link}>Create account</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#fff' },
  title: { fontSize: 34, fontWeight: '700', color: '#13283a' },
  subtitle: { fontSize: 17, color: '#526575', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#b4c4ce', borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: '#124a73', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ae2020' },
  link: { color: '#124a73', textAlign: 'center', marginTop: 12, fontSize: 16 },
});
