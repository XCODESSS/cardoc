import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { getAuthState, restoreAuth, useAuthState } from '../lib/auth';
import { authenticateDevice, canOpenProtectedRoutes } from '../lib/app-lock';

export default function RootLayout() {
  const auth = useAuthState();
  const previousStatus = useRef(auth.status);
  const foreground = useRef(true);
  const [unlockedFor, setUnlockedFor] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState('');

  useEffect(() => {
    void restoreAuth();
  }, []);

  useEffect(() => {
    let active = true;
    if (previousStatus.current === 'signedOut' && auth.status === 'signedIn' && auth.userId) {
      const userId = auth.userId;
      queueMicrotask(() => { if (active) setUnlockedFor(userId); });
    } else if (auth.status === 'signedOut' || auth.status === 'configurationUnavailable' || auth.status === 'storageError') {
      queueMicrotask(() => { if (active) setUnlockedFor(null); });
    }
    previousStatus.current = auth.status;
    return () => { active = false; };
  }, [auth.status, auth.userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        foreground.current = false;
        setUnlockedFor(null);
        setUnlockMessage('');
      } else if (next === 'active') {
        foreground.current = true;
      }
    });
    return () => subscription?.remove();
  }, []);

  async function unlock() {
    if (unlockBusy || !auth.userId) return;
    setUnlockBusy(true);
    setUnlockMessage('');
    const result = await authenticateDevice();
    const current = getAuthState();
    if (result === 'unlocked' && foreground.current && current.userId === auth.userId
      && (current.status === 'signedIn' || current.status === 'offline')) {
      setUnlockedFor(auth.userId);
    } else if (result === 'unavailable') {
      setUnlockMessage('Set up device authentication to unlock Cardoc.');
    } else if (result === 'denied') {
      setUnlockMessage('Cardoc is still locked. Try again.');
    }
    setUnlockBusy(false);
  }

  if (auth.status === 'loading') {
    return <View style={styles.center}><Text>Opening Cardoc…</Text></View>;
  }
  if (auth.status === 'configurationUnavailable') {
    return <View style={styles.center}><Text>Cardoc setup is unavailable on this build.</Text></View>;
  }
  if (auth.status === 'storageError') {
    return <View style={styles.center}><Text>Secure storage is unavailable. Cardoc cannot safely keep a session on this device.</Text></View>;
  }
  if ((auth.status === 'signedIn' || auth.status === 'offline')
    && !canOpenProtectedRoutes(auth.status, auth.userId, unlockedFor)) {
    return <View style={styles.locked}>
      <Text style={styles.lockTitle}>Cardoc is locked</Text>
      <Text style={styles.lockDescription}>Unlock to view your vehicle documents.</Text>
      {unlockMessage ? <Text accessibilityRole="alert" style={styles.lockDescription}>{unlockMessage}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Unlock Cardoc" disabled={unlockBusy}
        style={styles.unlockButton} onPress={() => void unlock()}>
        <Text style={styles.unlockText}>{unlockBusy ? 'Unlocking…' : 'Unlock Cardoc'}</Text>
      </Pressable>
    </View>;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={auth.status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={canOpenProtectedRoutes(auth.status, auth.userId, unlockedFor)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="vehicle" />
        <Stack.Screen name="document" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  locked: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#fff', gap: 16 },
  lockTitle: { color: '#13283a', fontSize: 28, fontWeight: '700' },
  lockDescription: { color: '#375064', fontSize: 17, lineHeight: 24 },
  unlockButton: { minHeight: 54, borderRadius: 10, backgroundColor: '#124a73', alignItems: 'center', justifyContent: 'center' },
  unlockText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
