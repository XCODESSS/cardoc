import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { VehicleForm } from '../../components/VehicleForm';
import { DocumentCard } from '../../components/DocumentCard';
import { useAuthState } from '../../lib/auth';
import { listDocuments } from '../../lib/documents';
import { readOfflineIndex } from '../../lib/offline-index';
import { deleteVehicle, getVehicle, updateVehicle } from '../../lib/vehicles';
import type { CarDocument } from '../../types/document';
import type { Vehicle } from '../../types/vehicle';

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuthState();
  const userId = auth.status === 'signedIn' ? auth.userId : null;
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<CarDocument[]>([]);

  useFocusEffect(useCallback(() => {
    if (!userId || !id) return;
    let active = true;
    void listDocuments(userId).catch(async () => (await readOfflineIndex(userId)).documents).then((items) => {
      if (active) setDocuments(items.filter((item) => item.scope === 'driver' || item.vehicleId === id));
    }).catch(() => { if (active) setDocuments([]); });
    return () => { active = false; };
  }, [id, userId]));

  useEffect(() => {
    let active = true;
    if (!userId || !id) return () => { active = false; };
    void (async () => {
      try {
        const found = await getVehicle(id);
        if (active) setVehicle(found);
      } catch {
        const cached = await readOfflineIndex(userId);
        if (active) { setVehicle(cached.vehicles.find((item) => item.id === id) ?? null); setOffline(true); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, userId]);

  function confirmDelete() {
    Alert.alert('Delete vehicle?', 'This vehicle will be removed from Cardoc.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        void deleteVehicle(id).then(() => router.push('/vehicles')).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not delete this vehicle.');
        });
      } },
    ]);
  }

  return (
    <View style={styles.page}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Vehicles</Text></Pressable>
      {loading ? <ActivityIndicator accessibilityLabel="Loading vehicle" /> : vehicle ? <>
        <Text style={styles.title}>{vehicle.nickname}</Text>
        {offline ? <Text style={styles.status}>Offline · read only</Text> : null}
        <VehicleForm key={vehicle.id} vehicle={vehicle} disabled={offline} saveLabel="Save changes" onSave={async (input) => {
          const updated = await updateVehicle(vehicle.id, input);
          setVehicle(updated);
        }} footer={<>
          <Text style={styles.section}>Documents</Text>
          {documents.map((document) => <DocumentCard key={document.id} document={document} />)}
          {!documents.length ? <Text style={styles.missing}>No documents yet.</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Add document" disabled={offline}
            onPress={() => router.push({ pathname: '/document/new', params: { vehicleId: vehicle.id } })} style={styles.add}>
            <Text style={styles.addText}>Add document</Text>
          </Pressable>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Delete vehicle" disabled={offline} onPress={confirmDelete} style={styles.delete}>
            <Text style={styles.deleteText}>Delete vehicle</Text>
          </Pressable>
        </>} />
      </> : <Text style={styles.missing}>Vehicle not found.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff', paddingTop: 54 },
  back: { paddingHorizontal: 24, paddingVertical: 8 },
  backText: { color: '#124a73', fontSize: 16 },
  title: { color: '#13283a', fontSize: 28, fontWeight: '700', paddingHorizontal: 24, marginTop: 10 },
  status: { color: '#865f12', paddingHorizontal: 24, marginTop: 8, fontWeight: '600' },
  error: { color: '#ae2020' },
  section: { color: '#13283a', fontSize: 20, fontWeight: '700', marginTop: 20 },
  add: { backgroundColor: '#124a73', borderRadius: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  addText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  delete: { paddingVertical: 16, alignItems: 'center' },
  deleteText: { color: '#ae2020', fontSize: 16, fontWeight: '600' },
  missing: { color: '#526575', padding: 24 },
});
