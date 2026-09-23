import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { VehicleForm } from '../../components/VehicleForm';
import { DocumentCard } from '../../components/DocumentCard';
import { useAuthState } from '../../lib/auth';
import { deleteDocument } from '../../lib/document-delete';
import { listDocuments } from '../../lib/documents';
import { readOfflineIndex } from '../../lib/offline-index';
import { deleteVehicle, getVehicle, updateVehicle } from '../../lib/vehicles';
import type { CarDocument } from '../../types/document';
import type { Vehicle } from '../../types/vehicle';

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuthState();
  const userId = auth.status === 'signedIn' || auth.status === 'offline' ? auth.userId : null;
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(auth.status === 'offline');
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState<CarDocument[]>([]);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId || !id) return;
    let active = true;
    const load = auth.status === 'offline'
      ? readOfflineIndex(userId).then((index) => index.documents)
      : listDocuments(userId).catch(async () => (await readOfflineIndex(userId)).documents);
    void load.then((items) => {
      if (active) setDocuments(items.filter((item) => item.userId === userId && (item.scope === 'driver' || item.vehicleId === id)));
    }).catch(() => { if (active) setDocuments([]); });
    return () => { active = false; };
  }, [auth.status, id, userId]));

  useEffect(() => {
    let active = true;
    if (!userId || !id) return () => { active = false; };
    void (async () => {
      try {
        if (auth.status === 'offline') {
          const cached = await readOfflineIndex(userId);
          if (active) { setVehicle(cached.vehicles.find((item) => item.id === id && item.userId === userId) ?? null); setOffline(true); }
        } else {
          const found = await getVehicle(id);
          if (active) { setVehicle(found); setOffline(false); }
        }
      } catch {
        const cached = await readOfflineIndex(userId);
        if (active) { setVehicle(cached.vehicles.find((item) => item.id === id && item.userId === userId) ?? null); setOffline(true); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [auth.status, id, userId]);

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

  function confirmDeleteDocument(document: CarDocument) {
    if (offline || deletingDocumentId) return;
    Alert.alert('Delete document?', `${document.displayName} will be removed from Cardoc and this device.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        setDeletingDocumentId(document.id);
        setError('');
        void deleteDocument(document.id).then(() => {
          setDocuments((current) => current.filter((item) => item.id !== document.id));
        }).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not delete this document.');
        }).finally(() => setDeletingDocumentId(null));
      } },
    ]);
  }

  return (
    <View style={styles.page}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Vehicles</Text></Pressable>
      {loading ? <ActivityIndicator accessibilityLabel="Loading vehicle" /> : vehicle ? <>
        <Text style={styles.title}>{vehicle.nickname}</Text>
        {offline ? <Text style={styles.status}>Offline · read only</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Present documents"
          onPress={() => router.push(`/present/${vehicle.id}` as Href)} style={styles.present}>
          <Text style={styles.presentText}>Present documents</Text>
        </Pressable>
        <VehicleForm key={vehicle.id} vehicle={vehicle} disabled={offline} saveLabel="Save changes" onSave={async (input) => {
          const updated = await updateVehicle(vehicle.id, input);
          setVehicle(updated);
        }} footer={<>
          <Text style={styles.section}>Documents</Text>
          {documents.map((document) => <View key={document.id} style={styles.documentItem}>
            <Pressable accessibilityRole="button" accessibilityLabel={`View ${document.displayName}`}
              onPress={() => router.push(`/document/${document.id}` as Href)}>
              <DocumentCard document={document} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${document.displayName}`}
              disabled={offline || deletingDocumentId !== null} onPress={() => confirmDeleteDocument(document)}
              style={styles.documentDelete}>
              <Text style={styles.deleteText}>{deletingDocumentId === document.id ? 'Deleting...' : `Delete ${document.displayName}`}</Text>
            </Pressable>
          </View>)}
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
  present: { backgroundColor: '#124a73', borderRadius: 10, minHeight: 58, alignItems: 'center', justifyContent: 'center', marginHorizontal: 24, marginTop: 18 },
  presentText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  error: { color: '#ae2020' },
  section: { color: '#13283a', fontSize: 20, fontWeight: '700', marginTop: 20 },
  documentItem: { marginTop: 10 },
  documentDelete: { alignSelf: 'flex-end', paddingVertical: 10, paddingHorizontal: 6 },
  add: { backgroundColor: '#124a73', borderRadius: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  addText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  delete: { paddingVertical: 16, alignItems: 'center' },
  deleteText: { color: '#ae2020', fontSize: 16, fontWeight: '600' },
  missing: { color: '#526575', padding: 24 },
});
