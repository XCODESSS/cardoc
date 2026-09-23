import * as SecureStore from 'expo-secure-store';

const OFFLINE_USER_ID_KEY = 'cardoc.offlineUserId';
const PENDING_LOGOUT_USER_ID_KEY = 'cardoc.pendingLogoutUserId';

export class SecureStorageError extends Error {
  constructor() {
    super('Secure storage is unavailable. Sign-in was blocked.');
    this.name = 'SecureStorageError';
  }
}

async function secure<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch {
    throw new SecureStorageError();
  }
}

// Supabase's storage contract accepts async methods with these signatures.
export const sessionStorage = {
  getItem: (key: string) => secure(SecureStore.getItemAsync(key)),
  setItem: (key: string, value: string) => secure(SecureStore.setItemAsync(key, value)),
  removeItem: (key: string) => secure(SecureStore.deleteItemAsync(key)),
};

export const getOfflineUserId = () => secure(SecureStore.getItemAsync(OFFLINE_USER_ID_KEY));

export const saveOfflineUserId = (userId: string) =>
  secure(SecureStore.setItemAsync(OFFLINE_USER_ID_KEY, userId));

export const clearOfflineUserId = () => secure(SecureStore.deleteItemAsync(OFFLINE_USER_ID_KEY));

export const getPendingLogoutUserId = () => secure(SecureStore.getItemAsync(PENDING_LOGOUT_USER_ID_KEY));
export const savePendingLogoutUserId = (userId: string) =>
  secure(SecureStore.setItemAsync(PENDING_LOGOUT_USER_ID_KEY, userId));
export const clearPendingLogoutUserId = () => secure(SecureStore.deleteItemAsync(PENDING_LOGOUT_USER_ID_KEY));
