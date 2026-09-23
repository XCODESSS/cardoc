import { useEffect, useState } from 'react';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PresentDocumentCard } from '../../components/PresentDocumentCard';
import { useAuthState } from '../../lib/auth';
import { createDocumentCache } from '../../lib/document-cache';
import { readOfflineIndex } from '../../lib/offline-index';
import { getPresentSlots, openPresentDocument, type PresentSlot } from '../../lib/present';
import type { Vehicle } from '../../types/vehicle';

export default function PresentScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const auth = useAuthState();
  const userId = auth.status === 'signedIn' || auth.status === 'offline' ? auth.userId : null;
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [slots, setSlots] = useState<PresentSlot[] | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !vehicleId) return;
    let active = true;
    void readOfflineIndex(userId).then(async (index) => {
      const found = index.vehicles.find((item) => item.id === vehicleId && item.userId === userId) ?? null;
      if (!active) return;
      setVehicle(found);
      if (!found) { setSlots([]); return; }
      const selected = getPresentSlots(vehicleId, index.documents, new Date(), userId);
      const cache = createDocumentCache(userId);
      const checked = await Promise.all(selected.map(async (slot): Promise<PresentSlot> => slot.document ? ({
        ...slot, document: { ...slot.document, offlineAvailable: await cache.exists(slot.document.id) },
      }) : slot));
      if (active) setSlots(checked);
    }).catch(() => { if (active) { setSlots([]); setError('Could not load saved documents.'); } });
    return () => { active = false; };
  }, [userId, vehicleId]);

  async function open(slot: PresentSlot) {
    if (!slot.document || opening) return;
    setOpening(slot.document.id);
    setError('');
    try {
      await openPresentDocument(slot.document);
      router.push(`/document/${slot.document.id}` as Href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open document. Retry.');
    } finally {
      setOpening(null);
    }
  }

  if (!userId || !vehicleId) return <View style={styles.page}><Text>Present Mode is unavailable.</Text></View>;
  const ready = slots?.length === 4 && slots.every((slot) => slot.document?.offlineAvailable && slot.status !== 'missing' && slot.status.kind !== 'expired');

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Text style={styles.backLabel}>‹ Back</Text></Pressable>
      {slots === null ? <ActivityIndicator accessibilityLabel="Loading documents" /> : vehicle ? <>
        <Text style={styles.vehicle}>{vehicle.nickname}</Text>
        <Text style={styles.heading}>{ready ? 'READY TO PRESENT' : 'DOCUMENTS TO PRESENT'}</Text>
        <View style={styles.cards}>
          {slots.map((slot) => <PresentDocumentCard key={slot.type} slot={slot} busy={opening === slot.document?.id} onPress={() => { void open(slot); }} />)}
        </View>
        {opening ? <Text style={styles.info}>Opening document…</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </> : <Text style={styles.info}>Vehicle not found on this device.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F9FA' },
  content: { paddingTop: 50, paddingHorizontal: 22, paddingBottom: 30 },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  backLabel: { color: '#124A73', fontSize: 17, fontWeight: '600' },
  vehicle: { color: '#13283A', fontSize: 28, fontWeight: '800', marginTop: 18 },
  heading: { color: '#176B42', fontSize: 14, fontWeight: '800', letterSpacing: 1.5, marginTop: 18, marginBottom: 22 },
  cards: { gap: 12 },
  info: { color: '#526575', fontSize: 16, marginTop: 20 },
  error: { color: '#A22727', fontSize: 16, marginTop: 20 },
});
