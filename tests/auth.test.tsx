import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

const mockStored = new Map<string, string>();
let mockAuthEvent: ((event: string) => void) | null = null;
const mockClient = {
  auth: {
    getSession: jest.fn(),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChange: jest.fn((callback: (event: string) => void) => {
      mockAuthEvent = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
  },
};
const mockConfigured = jest.fn(() => true);
const mockAuthenticate = jest.fn();
const mockClearAccountLocalState = jest.fn();

jest.mock('../lib/local-data', () => ({
  clearAccountLocalState: (...args: unknown[]) => mockClearAccountLocalState(...args),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStored.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStored.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockStored.delete(key); }),
}));
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => mockClient,
  isSupabaseConfigured: () => mockConfigured(),
}));
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn().mockResolvedValue(3),
  authenticateAsync: (...args: unknown[]) => mockAuthenticate(...args),
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
  mockAuthEvent = null;
  jest.clearAllMocks();
  mockConfigured.mockReturnValue(true);
  mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockClient.auth.signOut.mockResolvedValue({ error: null });
  mockAuthenticate.mockResolvedValue({ success: true });
  mockClearAccountLocalState.mockResolvedValue(undefined);
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

test('a restored session requires device unlock after each app start', async () => {
  mockClient.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } }, error: null,
  });
  const first = await render(<RootLayout />);
  await waitFor(() => expect(first.getByText('Cardoc is locked')).toBeTruthy());
  expect(first.queryByText('(tabs)')).toBeNull();
  await fireEvent.press(first.getByLabelText('Unlock Cardoc'));
  await waitFor(() => expect(first.getByText('(tabs)')).toBeTruthy());
  await first.unmount();
  const second = await render(<RootLayout />);
  await waitFor(() => expect(second.getByText('Cardoc is locked')).toBeTruthy());
  expect(second.queryByText('(tabs)')).toBeNull();
  await fireEvent.press(second.getByLabelText('Unlock Cardoc'));
  await waitFor(() => expect(second.getByText('(tabs)')).toBeTruthy());
  expect(mockClient.auth.getSession).toHaveBeenCalledTimes(2);
  expect(mockAuthenticate).toHaveBeenCalledTimes(2);
});

test('returning from background requires a new device unlock', async () => {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') listeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() };
  });
  mockClient.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } }, error: null,
  });
  try {
    const screen = await render(<RootLayout />);
    await waitFor(() => expect(screen.getByText('Cardoc is locked')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Unlock Cardoc'));
    await waitFor(() => expect(screen.getByText('(tabs)')).toBeTruthy());
    await act(async () => { listeners.forEach((listener) => listener('background')); });
    expect(screen.getByText('Cardoc is locked')).toBeTruthy();
    expect(screen.queryByText('(tabs)')).toBeNull();
    await screen.unmount();
  } finally {
    appStateSpy.mockRestore();
  }
});

test('a sign-in completed in the background cannot open protected routes', async () => {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') listeners.push(listener as (state: AppStateStatus) => void);
    return { remove: jest.fn() };
  });
  mockClient.auth.signInWithPassword.mockResolvedValue({
    data: { session: { user: { id: 'driver-a' } } }, error: null,
  });
  try {
    const screen = await render(<RootLayout />);
    await waitFor(() => expect(getAuthState()).toMatchObject({ status: 'signedOut' }));
    await act(async () => { listeners.forEach((listener) => listener('background')); });
    await act(async () => { await login('driver@example.com', 'correct-password'); });
    expect(screen.getByText('Cardoc is locked')).toBeTruthy();
    expect(screen.queryByText('document')).toBeNull();
    screen.unmount();
  } finally {
    appStateSpy.mockRestore();
  }
});

test('logout removes the cloud session and saved offline identity', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'driver-a' } } }, error: null });
  const screen = await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Sign out'));
  await waitFor(() => expect(mockClient.auth.signOut).toHaveBeenCalled());
  expect(mockClearAccountLocalState).toHaveBeenCalledWith('driver-a');
  await waitFor(async () => expect(await getOfflineUserId()).toBeNull());
});

