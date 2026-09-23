import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { VehicleForm } from '../../components/VehicleForm';
import { createVehicle } from '../../lib/vehicles';

export default function NewVehicleScreen() {
  return (
    <View style={styles.page}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Vehicles</Text></Pressable>
      <Text style={styles.title}>Add vehicle</Text>
      <VehicleForm onSave={async (input) => { await createVehicle(input); router.push('/vehicles'); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff', paddingTop: 54 },
  back: { paddingHorizontal: 24, paddingVertical: 8 },
  backText: { color: '#124a73', fontSize: 16 },
  title: { color: '#13283a', fontSize: 28, fontWeight: '700', paddingHorizontal: 24, marginTop: 10 },
});
