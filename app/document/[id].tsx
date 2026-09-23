import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import DocumentViewer from '../../components/DocumentViewer';
import { useAuthState } from '../../lib/auth';
import { getDocument, getLocalDocumentUri } from '../../lib/documents';
import { readOfflineIndex } from '../../lib/offline-index';
import type { CarDocument } from '../../types/document';

type ViewerState =
  | { kind: 'loading' }
  | { kind: 'ready'; document: CarDocument; uri: string }
  | { kind: 'unavailable'; message: string };

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const auth = useAuthState();
  const [state, setState] = useState<ViewerState>({ kind: 'loading' });

  useEffect(() => {
    if (!id || !auth.userId || (auth.status !== 'signedIn' && auth.status !== 'offline')) return;
    let active = true;

    async function load() {
      let cached: CarDocument | null = null;
      try {
        const index = await readOfflineIndex(auth.userId!);
        cached = index.documents.find((item) => item.id === id && item.userId === auth.userId) ?? null;
      } catch {
        // Online users can still fetch metadata when local metadata is unreadable.
      }
      if (cached) {
        const localUri = await getLocalDocumentUri(cached);
        if (localUri) {
          if (active) setState({ kind: 'ready', document: cached, uri: localUri });
          return;
        }
      }

      let document: CarDocument | null = cached;

      if (auth.status === 'signedIn') {
        try {
          document = await getDocument(id!);
        } catch {
          // A cached document remains usable when the network fails.
        }
      }
      if (!document) {
        if (active) setState({ kind: 'unavailable', message: 'Document unavailable.' });
        return;
      }
      const uri = await getLocalDocumentUri(document);
      if (active) setState(uri
        ? { kind: 'ready', document, uri }
        : { kind: 'unavailable', message: 'Offline copy unavailable. Connect to the internet and download this document.' });
    }

    void load().catch(() => {
      if (active) setState({ kind: 'unavailable', message: 'Document unavailable.' });
    });
    return () => { active = false; };
  }, [auth.status, auth.userId, id]);

  if (state.kind === 'ready' && state.document.id === id && state.document.userId === auth.userId) {
    return <DocumentViewer key={`${state.document.id}:${state.uri}`} document={state.document} uri={state.uri} onClose={() => router.back()} />;
  }

  const displayState = !id || !auth.userId || (auth.status !== 'signedIn' && auth.status !== 'offline')
    ? { kind: 'unavailable' as const, message: 'Document unavailable.' }
    : state.kind === 'ready' ? { kind: 'loading' as const } : state;

  return (
    <View style={styles.page}>
      {displayState.kind === 'loading' ? <ActivityIndicator accessibilityLabel="Opening document" size="large" color="#124a73" /> : (
        <Text accessibilityRole="alert" style={styles.message}>{displayState.message}</Text>
      )}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff', gap: 20 },
  message: { fontSize: 18, color: '#13283a', textAlign: 'center' },
  close: { padding: 14 },
  closeText: { fontSize: 17, color: '#124a73', fontWeight: '700' },
});
