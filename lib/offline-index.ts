import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CarDocument } from '../types/document';
import type { Vehicle } from '../types/vehicle';

export type OfflineIndex = { vehicles: Vehicle[]; documents: CarDocument[] };
const VERSION = 1;

function key(userId: string) {
  if (!userId) throw new Error('A user ID is required for offline metadata.');
  return `cardoc.offline-index.v${VERSION}.${userId}`;
}

function ownsIndex(userId: string, index: OfflineIndex) {
  return index.vehicles.every((vehicle) => vehicle.userId === userId)
    && index.documents.every((document) => document.userId === userId);
}

export async function readOfflineIndex(userId: string): Promise<OfflineIndex> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return { vehicles: [], documents: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== VERSION
      || !('vehicles' in parsed) || !Array.isArray(parsed.vehicles)
      || !('documents' in parsed) || !Array.isArray(parsed.documents)) {
      return { vehicles: [], documents: [] };
    }
    const index = parsed as { version: number } & OfflineIndex;
    return ownsIndex(userId, index) ? { vehicles: index.vehicles, documents: index.documents } : { vehicles: [], documents: [] };
  } catch {
    return { vehicles: [], documents: [] };
  }
}

export async function writeOfflineIndex(userId: string, index: OfflineIndex): Promise<void> {
  if (!ownsIndex(userId, index)) throw new Error('Offline metadata owner mismatch.');
  await AsyncStorage.setItem(key(userId), JSON.stringify({ version: VERSION, ...index }));
}

export async function clearOfflineIndex(userId: string): Promise<void> {
  await AsyncStorage.removeItem(key(userId));
}
