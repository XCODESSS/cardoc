const mockLevel = jest.fn();
const mockAuthenticate = jest.fn();

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: (...args: unknown[]) => mockLevel(...args),
  authenticateAsync: (...args: unknown[]) => mockAuthenticate(...args),
}));

import { authenticateDevice, canOpenProtectedRoutes } from '../lib/app-lock';

beforeEach(() => {
  jest.clearAllMocks();
  mockLevel.mockResolvedValue(3);
  mockAuthenticate.mockResolvedValue({ success: true });
});

test('a restored session stays locked until device authentication succeeds', async () => {
  expect(canOpenProtectedRoutes('signedIn', 'driver-a', null)).toBe(false);
  expect(await authenticateDevice()).toBe('unlocked');
  expect(canOpenProtectedRoutes('signedIn', 'driver-a', 'driver-a')).toBe(true);
  expect(mockAuthenticate).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false }));
});

test('offline and online routes reject a different account unlock', () => {
  expect(canOpenProtectedRoutes('offline', 'driver-b', 'driver-a')).toBe(false);
  expect(canOpenProtectedRoutes('offline', 'driver-a', 'driver-a')).toBe(true);
  expect(canOpenProtectedRoutes('signedOut', null, 'driver-a')).toBe(false);
});

test('no enrolled device authentication fails closed', async () => {
  mockLevel.mockResolvedValue(0);
  expect(await authenticateDevice()).toBe('unavailable');
  expect(mockAuthenticate).not.toHaveBeenCalled();
});

test('cancellation and native errors leave documents locked', async () => {
  mockAuthenticate.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
  expect(await authenticateDevice()).toBe('denied');
  mockAuthenticate.mockRejectedValueOnce(new Error('Native authentication failed'));
  expect(await authenticateDevice()).toBe('unavailable');
});
