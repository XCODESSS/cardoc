import type { CarDocument } from '../types/document';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';
const PATH = `${USER_ID}/${DOCUMENT_ID}.pdf`;
const events: string[] = [];

const mockRemoveObject = jest.fn();
const mockCacheRemove = jest.fn();
const mockCancelReminders = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockWriteOfflineIndex = jest.fn();
const mockFetch = jest.fn();
const mockDelete = jest.fn();
const mockRequireIdentity = jest.fn();

const fetchQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: (...args: unknown[]) => mockFetch(...args),
};
const deleteQuery = {
  eq: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  maybeSingle: (...args: unknown[]) => mockDelete(...args),
};
const client = {
  from: jest.fn(() => ({ ...fetchQuery, delete: () => deleteQuery })),
  storage: { from: jest.fn(() => ({ remove: (...args: unknown[]) => mockRemoveObject(...args) })) },
};

jest.mock('../lib/documents', () => ({ requireDocumentIdentity: () => mockRequireIdentity() }));
jest.mock('../lib/document-cache', () => ({
  createDocumentCache: () => ({ remove: (...args: unknown[]) => mockCacheRemove(...args) }),
}));
jest.mock('../lib/notifications', () => ({ cancelReminders: (...args: unknown[]) => mockCancelReminders(...args) }));
jest.mock('../lib/offline-index', () => ({
  readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args),
  writeOfflineIndex: (...args: unknown[]) => mockWriteOfflineIndex(...args),
}));

import { deleteDocument } from '../lib/document-delete';

const document = { id: DOCUMENT_ID, userId: USER_ID } as CarDocument;
const other = { id: OTHER_ID, userId: USER_ID } as CarDocument;

beforeEach(() => {
  events.length = 0;
  jest.clearAllMocks();
  mockRequireIdentity.mockReturnValue({ userId: USER_ID, client });
  mockFetch.mockResolvedValue({
    data: { id: DOCUMENT_ID, user_id: USER_ID, file_path: PATH, mime_type: 'application/pdf' }, error: null,
  });
  mockRemoveObject.mockImplementation(async () => { events.push('cloud'); return { data: [], error: null }; });
  mockCacheRemove.mockImplementation(async () => { events.push('cache'); });
  mockCancelReminders.mockImplementation(async () => { events.push('reminders'); });
  mockReadOfflineIndex.mockImplementation(async () => { events.push('index-read'); return { vehicles: [], documents: [document, other] }; });
  mockWriteOfflineIndex.mockImplementation(async () => { events.push('index-write'); });
  mockDelete.mockImplementation(async () => { events.push('metadata'); return { data: { id: DOCUMENT_ID }, error: null }; });
});

test('removes the cloud object, cached copy, reminder IDs, offline entry, and metadata in retryable order', async () => {
  await deleteDocument(DOCUMENT_ID);
  expect(events).toEqual(['cloud', 'cache', 'reminders', 'index-read', 'index-write', 'metadata']);
  expect(client.storage.from).toHaveBeenCalledWith('cardoc-documents');
  expect(mockRemoveObject).toHaveBeenCalledWith([PATH]);
  expect(mockCacheRemove).toHaveBeenCalledWith(DOCUMENT_ID);
  expect(mockCancelReminders).toHaveBeenCalledWith(USER_ID, DOCUMENT_ID);
  expect(mockWriteOfflineIndex).toHaveBeenCalledWith(USER_ID, { vehicles: [], documents: [other] });
  expect(fetchQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
  expect(deleteQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
  expect(deleteQuery.eq).toHaveBeenCalledWith('id', DOCUMENT_ID);
});

test('does not touch files when document metadata is not owned or has an invalid path', async () => {
  mockFetch.mockResolvedValueOnce({ data: null, error: null });
  await expect(deleteDocument(DOCUMENT_ID)).rejects.toThrow('Document not found');
  mockFetch.mockResolvedValueOnce({
    data: { id: DOCUMENT_ID, user_id: USER_ID, file_path: `${USER_ID}/${OTHER_ID}.pdf`, mime_type: 'application/pdf' }, error: null,
  });
  await expect(deleteDocument(DOCUMENT_ID)).rejects.toThrow('path');
  expect(mockRemoveObject).not.toHaveBeenCalled();
  expect(mockCacheRemove).not.toHaveBeenCalled();
});

test('rejects invalid IDs before cloud lookup', async () => {
  await expect(deleteDocument('../other')).rejects.toThrow('ID');
  expect(client.from).not.toHaveBeenCalled();
});

test('keeps metadata when cloud removal fails', async () => {
  mockRemoveObject.mockResolvedValueOnce({ data: null, error: { message: 'storage denied' } });
  await expect(deleteDocument(DOCUMENT_ID)).rejects.toThrow('Cloud file could not be removed');
  expect(mockCacheRemove).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
});

test('keeps metadata when device cleanup fails so the deletion can be retried', async () => {
  mockCacheRemove.mockRejectedValueOnce(new Error('disk error'));
  await expect(deleteDocument(DOCUMENT_ID)).rejects.toThrow('local copy could not be cleared');
  expect(mockDelete).not.toHaveBeenCalled();
  mockCacheRemove.mockResolvedValueOnce(undefined);
  mockCancelReminders.mockRejectedValueOnce(new Error('notification error'));
  await expect(deleteDocument(DOCUMENT_ID)).rejects.toThrow('reminders could not be cleared');
  expect(mockDelete).not.toHaveBeenCalled();
});

test('keeps metadata when offline index cleanup fails', async () => {
  mockWriteOfflineIndex.mockRejectedValueOnce(new Error('storage error'));
  await expect(deleteDocument(DOCUMENT_ID)).rejects.toThrow('offline metadata could not be cleared');
  expect(mockDelete).not.toHaveBeenCalled();
});

test('reports a partial failure if database deletion fails after file cleanup', async () => {
  mockDelete.mockResolvedValueOnce({ data: null, error: { message: 'db unavailable' } });
  await expect(deleteDocument(DOCUMENT_ID)).rejects.toThrow('metadata could not be deleted');
  expect(events).toContain('cloud');
  expect(events).toContain('cache');
});
