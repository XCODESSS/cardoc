import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuthState } from '../../lib/auth';
import { retryOfflineCopy, selectFile, selectPhoto, uploadDocument } from '../../lib/document-upload';
import type { ReminderResult } from '../../lib/notifications';
import { listVehicles } from '../../lib/vehicles';
import type { CarDocument, DocumentType } from '../../types/document';
import { DOCUMENT_TYPES } from '../../types/document';
import type { Vehicle } from '../../types/vehicle';
import { documentInputSchema, type SelectedFile } from '../../validation/document';

const labels: Record<DocumentType, string> = {
  registration: 'Registration / RC', driving_license: 'Driving Licence', insurance: 'Insurance',
  puc: 'PUC', warranty: 'Warranty', service: 'Service Record', invoice: 'Purchase Invoice',
  finance: 'Finance Document', other: 'Other',
};

export default function NewDocumentScreen() {
  const { vehicleId: initialVehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const auth = useAuthState();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [type, setType] = useState<DocumentType>('registration');
  const [vehicleId, setVehicleId] = useState<string | null>(initialVehicleId ?? null);
  const [displayName, setDisplayName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [saved, setSaved] = useState<CarDocument | null>(null);
  const [askReminderPermission, setAskReminderPermission] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<ReminderResult | 'error'>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (auth.status !== 'signedIn' || !auth.userId) return;
    let active = true;
    void listVehicles(auth.userId).then((result) => {
      if (active) {
        setVehicles(result);
        setVehicleId((current) => current ?? result[0]?.id ?? null);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load vehicles.');
    });
    return () => { active = false; };
  }, [auth.status, auth.userId]);

  async function choose(picker: typeof selectFile) {
    setError('');
    try {
      const selected = await picker();
      if (selected) {
        setFile(selected);
        if (!displayName.trim()) setDisplayName(selected.name.replace(/\.[^.]+$/, ''));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not choose that file.');
    }
  }

  async function save() {
    if (busy || !file) { setError('Choose a PDF, JPEG, or PNG document.'); return; }
    const parsed = documentInputSchema.safeParse({
      scope: type === 'driving_license' ? 'driver' : 'vehicle', type, displayName,
      vehicleId: type === 'driving_license' ? null : vehicleId,
      expiryDate: expiryDate.trim() || null,
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check document details.'); return; }
    setBusy(true);
    setError('');
    try {
      const reminderOutcome: { current: ReminderResult | 'error' } = { current: 'none' };
      const document = await uploadDocument(parsed.data, file, {
        requestReminderPermission: askReminderPermission,
        onReminderResult: (result) => { reminderOutcome.current = result; },
      });
      if (document.offlineAvailable && reminderOutcome.current !== 'disabled' && reminderOutcome.current !== 'error') {
        router.back();
      } else {
        setReminderStatus(reminderOutcome.current);
        setSaved(document);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this document.');
    } finally {
      setBusy(false);
    }
  }

  async function retryOffline() {
    if (!saved || !file || busy) return;
    setBusy(true);
    setError('');
    try {
      const document = await retryOfflineCopy(saved, file);
      setSaved(document);
      router.back();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Offline copy still unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.title}>Add document</Text>
      {saved ? <>
        {!saved.offlineAvailable ? <Text accessibilityRole="alert" style={styles.warning}>Saved online. This document is not available offline yet.</Text> : null}
        {reminderStatus === 'disabled' ? <Text accessibilityRole="alert" style={styles.warning}>Saved. Expiry reminders are off. Enable notifications in phone settings to receive them.</Text> : null}
        {reminderStatus === 'error' ? <Text accessibilityRole="alert" style={styles.warning}>Saved. Expiry reminders could not be scheduled on this device.</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!saved.offlineAvailable ? <Pressable accessibilityRole="button" accessibilityLabel="Retry offline copy" onPress={() => void retryOffline()} disabled={busy} style={styles.button}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Retry offline copy</Text>}
        </Pressable> : null}
        <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.back}>Done</Text></Pressable>
      </> : <>
        <Text style={styles.label}>Type</Text>
        <View style={styles.choices}>{DOCUMENT_TYPES.map((option) => (
          <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: type === option }}
            onPress={() => { setType(option); setDisplayName(labels[option]); }} style={[styles.choice, type === option && styles.selected]}>
            <Text style={type === option ? styles.selectedText : styles.choiceText}>{labels[option]}</Text>
          </Pressable>
        ))}</View>
        {type !== 'driving_license' ? <>
          <Text style={styles.label}>Vehicle</Text>
          <View style={styles.choices}>{vehicles.map((vehicle) => (
            <Pressable key={vehicle.id} accessibilityRole="button" accessibilityState={{ selected: vehicleId === vehicle.id }}
              onPress={() => setVehicleId(vehicle.id)} style={[styles.choice, vehicleId === vehicle.id && styles.selected]}>
              <Text style={vehicleId === vehicle.id ? styles.selectedText : styles.choiceText}>{vehicle.nickname}</Text>
            </Pressable>
          ))}</View>
          {!vehicles.length ? <Text style={styles.hint}>Add a vehicle first for vehicle documents.</Text> : null}
        </> : <Text style={styles.hint}>Your driving licence is available with every vehicle.</Text>}
        <Text style={styles.label}>Document</Text>
        <View style={styles.choices}>
          <Pressable accessibilityRole="button" onPress={() => void choose(selectFile)} style={styles.choice}><Text style={styles.choiceText}>Choose from Files</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void choose(selectPhoto)} style={styles.choice}><Text style={styles.choiceText}>Choose from Photos</Text></Pressable>
        </View>
        {file ? <Text style={styles.hint}>{file.name}</Text> : null}
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Insurance" editable={!busy} />
        <Text style={styles.label}>Expiry date (optional)</Text>
        <TextInput style={styles.input} value={expiryDate} onChangeText={setExpiryDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" editable={!busy} />
        {expiryDate.trim() ? <>
          <Text style={styles.hint}>Cardoc can remind you 30, 7, and 1 days before expiry at 9 AM. Notifications do not include document details.</Text>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: askReminderPermission }} accessibilityLabel="Ask to enable expiry reminders"
            onPress={() => setAskReminderPermission((current) => !current)} disabled={busy} style={[styles.choice, askReminderPermission && styles.selected]}>
            <Text style={askReminderPermission ? styles.selectedText : styles.choiceText}>{askReminderPermission ? 'Ask to enable reminders: On' : 'Ask to enable reminders: Off'}</Text>
          </Pressable>
        </> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Save document" onPress={() => void save()} disabled={busy} style={styles.button}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save document</Text>}
        </Pressable>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff', padding: 24, paddingTop: 54, gap: 12, paddingBottom: 52 },
  back: { color: '#124a73', fontSize: 16 },
  title: { color: '#13283a', fontSize: 28, fontWeight: '700' },
  label: { color: '#13283a', fontSize: 15, fontWeight: '700', marginTop: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: '#b4c4ce', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  selected: { backgroundColor: '#124a73', borderColor: '#124a73' },
  choiceText: { color: '#13283a', fontSize: 15 },
  selectedText: { color: '#fff', fontSize: 15 },
  input: { borderWidth: 1, borderColor: '#b4c4ce', borderRadius: 10, padding: 14, fontSize: 16 },
  hint: { color: '#526575' },
  warning: { color: '#865f12', fontSize: 16, lineHeight: 24 },
  error: { color: '#ae2020' },
  button: { backgroundColor: '#124a73', borderRadius: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
