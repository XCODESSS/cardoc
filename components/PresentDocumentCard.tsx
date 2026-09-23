import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDocumentStatusLabel } from '../lib/document-status';
import type { PresentSlot } from '../lib/present';

const LABELS = {
  registration: 'Registration / RC',
  driving_license: 'Driving Licence',
  insurance: 'Insurance',
  puc: 'PUC',
} as const;

type Props = { slot: PresentSlot; onPress: () => void; busy?: boolean };

export function PresentDocumentCard({ slot, onPress, busy = false }: Props) {
  const status = slot.status;
  const missing = status === 'missing';
  const statusLabel = status === 'missing' ? 'Missing' : getDocumentStatusLabel(status);
  const kind = status === 'missing' ? 'missing' : status.kind;
  const symbol = kind === 'missing' ? '–' : kind === 'expired' ? '✕' : kind === 'expiring' ? '!' : kind === 'unknown' ? '?' : '✓';
  const tone = kind === 'missing' || kind === 'unknown' ? styles.neutral
    : kind === 'valid' ? styles.valid : kind === 'expiring' ? styles.warning : styles.error;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${LABELS[slot.type]}, ${statusLabel}`}
      accessibilityState={{ disabled: missing || busy }}
      disabled={missing || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.card, missing && styles.missing, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{LABELS[slot.type]}</Text>
        <Text style={[styles.status, tone]}>{statusLabel}</Text>
      </View>
      <Text accessible={false} style={[styles.symbol, tone]}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 84, backgroundColor: '#fff', borderWidth: 1, borderColor: '#C5D0D9', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  missing: { backgroundColor: '#F3F5F7' },
  pressed: { opacity: 0.75 },
  text: { flex: 1, gap: 5 },
  label: { color: '#13283A', fontSize: 18, fontWeight: '700' },
  status: { fontSize: 15, fontWeight: '600' },
  symbol: { fontSize: 27, fontWeight: '700', marginLeft: 12 },
  neutral: { color: '#526575' },
  valid: { color: '#176B42' },
  warning: { color: '#905B00' },
  error: { color: '#A22727' },
});
