import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

const mockReadOfflineIndex = jest.fn();
const mockAuthState = jest.fn();
let mockFocused = true;

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    router: { push: jest.fn() },
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => mockFocused ? callback() : undefined, [callback, mockFocused]);
    },
  };
});
jest.mock('../lib/auth', () => ({ useAuthState: () => mockAuthState() }));
jest.mock('../lib/offline-index', () => ({ readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args) }));

import HomeScreen from '../app/(tabs)/index';

const vehicle = {
  id: 'vehicle-a', userId: 'user-a', nickname: 'My BMW', registrationNumber: 'GJ05AB1234',
  manufacturer: null, model: null, year: null, createdAt: '', updatedAt: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockAuthState.mockReturnValue({ status: 'signedIn', userId: 'user-a' });
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [] });
});

async function refocus(screen: Awaited<ReturnType<typeof render>>) {
  mockFocused = false;
  await act(async () => { screen.rerender(<HomeScreen />); });
  mockFocused = true;
  await act(async () => { screen.rerender(<HomeScreen />); });
}

test('opens on the Cardoc screen', async () => {
  const screen = await render(<HomeScreen />);
  expect(screen.getByText('Cardoc')).toBeTruthy();
});

test('refreshes Present shortcuts after vehicle add and delete while Home remains mounted', async () => {
  const screen = await render(<HomeScreen />);
  expect(screen.queryByRole('button', { name: 'Present My BMW' })).toBeNull();
  expect(mockReadOfflineIndex).toHaveBeenCalledWith('user-a');

  mockReadOfflineIndex.mockResolvedValue({ vehicles: [vehicle], documents: [] });
  await refocus(screen);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Present My BMW' })).toBeTruthy());

  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [] });
  await refocus(screen);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Present My BMW' })).toBeNull());
  expect(mockReadOfflineIndex).toHaveBeenCalledTimes(3);
});

test('does not show the previous account shortcuts during an account switch', async () => {
  mockReadOfflineIndex.mockResolvedValueOnce({ vehicles: [vehicle], documents: [] });
  let resolveNext: ((value: unknown) => void) | undefined;
  mockReadOfflineIndex.mockReturnValueOnce(new Promise((resolve) => { resolveNext = resolve; }));
  const screen = await render(<HomeScreen />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Present My BMW' })).toBeTruthy());

  mockAuthState.mockReturnValue({ status: 'offline', userId: 'user-b' });
  await act(async () => { screen.rerender(<HomeScreen />); });
  expect(screen.queryByRole('button', { name: 'Present My BMW' })).toBeNull();
  expect(mockReadOfflineIndex).toHaveBeenLastCalledWith('user-b');
  await act(async () => { resolveNext?.({ vehicles: [], documents: [] }); });
});
