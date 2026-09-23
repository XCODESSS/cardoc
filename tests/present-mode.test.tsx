import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import HomeScreen from '../app/(tabs)/index';
import PresentScreen from '../app/present/[vehicleId]';
import VehicleDetailScreen from '../app/vehicle/[id]';
import { getPresentSlots, openPresentDocument } from '../lib/present';
import type { CarDocument } from '../types/document';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const RC_ID = '44444444-4444-4444-8444-444444444444';
const mockGet = jest.fn();
const mockSave = jest.fn();
const mockSignedUrl = jest.fn();
const mockDownloadFile = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockExists = jest.fn();
const mockGetVehicle = jest.fn();
const mockListDocuments = jest.fn();
const mockPush = jest.fn();
let mockAuthStatus: 'signedIn' | 'offline' = 'offline';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
    useLocalSearchParams: () => ({ vehicleId: VEHICLE_ID, id: VEHICLE_ID }),
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../lib/vehicles', () => ({ getVehicle: (...args: unknown[]) => mockGetVehicle(...args), updateVehicle: jest.fn(), deleteVehicle: jest.fn() }));
jest.mock('../lib/documents', () => ({ listDocuments: (...args: unknown[]) => mockListDocuments(...args) }));
jest.mock('../lib/auth', () => ({
  getAuthState: () => ({ status: mockAuthStatus, userId: '11111111-1111-4111-8111-111111111111' }),
  useAuthState: () => ({ status: mockAuthStatus, userId: '11111111-1111-4111-8111-111111111111' }),
}));
jest.mock('../lib/document-cache', () => ({
  createDocumentCache: () => ({ get: (...args: unknown[]) => mockGet(...args), save: (...args: unknown[]) => mockSave(...args), exists: (...args: unknown[]) => mockExists(...args) }),
}));
jest.mock('../lib/offline-index', () => ({ readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args) }));
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ storage: { from: () => ({ createSignedUrl: (...args: unknown[]) => mockSignedUrl(...args) }) } }),
}));
jest.mock('expo-file-system', () => {
  class File {
    static downloadFileAsync = (...args: unknown[]) => mockDownloadFile(...args);
    uri: string;
    size = 100;
    exists = true;
    delete = jest.fn();
    constructor(...parts: unknown[]) { this.uri = parts.join('/'); }
  }
  return { File, Paths: { cache: 'file:///cache' } };
});

function document(partial: Partial<CarDocument> = {}): CarDocument {
  return {
    id: RC_ID, userId: USER_ID, vehicleId: VEHICLE_ID, scope: 'vehicle', type: 'registration',
    displayName: 'RC', filePath: `${USER_ID}/${RC_ID}.pdf`, mimeType: 'application/pdf', sizeBytes: 100,
    expiryDate: null, offlineAvailable: true, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z',
    ...partial,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthStatus = 'offline';
  mockGet.mockResolvedValue('file:///documents/rc.pdf');
  mockSave.mockResolvedValue('file:///documents/rc.pdf');
  mockExists.mockResolvedValue(true);
  mockGetVehicle.mockResolvedValue({ id: VEHICLE_ID, userId: USER_ID, nickname: 'My BMW', registrationNumber: 'GJ05AB1234', manufacturer: null, model: null, year: null });
  mockListDocuments.mockResolvedValue([]);
  mockReadOfflineIndex.mockResolvedValue({
    vehicles: [{ id: VEHICLE_ID, userId: USER_ID, nickname: 'My BMW', registrationNumber: 'GJ05AB1234' }],
    documents: [document()],
  });
});

test('shows the selected vehicle documents and one driver licence, excluding another vehicle', () => {
  const licence = document({ id: '55555555-5555-4555-8555-555555555555', type: 'driving_license', scope: 'driver', vehicleId: null });
  const insurance = document({ id: '66666666-6666-4666-8666-666666666666', type: 'insurance' });
  const otherPuc = document({ id: '77777777-7777-4777-8777-777777777777', type: 'puc', vehicleId: OTHER_VEHICLE_ID });
  const slots = getPresentSlots(VEHICLE_ID, [document(), licence, insurance, otherPuc], new Date(2026, 8, 23), USER_ID);
  expect(slots.map((slot) => slot.type)).toEqual(['registration', 'driving_license', 'insurance', 'puc']);
  expect(slots.map((slot) => slot.document?.id ?? null)).toEqual([RC_ID, licence.id, insurance.id, null]);
});

test('marks expired and missing documents and chooses the newest duplicate deterministically', () => {
  const older = document({ id: '88888888-8888-4888-8888-888888888888', expiryDate: '2026-09-22' });
  const newest = document({ id: '99999999-9999-4999-8999-999999999999', expiryDate: '2026-09-22', updatedAt: '2026-09-21T00:00:00Z' });
  const slots = getPresentSlots(VEHICLE_ID, [older, newest], new Date(2026, 8, 23), USER_ID);
  expect(slots[0]).toMatchObject({ document: newest, status: { kind: 'expired', daysRemaining: -1 } });
  expect(slots[1]).toMatchObject({ document: null, status: 'missing' });
  expect(getPresentSlots(VEHICLE_ID, [document(), document({ id: newest.id })], new Date(2026, 8, 23), USER_ID)[0].document?.id).toBe(newest.id);
});

