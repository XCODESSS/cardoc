import { StyleSheet, Text } from 'react-native';

export function CardocTitle() {
  return <Text style={styles.title}>Cardoc</Text>;
}

const styles = StyleSheet.create({
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '700',
  },
});
