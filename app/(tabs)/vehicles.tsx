import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { VehicleCard } from '../../components/VehicleCard';
import { useAuthState } from '../../lib/auth';
import { readOfflineIndex } from '../../lib/offline-index';
import { listVehicles } from '../../lib/vehicles';
import type { Vehicle } from '../../types/vehicle';

export default function VehiclesScreen() {
  const auth = useAuthState();
  const userId = auth.status === 'signedIn' || auth.status === 'offline' ? auth.userId : null;
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const readOnly = auth.status === 'offline' || offline;
  const visibleVehicles = vehicles.filter((vehicle) => vehicle.userId === userId);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!userId) {
      setVehicles([]);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void (async () => {
      try {
        const cached = await readOfflineIndex(userId);
        if (active) setVehicles(cached.vehicles);
        if (auth.status === 'offline') {
          if (active) setOffline(true);
          return;
        }
        const fresh = await listVehicles(userId);
        if (active) { setVehicles(fresh); setOffline(false); }
      } catch {
        if (active) setOffline(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [auth.status, userId]));

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Vehicles</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Add vehicle" disabled={readOnly || !userId} onPress={() => router.push('/vehicle/new')} style={[styles.addButton, (readOnly || !userId) && styles.disabled]}>
          <Text style={styles.addText}>Add vehicle</Text>
        </Pressable>
      </View>
      {readOnly ? <Text style={styles.status}>Offline · read only</Text> : null}
      {loading && visibleVehicles.length === 0 ? <ActivityIndicator accessibilityLabel="Loading vehicles" /> : null}
      <FlatList
        data={visibleVehicles}
        keyExtractor={(vehicle) => vehicle.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <VehicleCard vehicle={item} onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: item.id } })} />}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>{readOnly ? 'No saved vehicles are available on this device.' : 'Add your first vehicle to get started.'}</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7fafc', paddingTop: 54 },
  header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 30, fontWeight: '700', color: '#13283a' },
  addButton: { backgroundColor: '#124a73', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  addText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  status: { color: '#865f12', paddingHorizontal: 20, marginTop: 16, fontWeight: '600' },
  list: { padding: 20, gap: 12, flexGrow: 1 },
  empty: { color: '#526575', textAlign: 'center', marginTop: 40, fontSize: 16 },
});
