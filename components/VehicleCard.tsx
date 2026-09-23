import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Vehicle } from '../types/vehicle';

export function VehicleCard({ vehicle, onPress }: { vehicle: Vehicle; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${vehicle.nickname}`} onPress={onPress} style={styles.card}>
      <View>
        <Text style={styles.title}>{vehicle.nickname}</Text>
        <Text style={styles.registration}>{vehicle.registrationNumber}</Text>
        {vehicle.manufacturer || vehicle.model ? <Text style={styles.detail}>{[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ')}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#d6e0e6', borderRadius: 14, backgroundColor: '#fff', padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#13283a' },
  registration: { fontSize: 15, color: '#41586a', marginTop: 4 },
  detail: { fontSize: 14, color: '#526575', marginTop: 4 },
  chevron: { fontSize: 26, color: '#526575' },
});
