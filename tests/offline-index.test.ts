import AsyncStorage from '@react-native-async-storage/async-storage';

import { readOfflineIndex, writeOfflineIndex } from '../lib/offline-index';
import type { Vehicle } from '../types/vehicle';

jest.mock('@react-native-async-storage/async-storage', () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
      removeItem: jest.fn(async (key: string) => { values.delete(key); }),
    },
  };
});

const vehicle: Vehicle = {
  id: 'vehicle-a', userId: 'user-a', nickname: 'My BMW',
  registrationNumber: 'GJ05AB1234', manufacturer: 'BMW', model: '330i',
  year: 2022, createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z',
};

test('keeps versioned metadata in separate account keys', async () => {
  await writeOfflineIndex('user-a', { vehicles: [vehicle], documents: [] });
  expect((await readOfflineIndex('user-a')).vehicles).toEqual([vehicle]);
  expect(await readOfflineIndex('user-b')).toEqual({ vehicles: [], documents: [] });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('cardoc.offline-index.v1.user-a', expect.stringContaining('"version":1'));
});

test('rejects metadata belonging to another owner', async () => {
  await expect(writeOfflineIndex('user-b', { vehicles: [vehicle], documents: [] })).rejects.toThrow('owner');
});

test('does not use an index with an unsupported version', async () => {
  await AsyncStorage.setItem('cardoc.offline-index.v1.old-user', JSON.stringify({ version: 99, vehicles: [vehicle], documents: [] }));
  expect(await readOfflineIndex('old-user')).toEqual({ vehicles: [], documents: [] });
});
