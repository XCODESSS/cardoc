import { useState } from 'react';
import { PdfView } from '@kishannareshpal/expo-pdf';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDocumentStatus, getDocumentStatusLabel, parseExpiryDate } from '../lib/document-status';
import type { CarDocument } from '../types/document';

type Props = { document: CarDocument; uri: string; onClose(): void };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function validityText(expiryDate: string | null): string {
  if (!expiryDate) return 'No expiry date';
  const date = parseExpiryDate(expiryDate);
  const formatted = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  const status = getDocumentStatus(expiryDate);
  if (status.kind === 'valid') return `Valid until ${formatted}`;
  return `${getDocumentStatusLabel(status)} · ${formatted}`;
}

export default function DocumentViewer({ document, uri, onClose }: Props) {
  const [renderFailed, setRenderFailed] = useState(false);

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.documentSurface}>
        {renderFailed ? (
          <Text accessibilityRole="alert" style={styles.failure}>This document could not be displayed.</Text>
        ) : document.mimeType === 'application/pdf' ? (
          <PdfView uri={uri} style={styles.document} onError={() => setRenderFailed(true)} />
        ) : (
          <Image source={{ uri }} contentFit="contain" style={styles.document} onError={() => setRenderFailed(true)} />
        )}
      </View>
      <View style={styles.details}>
        <Text style={styles.name}>{document.displayName}</Text>
        <Text style={styles.validity}>{validityText(document.expiryDate)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close document" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#071521' },
  documentSurface: { flex: 1, justifyContent: 'center', backgroundColor: '#101b26' },
  document: { flex: 1, width: '100%' },
  failure: { color: '#fff', fontSize: 18, textAlign: 'center', padding: 24 },
  details: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 20, gap: 8 },
  name: { color: '#13283a', fontSize: 24, fontWeight: '700' },
  validity: { color: '#375064', fontSize: 17 },
  close: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  closeText: { color: '#124a73', fontSize: 17, fontWeight: '700' },
});
