import { StyleSheet, Text, View } from 'react-native';

import type { CarDocument } from '../types/document';

export function DocumentCard({ document }: { document: CarDocument }) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{document.displayName}</Text>
      <Text style={styles.detail}>{document.scope === 'driver' ? 'Driver' : 'Vehicle'} · {document.type.replaceAll('_', ' ')}</Text>
      <Text style={styles.detail}>{document.offlineAvailable ? 'Available offline' : 'Online only'}</Text>
      {document.expiryDate ? <Text style={styles.detail}>Expires {document.expiryDate}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f1f6f8', borderRadius: 12, padding: 16, gap: 4 },
  name: { color: '#13283a', fontSize: 17, fontWeight: '700' },
  detail: { color: '#526575', fontSize: 14 },
});
