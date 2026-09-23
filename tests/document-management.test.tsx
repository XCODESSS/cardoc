import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const mockPush = jest.fn();
const mockAuth = jest.fn();
const mockGetVehicle = jest.fn();
const mockListDocuments = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockDeleteDocument = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
    useLocalSearchParams: () => ({ id: VEHICLE_ID }),
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../components/VehicleForm', () => ({
  VehicleForm: ({ footer }: { footer: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{footer}</View>;
  },
}));
jest.mock('../lib/auth', () => ({ useAuthState: () => mockAuth() }));
jest.mock('../lib/vehicles', () => ({
  getVehicle: (...args: unknown[]) => mockGetVehicle(...args),
  updateVehicle: jest.fn(), deleteVehicle: jest.fn(),
}));
jest.mock('../lib/documents', () => ({ listDocuments: (...args: unknown[]) => mockListDocuments(...args) }));
jest.mock('../lib/document-delete', () => ({ deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args) }));
jest.mock('../lib/offline-index', () => ({ readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args) }));

import VehicleDetailScreen from '../app/vehicle/[id]';

const vehicle = {
  id: VEHICLE_ID, userId: USER_ID, nickname: 'My BMW', registrationNumber: 'GJ05AB1234',
  manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '',
};
const document = {
  id: DOCUMENT_ID, userId: USER_ID, vehicleId: VEHICLE_ID, scope: 'vehicle', type: 'registration',
  displayName: 'RC', filePath: `${USER_ID}/${DOCUMENT_ID}.pdf`, mimeType: 'application/pdf',
  sizeBytes: 100, expiryDate: null, offlineAvailable: true, createdAt: '', updatedAt: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockReturnValue({ status: 'signedIn', userId: USER_ID });
  mockGetVehicle.mockResolvedValue(vehicle);
  mockListDocuments.mockResolvedValue([document]);
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [vehicle], documents: [document] });
  mockDeleteDocument.mockResolvedValue(undefined);
});

test('a document in the vehicle list opens the ordinary viewer', async () => {
  const screen = await render(<VehicleDetailScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'View RC' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'View RC' }));
  expect(mockPush).toHaveBeenCalledWith(`/document/${DOCUMENT_ID}`);
});

test('deleting a document requires confirmation and removes it from the list after success', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    const screen = await render(<VehicleDetailScreen />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete RC' })).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Delete RC' }));
    expect(mockDeleteDocument).not.toHaveBeenCalled();
    const choices = alert.mock.calls[0][2] ?? [];
    expect(choices[0].text).toBe('Cancel');
    await act(async () => { choices[1].onPress?.(); });
    await waitFor(() => expect(mockDeleteDocument).toHaveBeenCalledWith(DOCUMENT_ID));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'View RC' })).toBeNull());
  } finally {
    alert.mockRestore();
  }
});

test('offline documents can be viewed but cloud deletion is disabled', async () => {
  mockAuth.mockReturnValue({ status: 'offline', userId: USER_ID });
  const screen = await render(<VehicleDetailScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'View RC' })).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'View RC' }));
  expect(mockPush).toHaveBeenCalledWith(`/document/${DOCUMENT_ID}`);
  expect(screen.getByRole('button', { name: 'Delete RC' }).props.accessibilityState).toMatchObject({ disabled: true });
  expect(mockDeleteDocument).not.toHaveBeenCalled();
});
