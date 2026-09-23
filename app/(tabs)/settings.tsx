import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logout } from '../../lib/auth';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      await logout();
    } catch {
      setError('Sign-out could not finish. Cardoc is locked; try again when secure storage is available.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Settings</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={() => void signOut()} disabled={loading} accessibilityRole="button">
        <Text style={styles.buttonText}>{loading ? 'Signing out…' : 'Sign out'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 28, color: '#13283a' },
  button: { padding: 16, backgroundColor: '#124a73', borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#ae2020', marginBottom: 12 },
});
