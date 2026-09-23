import { useSyncExternalStore } from 'react';

import {
  clearOfflineUserId, clearPendingLogoutUserId, getOfflineUserId as readOfflineUserId,
  getPendingLogoutUserId, saveOfflineUserId, savePendingLogoutUserId, SecureStorageError,
} from './session-storage';
import { clearAccountLocalState } from './local-data';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';

export type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn' | 'offline' | 'configurationUnavailable' | 'storageError';
  userId: string | null;
};

const listeners = new Set<() => void>();
let state: AuthState = { status: 'loading', userId: null };
let authEventSubscription: { unsubscribe(): void } | null = null;
let logoutInProgress = false;

async function accountIdForCleanup(previousUserId: string | null): Promise<string | null> {
  try {
    const pendingUserId = await getPendingLogoutUserId();
    if (pendingUserId) return pendingUserId;
    return await readOfflineUserId() ?? previousUserId;
  } catch (cause) {
    if (previousUserId) return previousUserId;
    throw cause;
  }
}

async function handleExternalSignOut() {
  logoutInProgress = true;
  const previousUserId = state.userId;
  publish({ status: 'loading', userId: null });
  try {
    const userId = await accountIdForCleanup(previousUserId);
    if (userId) {
      await savePendingLogoutUserId(userId);
      await clearAccountLocalState(userId);
    }
    await clearOfflineUserId();
    await clearPendingLogoutUserId();
    publish({ status: 'signedOut', userId: null });
  } catch {
    publish({ status: 'storageError', userId: null });
  } finally {
    logoutInProgress = false;
  }
}

function publish(next: AuthState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const getAuthState = () => state;

export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  if (!authEventSubscription) {
    const client = getSupabaseClient();
    authEventSubscription = client?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !logoutInProgress) {
        void handleExternalSignOut();
      }
    }).data.subscription ?? null;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      authEventSubscription?.unsubscribe();
      authEventSubscription = null;
    }
  };
}

export function useAuthState() {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}

export const getOfflineUserId = readOfflineUserId;

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Cardoc needs a Supabase URL and publishable key.');
  return client;
}

function validateCredentials(email: string, password: string) {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email address.');
  if (password.length < 6) throw new Error('Password must have at least 6 characters.');
}

async function activateSession(userId: string) {
  try {
    await saveOfflineUserId(userId);
  } catch {
    try { await requireClient().auth.signOut({ scope: 'local' }); } catch { /* Keep original storage error. */ }
    publish({ status: 'storageError', userId: null });
    throw new Error('Secure storage is unavailable. Sign-in was blocked.');
  }
  publish({ status: 'signedIn', userId });
}

async function blockOnSecureStorageFailure(cause: unknown) {
  if (!(cause instanceof SecureStorageError)) return;
  try { await requireClient().auth.signOut({ scope: 'local' }); } catch { /* Keep storage error visible. */ }
  publish({ status: 'storageError', userId: null });
}

export async function login(email: string, password: string) {
  validateCredentials(email, password);
  let result;
  try {
    result = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
  } catch (cause) {
    await blockOnSecureStorageFailure(cause);
    throw cause;
  }
  const { data, error } = result;
  if (error) throw new Error(error.message);
  if (!data.session?.user.id) throw new Error('Sign-in did not return a session.');
  await activateSession(data.session.user.id);
}

export async function register(email: string, password: string): Promise<'signedIn' | 'confirmationRequired'> {
  validateCredentials(email, password);
  let result;
  try {
    result = await requireClient().auth.signUp({ email: email.trim(), password });
  } catch (cause) {
    await blockOnSecureStorageFailure(cause);
    throw cause;
  }
  const { data, error } = result;
  if (error) throw new Error(error.message);
  if (!data.session?.user.id) return 'confirmationRequired';
  await activateSession(data.session.user.id);
  return 'signedIn';
}

export async function logout() {
  if (logoutInProgress) return;
  logoutInProgress = true;
  const previousUserId = state.userId;
  publish({ status: 'loading', userId: null });
  try {
    const userId = await accountIdForCleanup(previousUserId);
    if (userId) {
      await savePendingLogoutUserId(userId);
      await clearAccountLocalState(userId);
    }
    const client = getSupabaseClient();
    try {
      const result = await client?.auth.signOut();
      if (result?.error) throw result.error;
    } catch {
      // Network failure cannot leave the device signed in after the user requests logout.
      const result = await client?.auth.signOut({ scope: 'local' });
      if (result?.error) throw result.error;
    }
    await clearOfflineUserId();
    await clearPendingLogoutUserId();
    publish({ status: 'signedOut', userId: null });
  } catch (cause) {
    // Preserve the offline identity for a retry if device cleanup failed.
    publish({ status: 'storageError', userId: null });
    throw cause;
  } finally {
    logoutInProgress = false;
  }
}

function isNetworkFailure(error: { message: string } | null) {
  return Boolean(error && /network|fetch|offline|connection|timeout/i.test(error.message));
}

export async function restoreAuth(): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    publish({ status: 'configurationUnavailable', userId: null });
    return state;
  }
  try {
    if (await getPendingLogoutUserId()) {
      publish({ status: 'storageError', userId: null });
      return state;
    }
    const { data, error } = await requireClient().auth.getSession();
    if (data.session?.user.id) {
      await saveOfflineUserId(data.session.user.id);
      publish({ status: 'signedIn', userId: data.session.user.id });
    } else if (isNetworkFailure(error)) {
      const userId = await readOfflineUserId();
      publish(userId ? { status: 'offline', userId } : { status: 'signedOut', userId: null });
    } else {
      await logout();
    }
  } catch (error) {
    if (error instanceof Error && isNetworkFailure(error)) {
      try {
        const userId = await readOfflineUserId();
        publish(userId ? { status: 'offline', userId } : { status: 'signedOut', userId: null });
      } catch {
        publish({ status: 'storageError', userId: null });
      }
    } else {
      publish({ status: 'storageError', userId: null });
    }
  }
  return state;
}
