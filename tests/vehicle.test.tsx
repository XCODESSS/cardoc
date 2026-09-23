import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCreateVehicle = jest.fn();
const mockListVehicles = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockAuthStatus = jest.fn();
const mockAuthUserId = jest.fn();
const mockClient = {
  from: jest.fn(),
};

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Stack.Protected = ({ guard, children }: { guard: boolean; children: React.ReactNode }) => guard ? <>{children}</> : null;
  Stack.Screen = ({ name }: { name: string }) => <Text>{name}</Text>;
  return {
    Stack,
    router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
    useLocalSearchParams: () => ({ id: 'vehicle-a' }),
    Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});
jest.mock('../lib/vehicles', () => ({
  createVehicle: (...args: unknown[]) => mockCreateVehicle(...args),
  listVehicles: (...args: unknown[]) => mockListVehicles(...args),
}));
jest.mock('../lib/offline-index', () => ({
  readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args),
}));
jest.mock('../lib/auth', () => ({
  getAuthState: () => ({ status: mockAuthStatus(), userId: ['signedIn', 'offline'].includes(mockAuthStatus()) ? mockAuthUserId() : null }),
  useAuthState: () => ({ status: mockAuthStatus(), userId: ['signedIn', 'offline'].includes(mockAuthStatus()) ? mockAuthUserId() : null }),
  restoreAuth: jest.fn(),
}));
jest.mock('../lib/supabase', () => ({ getSupabaseClient: () => mockClient }));
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0 },
  getEnrolledLevelAsync: jest.fn().mockResolvedValue(3),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

import NewVehicleScreen from '../app/vehicle/new';
import VehiclesScreen from '../app/(tabs)/vehicles';
import RootLayout from '../app/_layout';
import { vehicleInputSchema } from '../validation/vehicle';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthStatus.mockReturnValue('signedIn');
  mockAuthUserId.mockReturnValue('user-a');
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [] });
  mockListVehicles.mockResolvedValue([]);
});

test('validates and trims vehicle input', () => {
  expect(vehicleInputSchema.safeParse({ nickname: ' ', registrationNumber: 'GJ05AB1234' }).success).toBe(false);
  expect(vehicleInputSchema.safeParse({ nickname: 'My car', registrationNumber: 'A12' }).success).toBe(false);
  expect(vehicleInputSchema.parse({ nickname: ' My BMW ', registrationNumber: ' GJ05AB1234 ', year: 2022 })).toMatchObject({ nickname: 'My BMW', registrationNumber: 'GJ05AB1234', year: 2022 });
  expect(vehicleInputSchema.safeParse({ nickname: 'My car', registrationNumber: 'ABCD', year: 2022.5 }).success).toBe(false);
});

test('saving a vehicle shows it in the vehicle list immediately', async () => {
  const saved = { id: 'vehicle-a', userId: 'user-a', nickname: 'My BMW', registrationNumber: 'GJ05AB1234', manufacturer: null, model: null, year: null, createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z' };
  mockCreateVehicle.mockImplementation(async () => {
    mockListVehicles.mockResolvedValue([saved]);
    return saved;
  });
  const form = await render(<NewVehicleScreen />);
  await fireEvent.changeText(form.getByPlaceholderText('My BMW'), 'My BMW');
  await fireEvent.changeText(form.getByPlaceholderText('GJ05AB1234'), 'GJ05AB1234');
  await fireEvent.press(form.getByRole('button', { name: 'Save vehicle' }));
  expect(form.queryByRole('alert')).toBeNull();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/vehicles'));
  const list = await render(<VehiclesScreen />);
  await waitFor(() => expect(list.getByText('My BMW')).toBeTruthy());
  expect(list.getByText('GJ05AB1234')).toBeTruthy();
});

test('offline fallback is visibly read-only for a signed-in account', async () => {
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [{ id: 'cached', userId: 'user-a', nickname: 'Cached car', registrationNumber: 'ABCD1234', manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '' }], documents: [] });
  mockListVehicles.mockRejectedValue(new Error('Network unavailable'));
  const list = await render(<VehiclesScreen />);
  await waitFor(() => expect(list.getByText('Cached car')).toBeTruthy());
  expect(list.getByText('Offline · read only')).toBeTruthy();
});

test('restored offline account sees its cached vehicles without a cloud request', async () => {
  mockAuthStatus.mockReturnValue('offline');
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [{ id: 'cached', userId: 'user-a', nickname: 'My BMW', registrationNumber: 'GJ05AB1234', manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '' }], documents: [] });

  const list = await render(<VehiclesScreen />);
  await waitFor(() => expect(list.getByText('My BMW')).toBeTruthy());
  expect(mockReadOfflineIndex).toHaveBeenCalledWith('user-a');
  expect(mockListVehicles).not.toHaveBeenCalled();
  expect(list.getByRole('button', { name: 'Add vehicle' }).props.accessibilityState?.disabled).toBe(true);
  fireEvent.press(list.getByRole('button', { name: 'Open My BMW' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/vehicle/[id]', params: { id: 'cached' } });
});

test('signed-in account shows cache while cloud refresh is pending', async () => {
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [{ id: 'cached', userId: 'user-a', nickname: 'Cached car', registrationNumber: 'ABCD1234', manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '' }], documents: [] });
  let releaseRefresh: ((vehicles: unknown[]) => void) | undefined;
  mockListVehicles.mockReturnValue(new Promise((resolve) => { releaseRefresh = resolve; }));

  const list = await render(<VehiclesScreen />);
  await waitFor(() => expect(list.getByText('Cached car')).toBeTruthy());
  expect(mockListVehicles).toHaveBeenCalledWith('user-a');
  releaseRefresh?.([]);
  await waitFor(() => expect(list.queryByText('Cached car')).toBeNull());
});

test('switching accounts never shows the previous account vehicle', async () => {
  mockAuthStatus.mockReturnValue('offline');
  mockReadOfflineIndex.mockResolvedValueOnce({ vehicles: [{ id: 'a-car', userId: 'user-a', nickname: 'A car', registrationNumber: 'ABCD1234', manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '' }], documents: [] });
  let releaseNewCache: ((value: unknown) => void) | undefined;
  mockReadOfflineIndex.mockReturnValueOnce(new Promise((resolve) => { releaseNewCache = resolve; }));

  const list = await render(<VehiclesScreen />);
  await waitFor(() => expect(list.getByText('A car')).toBeTruthy());
  mockAuthUserId.mockReturnValue('user-b');
  await list.rerender(<VehiclesScreen />);
  expect(list.queryByText('A car')).toBeNull();
  expect(mockReadOfflineIndex).toHaveBeenLastCalledWith('user-b');
  releaseNewCache?.({ vehicles: [{ id: 'b-car', userId: 'user-b', nickname: 'B car', registrationNumber: 'WXYZ1234', manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '' }], documents: [] });
  await waitFor(() => expect(list.getByText('B car')).toBeTruthy());
});

test('vehicle routes are inaccessible from the signed-out root', async () => {
  mockAuthStatus.mockReturnValue('signedOut');
  const screen = await render(<RootLayout />);
  expect(screen.queryByText('vehicle')).toBeNull();
  expect(screen.queryByText('present')).toBeNull();
});

test('the signed-in root opens vehicle routes after device unlock', async () => {
  const screen = await render(<RootLayout />);
  expect(screen.queryByText('vehicle')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Unlock Cardoc'));
  await waitFor(() => expect(screen.getByText('vehicle')).toBeTruthy());
  expect(screen.getByText('present')).toBeTruthy();
});
