import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockStored = new Map<string, string>();
const mockClient = {
  auth: {
    getSession: jest.fn(),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  },
};
const mockConfigured = jest.fn(() => true);

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStored.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStored.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockStored.delete(key); }),
}));
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => mockClient,
  isSupabaseConfigured: () => mockConfigured(),
}));
jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Stack.Protected = ({ guard, children }: { guard: boolean; children: React.ReactNode }) => guard ? <>{children}</> : null;
  Stack.Screen = ({ name }: { name: string }) => <Text>{name}</Text>;
  return {
    Stack,
    Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

import * as SecureStore from 'expo-secure-store';
import RootLayout from '../app/_layout';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import SettingsScreen from '../app/(tabs)/settings';
import { getAuthState, getOfflineUserId, login, logout, restoreAuth } from '../lib/auth';
import { sessionStorage } from '../lib/session-storage';

beforeEach(() => {
  mockStored.clear();
  jest.clearAllMocks();
  mockConfigured.mockReturnValue(true);
  mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockClient.auth.signOut.mockResolvedValue({ error: null });
});

test('invalid credentials show an error and do not enter the app', async () => {
  mockClient.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } });
  const screen = await render(<LoginScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'driver@example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'incorrect-password');
  await fireEvent.press(screen.getByText('Sign in'));
  await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeTruthy());
  expect(await getOfflineUserId()).toBeNull();
});

test('successful login reaches the protected app route', async () => {
  mockClient.auth.signInWithPassword.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } }, error: null,
  });
  const screen = await render(<RootLayout />);
  await waitFor(() => expect(screen.getByText('(auth)')).toBeTruthy());
  await act(async () => { await login('driver@example.com', 'correct-password'); });
  await waitFor(() => expect(screen.getByText('(tabs)')).toBeTruthy());
  expect(await getOfflineUserId()).toBe('driver-a');
});

test('a remount restores the persisted session', async () => {
  mockClient.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } }, error: null,
  });
  const first = await render(<RootLayout />);
  await waitFor(() => expect(first.getByText('(tabs)')).toBeTruthy());
  await first.unmount();
  const second = await render(<RootLayout />);
  await waitFor(() => expect(second.getByText('(tabs)')).toBeTruthy());
  expect(mockClient.auth.getSession).toHaveBeenCalledTimes(2);
});

test('logout removes the cloud session and saved offline identity', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'driver-a' } } }, error: null });
  const screen = await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Sign out'));
  await waitFor(() => expect(mockClient.auth.signOut).toHaveBeenCalled());
  await waitFor(async () => expect(await getOfflineUserId()).toBeNull());
});

test('secure storage failure blocks login instead of pretending persistence succeeded', async () => {
  mockClient.auth.signInWithPassword.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } }, error: null,
  });
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Keystore unavailable'));
  await expect(login('driver@example.com', 'correct-password')).rejects.toThrow('Secure storage is unavailable');
  expect(mockClient.auth.signOut).toHaveBeenCalled();
});

test('a failed Supabase session write blocks sign-in and clears the local session', async () => {
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Keystore unavailable'));
  mockClient.auth.signInWithPassword.mockImplementationOnce(async () => {
    await sessionStorage.setItem('sb-project-auth-token', 'session');
    return { data: { session: { user: { id: 'driver-a' } } }, error: null };
  });
  await expect(login('driver@example.com', 'correct-password')).rejects.toThrow('Secure storage is unavailable');
  expect(mockClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(await getOfflineUserId()).toBeNull();
});

test('offline identity is only used after a network restoration failure', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Network request failed' } });
  expect(await restoreAuth()).toMatchObject({ status: 'offline', userId: 'driver-a' });
  mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await restoreAuth()).toMatchObject({ status: 'signedOut', userId: null });
  expect(await getOfflineUserId()).toBeNull();
});

test('offline identity alone never opens a protected route before the local gate exists', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Network request failed' } });
  const screen = await render(<RootLayout />);
  await waitFor(() => expect(screen.getByText('Offline documents are locked until device authentication is available.')).toBeTruthy());
  expect(screen.queryByText('(tabs)')).toBeNull();
});

test('registration asks for email confirmation when Supabase issues no session', async () => {
  mockClient.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  const screen = await render(<RegisterScreen />);
  await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'driver@example.com');
  await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'correct-password');
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(screen.getByText('Check your email to confirm your account, then sign in.')).toBeTruthy());
  expect(await getOfflineUserId()).toBeNull();
});

test('a thrown network error during logout clears the local session before restart', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.signOut
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce({ error: null });
  await logout();
  expect(mockClient.auth.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
  expect(await getOfflineUserId()).toBeNull();
  expect(await restoreAuth()).toMatchObject({ status: 'signedOut', userId: null });
});

test('a failed offline identity deletion blocks protected routes', async () => {
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('Keystore unavailable'));
  await expect(logout()).rejects.toThrow('Secure storage is unavailable');
  expect(getAuthState()).toMatchObject({ status: 'storageError', userId: null });
});