test('logout clears account data before ending the cloud session', async () => {
  const events: string[] = [];
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClearAccountLocalState.mockImplementationOnce(async () => { events.push('local'); });
  mockClient.auth.signOut.mockImplementationOnce(async () => { events.push('session'); return { error: null }; });
  await logout();
  expect(events).toEqual(['local', 'session']);
  expect(await getOfflineUserId()).toBeNull();
});

test('failed account cleanup locks the app and retains identity for a retry', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClearAccountLocalState.mockRejectedValueOnce(new Error('disk error'));
  await expect(logout()).rejects.toThrow('disk error');
  expect(getAuthState()).toMatchObject({ status: 'storageError', userId: null });
  expect(await getOfflineUserId()).toBe('driver-a');
  expect(mockStored.get('cardoc.pendingLogoutUserId')).toBe('driver-a');
  expect(mockClient.auth.signOut).not.toHaveBeenCalled();
  mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'driver-a' } } }, error: null });
  expect(await restoreAuth()).toMatchObject({ status: 'storageError', userId: null });
  expect(mockClient.auth.getSession).not.toHaveBeenCalled();
  await logout();
  expect(mockClearAccountLocalState).toHaveBeenLastCalledWith('driver-a');
  expect(await getOfflineUserId()).toBeNull();
  expect(mockStored.has('cardoc.pendingLogoutUserId')).toBe(false);
});

test('a failed pending-logout marker write keeps routes locked before cleanup', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('Keystore unavailable'));
  await expect(logout()).rejects.toThrow('Secure storage is unavailable');
  expect(getAuthState()).toMatchObject({ status: 'storageError', userId: null });
  expect(mockClearAccountLocalState).not.toHaveBeenCalled();
  expect(mockClient.auth.signOut).not.toHaveBeenCalled();
});

test('the locked storage-error screen can retry cleanup without exposing documents', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'driver-a' } } }, error: null });
  mockClearAccountLocalState.mockRejectedValueOnce(new Error('disk error'));
  const screen = await render(<RootLayout />);
  await waitFor(() => expect(getAuthState()).toMatchObject({ status: 'signedIn', userId: 'driver-a' }));
  await act(async () => { await expect(logout()).rejects.toThrow('disk error'); });
  await waitFor(() => expect(screen.getByText(/Cardoc cannot safely use the saved session/)).toBeTruthy());
  expect(screen.queryByText('document')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry sign out' }));
  await waitFor(() => expect(getAuthState()).toMatchObject({ status: 'signedOut', userId: null }));
  expect(screen.queryByText('document')).toBeNull();
  expect(await getOfflineUserId()).toBeNull();
});

test('a Supabase sign-out event also clears account data before releasing identity', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'driver-a' } } }, error: null });
  const screen = await render(<RootLayout />);
  await waitFor(() => expect(getAuthState()).toMatchObject({ status: 'signedIn', userId: 'driver-a' }));
  expect(mockAuthEvent).toBeTruthy();
  await act(async () => { mockAuthEvent?.('SIGNED_OUT'); });
  await waitFor(() => expect(getAuthState()).toMatchObject({ status: 'signedOut', userId: null }));
  expect(mockClearAccountLocalState).toHaveBeenCalledWith('driver-a');
  expect(await getOfflineUserId()).toBeNull();
  screen.unmount();
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

test('offline identity opens protected routes only after local authentication', async () => {
  mockStored.set('cardoc.offlineUserId', 'driver-a');
  mockClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Network request failed' } });
  const screen = await render(<RootLayout />);
  await waitFor(() => expect(screen.getByText('Cardoc is locked')).toBeTruthy());
  expect(screen.queryByText('(tabs)')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Unlock Cardoc'));
  await waitFor(() => expect(screen.getByText('(tabs)')).toBeTruthy());
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