test('rejects another account even when vehicle IDs coincide', () => {
  const foreign = document({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'driving_license', scope: 'driver', vehicleId: null });
  const slots = getPresentSlots(VEHICLE_ID, [foreign], new Date(2026, 8, 23), USER_ID);
  expect(slots[1].document).toBeNull();
});

test('cached document opens without a storage or network call', async () => {
  const uri = await openPresentDocument(document());
  expect(uri).toBe('file:///documents/rc.pdf');
  expect(mockSignedUrl).not.toHaveBeenCalled();
  expect(mockDownloadFile).not.toHaveBeenCalled();
});

test('cached document also skips network while a persisted session reports signed in', async () => {
  mockAuthStatus = 'signedIn';
  await expect(openPresentDocument(document())).resolves.toBe('file:///documents/rc.pdf');
  expect(mockSignedUrl).not.toHaveBeenCalled();
});

test('never requests a different owner or forged Storage key', async () => {
  mockAuthStatus = 'signedIn';
  await expect(openPresentDocument(document({ userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }))).rejects.toThrow(/owner/i);
  await expect(openPresentDocument(document({ filePath: `${USER_ID}/../other.pdf` }))).rejects.toThrow(/path/i);
  expect(mockSignedUrl).not.toHaveBeenCalled();
});

test('missing cache cannot reach Storage while offline', async () => {
  mockGet.mockResolvedValue(null);
  await expect(openPresentDocument(document())).rejects.toThrow(/offline/i);
  expect(mockSignedUrl).not.toHaveBeenCalled();
});

test('uncached document downloads from private Storage and saves locally when online', async () => {
  mockAuthStatus = 'signedIn';
  mockGet.mockResolvedValue(null);
  mockSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/object' }, error: null });
  mockDownloadFile.mockResolvedValue({ uri: 'file:///cache/staged.pdf', size: 100, exists: true, delete: jest.fn() });
  await expect(openPresentDocument(document())).resolves.toBe('file:///documents/rc.pdf');
  expect(mockSignedUrl).toHaveBeenCalledWith(`${USER_ID}/${RC_ID}.pdf`, 60);
  expect(mockSave).toHaveBeenCalledWith(RC_ID, 'file:///cache/staged.pdf');
});

test('Present screen renders offline slots and one tap opens the viewer', async () => {
  const screen = await render(<PresentScreen />);
  await waitFor(() => expect(screen.getByText('DOCUMENTS TO PRESENT')).toBeTruthy());
  expect(screen.getByText('My BMW')).toBeTruthy();
  expect(screen.getByText('Driving Licence')).toBeTruthy();
  expect(screen.getAllByText('Missing')).toHaveLength(3);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: /Registration \/ RC/i })); });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/document/${RC_ID}`));
  expect(mockSignedUrl).not.toHaveBeenCalled();
});

test('does not claim ready when metadata says cached but a required file is missing', async () => {
  const documents = [
    document(),
    document({ id: '55555555-5555-4555-8555-555555555555', type: 'driving_license', scope: 'driver', vehicleId: null }),
    document({ id: '66666666-6666-4666-8666-666666666666', type: 'insurance' }),
    document({ id: '77777777-7777-4777-8777-777777777777', type: 'puc' }),
  ];
  mockReadOfflineIndex.mockResolvedValue({
    vehicles: [{ id: VEHICLE_ID, userId: USER_ID, nickname: 'My BMW' }], documents,
  });
  mockExists.mockImplementation(async (id: string) => id !== documents[0].id);
  const screen = await render(<PresentScreen />);
  await waitFor(() => expect(screen.getByText('DOCUMENTS TO PRESENT')).toBeTruthy());
  expect(screen.queryByText('READY TO PRESENT')).toBeNull();
  expect(screen.getByText('Download needed')).toBeTruthy();
});

test('home has a direct Present action for the cached vehicle', async () => {
  const screen = await render(<HomeScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Present My BMW' })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Present My BMW' }));
  expect(mockPush).toHaveBeenCalledWith(`/present/${VEHICLE_ID}`);
  expect(mockSignedUrl).not.toHaveBeenCalled();
});

test('vehicle detail opens Present in one tap', async () => {
  mockAuthStatus = 'signedIn';
  const screen = await render(<VehicleDetailScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Present documents' })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Present documents' }));
  expect(mockPush).toHaveBeenCalledWith(`/present/${VEHICLE_ID}`);
});

test('vehicle detail opens cached Present while offline without querying the cloud', async () => {
  const screen = await render(<VehicleDetailScreen />);
  const present = await screen.findByRole('button', { name: 'Present documents' });
  expect(screen.getByText('Offline · read only')).toBeTruthy();
  fireEvent.press(present);
  expect(mockPush).toHaveBeenCalledWith(`/present/${VEHICLE_ID}`);
  expect(mockGetVehicle).not.toHaveBeenCalled();
  expect(mockListDocuments).not.toHaveBeenCalled();
});
