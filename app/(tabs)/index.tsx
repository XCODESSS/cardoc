import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { CardocTitle } from '../../components/CardocTitle';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <CardocTitle />
      <Link href="/settings">Settings</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
