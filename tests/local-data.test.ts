const mockClearCache = jest.fn();
const mockClearIndex = jest.fn();
const mockCancelReminders = jest.fn();

jest.mock('../lib/document-cache', () => ({ clearDocumentCache: (...args: unknown[]) => mockClearCache(...args) }));
jest.mock('../lib/offline-index', () => ({ clearOfflineIndex: (...args: unknown[]) => mockClearIndex(...args) }));
jest.mock('../lib/notifications', () => ({ cancelAllRemindersForUser: (...args: unknown[]) => mockCancelReminders(...args) }));

import { clearAccountLocalState } from '../lib/local-data';

const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  mockClearCache.mockResolvedValue(undefined);
  mockClearIndex.mockResolvedValue(undefined);
  mockCancelReminders.mockResolvedValue(undefined);
});

test('clears every account-scoped local store on sign-out', async () => {
  await clearAccountLocalState(USER_ID);
  expect(mockClearCache).toHaveBeenCalledWith(USER_ID);
  expect(mockClearIndex).toHaveBeenCalledWith(USER_ID);
  expect(mockCancelReminders).toHaveBeenCalledWith(USER_ID);
});

test('attempts every store and reports failure when a cleanup step fails', async () => {
  mockClearCache.mockRejectedValueOnce(new Error('disk error'));
  await expect(clearAccountLocalState(USER_ID)).rejects.toThrow('Local account data could not be fully cleared');
  expect(mockClearIndex).toHaveBeenCalledWith(USER_ID);
  expect(mockCancelReminders).toHaveBeenCalledWith(USER_ID);
});
