import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { restoreAuth, useAuthState } from '../lib/auth';

export default function RootLayout() {
  const auth = useAuthState();

  useEffect(() => {
    void restoreAuth();
  }, []);

  if (auth.status === 'loading') {
    return <View style={styles.center}><Text>Opening Cardoc…</Text></View>;
  }
  if (auth.status === 'configurationUnavailable') {
    return <View style={styles.center}><Text>Cardoc setup is unavailable on this build.</Text></View>;
  }
  if (auth.status === 'storageError') {
    return <View style={styles.center}><Text>Secure storage is unavailable. Cardoc cannot safely keep a session on this device.</Text></View>;
  }
  if (auth.status === 'offline') {
    // Task 7 adds the local device authentication gate before any offline document route.
    return <View style={styles.center}><Text>Offline documents are locked until device authentication is available.</Text></View>;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={auth.status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={auth.status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="vehicle" />
        <Stack.Screen name="document" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
});
