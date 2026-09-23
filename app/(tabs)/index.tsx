import { useEffect, useState } from 'react';
import { Link, router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CardocTitle } from '../../components/CardocTitle';
import { useAuthState } from '../../lib/auth';
import { readOfflineIndex } from '../../lib/offline-index';
import type { Vehicle } from '../../types/vehicle';

export default function HomeScreen() {
  const auth = useAuthState();
  const userId = auth.status === 'signedIn' || auth.status === 'offline' ? auth.userId : null;
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void readOfflineIndex(userId).then((index) => {
      if (active) setVehicles(index.vehicles.filter((vehicle) => vehicle.userId === userId));
    }).catch(() => { if (active) setVehicles([]); });
    return () => { active = false; };
  }, [userId]);

  return (
    <View style={styles.container}>
      <CardocTitle />
      {vehicles.length ? <>
        <Text style={styles.heading}>Your vehicles</Text>
        {vehicles.map((vehicle) => <Pressable
          key={vehicle.id}
          accessibilityRole="button"
          accessibilityLabel={`Present ${vehicle.nickname}`}
          onPress={() => router.push(`/present/${vehicle.id}` as Href)}
          style={styles.present}
        ><Text style={styles.presentLabel}>Present · {vehicle.nickname}</Text></Pressable>)}
      </> : null}
      <Link href="/vehicles" style={styles.link}>Vehicles</Link>
      <Link href="/settings" style={styles.link}>Settings</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  heading: { color: '#13283A', fontSize: 20, fontWeight: '700', marginTop: 32, marginBottom: 14 },
  present: { minHeight: 58, borderRadius: 12, backgroundColor: '#124A73', justifyContent: 'center', paddingHorizontal: 20, marginBottom: 10 },
  presentLabel: { color: '#fff', fontSize: 18, fontWeight: '700' },
  link: { color: '#124A73', fontSize: 16, marginTop: 18 },
});
