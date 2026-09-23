import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const mockPush = jest.fn();
const mockAuth = jest.fn();
const mockGetVehicle = jest.fn();
const mockListDocuments = jest.fn();
const mockReadOfflineIndex = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
    useLocalSearchParams: () => ({ id: VEHICLE_ID }),
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
  };
});
jest.mock('../lib/auth', () => ({ useAuthState: () => mockAuth() }));
jest.mock('../lib/vehicles', () => ({
  getVehicle: (...args: unknown[]) => mockGetVehicle(...args),
  updateVehicle: jest.fn(), deleteVehicle: jest.fn(),
}));
jest.mock('../lib/documents', () => ({ listDocuments: (...args: unknown[]) => mockListDocuments(...args) }));
jest.mock('../lib/document-delete', () => ({ deleteDocument: jest.fn() }));
jest.mock('../lib/offline-index', () => ({ readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args) }));

import VehicleDetailScreen from '../app/vehicle/[id]';

const vehicle = {
  id: VEHICLE_ID, userId: USER_ID, nickname: 'My BMW', registrationNumber: 'GJ05AB1234',
  manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockReturnValue({ status: 'signedIn', userId: USER_ID });
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [vehicle], documents: [] });
  mockListDocuments.mockResolvedValue([]);
  mockGetVehicle.mockResolvedValue(vehicle);
});

test('cached vehicle can open Present while signed-in cloud refresh is pending', async () => {
  mockGetVehicle.mockReturnValue(new Promise(() => {}));

  const screen = await render(<VehicleDetailScreen />);
  await waitFor(() => expect(screen.getByText('My BMW')).toBeTruthy());
  expect(mockGetVehicle).toHaveBeenCalledWith(VEHICLE_ID);
  expect(screen.queryByLabelText('Loading vehicle')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Present documents' }));
  expect(mockPush).toHaveBeenCalledWith(`/present/${VEHICLE_ID}`);
  expect(screen.getByRole('button', { name: 'Save changes' }).props.accessibilityState).toMatchObject({ disabled: true });
});

test('offline identity opens cached vehicle with no cloud requests', async () => {
  mockAuth.mockReturnValue({ status: 'offline', userId: USER_ID });
  const screen = await render(<VehicleDetailScreen />);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Present documents' })).toBeTruthy());
  expect(mockGetVehicle).not.toHaveBeenCalled();
  expect(mockListDocuments).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Save changes' }).props.accessibilityState).toMatchObject({ disabled: true });
});

test('failed cloud refresh retains cached vehicle in read-only mode', async () => {
  mockGetVehicle.mockRejectedValue(new Error('Network unavailable'));
  const screen = await render(<VehicleDetailScreen />);

  await waitFor(() => expect(screen.getByText('My BMW')).toBeTruthy());
  await waitFor(() => expect(screen.getByText('Offline · read only')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Present documents' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save changes' }).props.accessibilityState).toMatchObject({ disabled: true });
});
