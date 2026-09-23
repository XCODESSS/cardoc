import { StyleSheet, Text } from 'react-native';

import { getDocumentStatus, getDocumentStatusLabel } from '../lib/document-status';

interface ExpiryBadgeProps {
  expiryDate: string | null;
  today?: Date;
}

export default function ExpiryBadge({ expiryDate, today }: ExpiryBadgeProps) {
  const status = getDocumentStatus(expiryDate, today);
  return (
    <Text accessibilityRole="text" style={[styles.base, styles[status.kind]]}>
      {getDocumentStatusLabel(status)}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 15, fontWeight: '600' },
  unknown: { color: '#555F6D' },
  valid: { color: '#176B42' },
  expiring: { color: '#905B00' },
  expired: { color: '#A22727' },
});
