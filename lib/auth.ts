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
let authGeneration = 0;
let pendingRestoreIdentityWrite: Promise<void> | null = null;
const SESSION_RESTORE_TIMEOUT_MS = 2500;

async function waitForRestoreIdentityWrite() {
  try { await pendingRestoreIdentityWrite; } catch { /* Cleanup still needs to run after a failed write. */ }
}

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
  authGeneration += 1;
  logoutInProgress = true;
  const previousUserId = state.userId;
  publish({ status: 'loading', userId: null });
  try {
    await waitForRestoreIdentityWrite();
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
  const generation = ++authGeneration;
  await waitForRestoreIdentityWrite();
  if (generation !== authGeneration || logoutInProgress) throw new Error('Sign-in was interrupted.');
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
  authGeneration += 1;
  logoutInProgress = true;
  const previousUserId = state.userId;
  publish({ status: 'loading', userId: null });
  try {
    await waitForRestoreIdentityWrite();
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

async function getSessionWithTimeout() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      requireClient().auth.getSession().then((result) => ({ kind: 'session' as const, result })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ kind: 'timeout' }), SESSION_RESTORE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function restoreAuth(): Promise<AuthState> {
  const generation = ++authGeneration;
  const isCurrent = () => generation === authGeneration && !logoutInProgress;
  if (!isSupabaseConfigured()) {
    if (isCurrent()) publish({ status: 'configurationUnavailable', userId: null });
    return state;
  }
  try {
    const pendingLogoutUserId = await getPendingLogoutUserId();
    if (!isCurrent()) return state;
    if (pendingLogoutUserId) {
      publish({ status: 'storageError', userId: null });
      return state;
    }
    const sessionResult = await getSessionWithTimeout();
    if (!isCurrent()) return state;
    if (sessionResult.kind === 'timeout') {
      const userId = await readOfflineUserId();
      if (isCurrent()) publish(userId ? { status: 'offline', userId } : { status: 'signedOut', userId: null });
      return state;
    }
    const { data, error } = sessionResult.result;
    if (data.session?.user.id) {
      await waitForRestoreIdentityWrite();
      if (!isCurrent()) return state;
      const write = saveOfflineUserId(data.session.user.id);
      pendingRestoreIdentityWrite = write;
      try { await write; } finally {
        if (pendingRestoreIdentityWrite === write) pendingRestoreIdentityWrite = null;
      }
      if (isCurrent()) publish({ status: 'signedIn', userId: data.session.user.id });
    } else if (isNetworkFailure(error)) {
      const userId = await readOfflineUserId();
      if (isCurrent()) publish(userId ? { status: 'offline', userId } : { status: 'signedOut', userId: null });
    } else {
      if (isCurrent()) await logout();
    }
  } catch (error) {
    if (!isCurrent()) return state;
    if (error instanceof Error && isNetworkFailure(error)) {
      try {
        const userId = await readOfflineUserId();
        if (isCurrent()) publish(userId ? { status: 'offline', userId } : { status: 'signedOut', userId: null });
      } catch {
        if (isCurrent()) publish({ status: 'storageError', userId: null });
      }
    } else {
      if (isCurrent()) publish({ status: 'storageError', userId: null });
    }
  }
  return state;
}
