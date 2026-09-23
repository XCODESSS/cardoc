import * as LocalAuthentication from 'expo-local-authentication';

import type { AuthState } from './auth';

export type DeviceUnlockResult = 'unlocked' | 'denied' | 'unavailable';

export function canOpenProtectedRoutes(
  status: AuthState['status'], userId: string | null, unlockedFor: string | null,
): boolean {
  return (status === 'signedIn' || status === 'offline') && Boolean(userId) && userId === unlockedFor;
}

export async function authenticateDevice(): Promise<DeviceUnlockResult> {
  try {
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) return 'unavailable';

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Cardoc',
      fallbackLabel: 'Use device passcode',
      disableDeviceFallback: false,
    });
    if (result.success) return 'unlocked';
    return result.error === 'not_available' || result.error === 'not_enrolled' || result.error === 'passcode_not_set'
      ? 'unavailable'
      : 'denied';
  } catch {
    return 'unavailable';
  }
}
