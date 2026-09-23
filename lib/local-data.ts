import { clearDocumentCache } from './document-cache';
import { clearOfflineIndex } from './offline-index';
import { cancelAllRemindersForUser } from './notifications';

/** Clear all device-held data for one account and try every store even if one fails. */
export async function clearAccountLocalState(userId: string): Promise<void> {
  const results = await Promise.allSettled([
    clearDocumentCache(userId),
    clearOfflineIndex(userId),
    cancelAllRemindersForUser(userId),
  ]);
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Local account data could not be fully cleared. Cardoc is locked; retry sign-out.');
  }
}
