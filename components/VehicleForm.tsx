import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import type { Vehicle } from '../types/vehicle';
import { vehicleInputSchema, type VehicleInput } from '../validation/vehicle';

export function VehicleForm({ vehicle, onSave, saveLabel = 'Save vehicle', disabled = false, footer }: {
  vehicle?: Vehicle;
  onSave: (input: VehicleInput) => Promise<void>;
  saveLabel?: string;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const [nickname, setNickname] = useState(vehicle?.nickname ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(vehicle?.registrationNumber ?? '');
  const [manufacturer, setManufacturer] = useState(vehicle?.manufacturer ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [year, setYear] = useState(vehicle?.year?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy || disabled) return;
    const parsed = vehicleInputSchema.safeParse({
      nickname, registrationNumber, manufacturer, model,
      year: year.trim() ? Number(year) : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the vehicle details.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSave(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this vehicle.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Vehicle nickname</Text>
      <TextInput style={styles.input} placeholder="My BMW" value={nickname} onChangeText={setNickname} autoCapitalize="words" editable={!disabled && !busy} />
      <Text style={styles.label}>Registration number</Text>
      <TextInput style={styles.input} placeholder="GJ05AB1234" value={registrationNumber} onChangeText={setRegistrationNumber} autoCapitalize="characters" editable={!disabled && !busy} />
      <Text style={styles.label}>Manufacturer (optional)</Text>
      <TextInput style={styles.input} placeholder="BMW" value={manufacturer} onChangeText={setManufacturer} editable={!disabled && !busy} />
      <Text style={styles.label}>Model (optional)</Text>
      <TextInput style={styles.input} placeholder="330i" value={model} onChangeText={setModel} editable={!disabled && !busy} />
      <Text style={styles.label}>Year (optional)</Text>
      <TextInput style={styles.input} placeholder="2022" value={year} onChangeText={setYear} keyboardType="number-pad" editable={!disabled && !busy} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={saveLabel} onPress={() => void submit()} disabled={disabled || busy} style={[styles.button, disabled && styles.disabled]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{saveLabel}</Text>}
      </Pressable>
      {disabled ? <Text style={styles.readOnly}>Connect to the internet to change vehicle details.</Text> : null}
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: { padding: 24, gap: 10, paddingBottom: 40 },
  label: { color: '#13283a', fontWeight: '600', fontSize: 15, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#b4c4ce', borderRadius: 10, padding: 14, fontSize: 16, color: '#13283a' },
  error: { color: '#ae2020', marginTop: 8 },
  button: { backgroundColor: '#124a73', borderRadius: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  readOnly: { color: '#526575', textAlign: 'center' },
});
