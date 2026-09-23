import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

const mockAuthState = jest.fn();
const mockListVehicles = jest.fn();
const mockRouterBack = jest.fn();
const mockFrom = jest.fn();
const mockStorageFrom = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockWriteOfflineIndex = jest.fn();
const mockCacheSave = jest.fn();
const mockCacheGet = jest.fn();
const mockCacheExists = jest.fn();
const mockRescheduleReminders = jest.fn();
const mockDocumentPicker = jest.fn();
const mockImagePicker = jest.fn();
const mockFiles = new Map<string, Uint8Array>();

jest.mock('../lib/auth', () => ({ getAuthState: () => mockAuthState(), useAuthState: () => mockAuthState() }));
jest.mock('../lib/vehicles', () => ({ listVehicles: () => mockListVehicles() }));
jest.mock('expo-router', () => ({
  router: { back: () => mockRouterBack() },
  useLocalSearchParams: () => ({ vehicleId: VEHICLE_ID }),
}));
jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ from: (...args: unknown[]) => mockFrom(...args), storage: { from: (...args: unknown[]) => mockStorageFrom(...args) } }),
}));
jest.mock('../lib/offline-index', () => ({
  readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args),
  writeOfflineIndex: (...args: unknown[]) => mockWriteOfflineIndex(...args),
}));
jest.mock('../lib/document-cache', () => ({
  createDocumentCache: () => ({
    save: (...args: unknown[]) => mockCacheSave(...args), get: (...args: unknown[]) => mockCacheGet(...args),
    exists: (...args: unknown[]) => mockCacheExists(...args),
  }),
}));
jest.mock('../lib/notifications', () => ({
  rescheduleReminders: (...args: unknown[]) => mockRescheduleReminders(...args),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => DOCUMENT_ID }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockDocumentPicker(...args) }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockImagePicker(...args) }));
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/').replace('file:///','file://');
    }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri)?.byteLength ?? 0; }
    async arrayBuffer() {
      const bytes = mockFiles.get(this.uri);
      if (!bytes) throw new Error('Missing file');
      return bytes.slice().buffer;
    }
    async copy(destination: MockFile) {
      const bytes = mockFiles.get(this.uri);
      if (!bytes) throw new Error('Missing file');
      mockFiles.set(destination.uri, bytes.slice());
    }
    delete() { mockFiles.delete(this.uri); }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
    }
    create() { /* in memory */ }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: { uri: 'file://cache' } } };
});

import { retryOfflineCopy, selectFile, selectPhoto, uploadDocument } from '../lib/document-upload';
import NewDocumentScreen from '../app/document/new';
import { getLocalDocumentUri, listDocuments } from '../lib/documents';
import type { CarDocument } from '../types/document';
import { documentInputSchema, validateSelectedFile } from '../validation/document';

const signature: Record<string, number[]> = {
  'application/pdf': [37, 80, 68, 70, 45],
  'image/jpeg': [255, 216, 255, 224],
  'image/png': [137, 80, 78, 71, 13, 10, 26, 10],
};

function selected(mimeType: string, name: string) {
  const bytes = new Uint8Array([...signature[mimeType], 1, 2, 3]);
  const uri = `file://picked/${name}`;
  mockFiles.set(uri, bytes);
  return { uri, mimeType, name, sizeBytes: bytes.byteLength };
}

function insertQuery(mimeType: string, expiryDate: string | null = null) {
  const row = {
    id: DOCUMENT_ID, user_id: USER_ID, vehicle_id: VEHICLE_ID, scope: 'vehicle', type: 'insurance',
    display_name: 'Insurance', file_path: `${USER_ID}/${DOCUMENT_ID}.${mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg'}`,
    mime_type: mimeType, size_bytes: signature[mimeType].length + 3, expiry_date: expiryDate,
    created_at: '2026-09-23T00:00:00Z', updated_at: '2026-09-23T00:00:00Z',
  };
  return { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: row, error: null }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockAuthState.mockReturnValue({ status: 'signedIn', userId: USER_ID });
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [] });
  mockWriteOfflineIndex.mockResolvedValue(undefined);
  mockCacheSave.mockResolvedValue('file://cached/document');
  mockCacheGet.mockResolvedValue('file://cached/document');
  mockCacheExists.mockResolvedValue(true);
  mockRescheduleReminders.mockResolvedValue('scheduled');
  mockListVehicles.mockResolvedValue([{
    id: VEHICLE_ID, userId: USER_ID, nickname: 'My BMW', registrationNumber: 'GJ05AB1234',
  }]);
});

test('schedules reminders after a saved document without prompting by default', async () => {
  const expiryDate = '2027-03-16';
  const onReminderResult = jest.fn();
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue(insertQuery('application/pdf', expiryDate));
  const result = await uploadDocument(
    { scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate },
    selected('application/pdf', 'insurance.pdf'),
    { onReminderResult },
  );
  expect(result.offlineAvailable).toBe(true);
  expect(mockRescheduleReminders).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ id: DOCUMENT_ID, expiryDate }), { requestPermission: false });
  expect(onReminderResult).toHaveBeenCalledWith('scheduled');
});

test('permission denial is reported while the uploaded document remains saved', async () => {
  const expiryDate = '2027-03-16';
  const onReminderResult = jest.fn();
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue(insertQuery('application/pdf', expiryDate));
  mockRescheduleReminders.mockResolvedValue('disabled');
  const result = await uploadDocument(
    { scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate },
    selected('application/pdf', 'insurance.pdf'),
    { requestReminderPermission: true, onReminderResult },
  );
  expect(result.id).toBe(DOCUMENT_ID);
  expect(mockRescheduleReminders).toHaveBeenCalledWith(USER_ID, expect.anything(), { requestPermission: true });
  expect(onReminderResult).toHaveBeenCalledWith('disabled');
});

test('online-only saves still schedule and offline retries do not duplicate reminders', async () => {
  const expiryDate = '2027-03-16';
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue(insertQuery('application/pdf', expiryDate));
  mockCacheSave.mockRejectedValueOnce(new Error('Disk full'));
  const file = selected('application/pdf', 'insurance.pdf');
  const result = await uploadDocument(
    { scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate }, file,
  );
  expect(result.offlineAvailable).toBe(false);
  expect(mockRescheduleReminders).toHaveBeenCalledTimes(1);
  expect((await retryOfflineCopy(result, file)).offlineAvailable).toBe(true);
  expect(mockRescheduleReminders).toHaveBeenCalledTimes(1);
});

test('notification failure does not turn a saved document into an upload failure', async () => {
  const expiryDate = '2027-03-16';
  const onReminderResult = jest.fn();
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue(insertQuery('application/pdf', expiryDate));
  mockRescheduleReminders.mockRejectedValue(new Error('Notifications unavailable'));
  const result = await uploadDocument(
    { scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate },
    selected('application/pdf', 'insurance.pdf'), { onReminderResult },
  );
  expect(result.id).toBe(DOCUMENT_ID);
  expect(onReminderResult).toHaveBeenCalledWith('error');
});

test('upload screen explains reminders before opting in and shows denied permission after save', async () => {
  const expiryDate = '2027-03-16';
  const file = selected('application/pdf', 'insurance.pdf');
  mockDocumentPicker.mockResolvedValue({
    canceled: false, assets: [{ uri: file.uri, name: file.name, mimeType: file.mimeType, size: file.sizeBytes }],
  });
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue(insertQuery('application/pdf', expiryDate));
  mockRescheduleReminders.mockResolvedValue('disabled');
  const screen = await render(React.createElement(NewDocumentScreen));
  await waitFor(() => expect(screen.getByText('My BMW')).toBeTruthy());
  await fireEvent.press(screen.getByRole('button', { name: 'Insurance' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Choose from Files' }));
  await fireEvent.changeText(screen.getByPlaceholderText('YYYY-MM-DD'), expiryDate);
  expect(screen.getByText(/Cardoc can remind you 30, 7, and 1 days/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch', { name: 'Ask to enable expiry reminders' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save document' }));
  await waitFor(() => expect(screen.getByText(/Saved\. Expiry reminders are off/)).toBeTruthy());
  expect(mockRescheduleReminders).toHaveBeenCalledWith(USER_ID, expect.anything(), { requestPermission: true });
  expect(mockRouterBack).not.toHaveBeenCalled();
});

test.each([
  ['application/pdf', 'insurance.pdf'],
  ['image/jpeg', 'insurance.jpg'],
  ['image/png', 'insurance.png'],
])('uploads %s to private storage, then inserts metadata and caches it', async (mimeType, name) => {
  const events: string[] = [];
  const upload = jest.fn().mockImplementation(async () => { events.push('upload'); return { error: null }; });
  const remove = jest.fn();
  mockStorageFrom.mockReturnValue({ upload, remove });
  const query = insertQuery(mimeType);
  query.single.mockImplementation(async () => { events.push('insert'); return { data: await insertQuery(mimeType).single().then((result: {data: unknown}) => result.data), error: null }; });
  mockFrom.mockReturnValue(query);
  const file = selected(mimeType, name);
  const result = await uploadDocument({ scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate: null }, file);
  expect(events).toEqual(['upload', 'insert']);
  expect(mockStorageFrom).toHaveBeenCalledWith('cardoc-documents');
  expect(upload).toHaveBeenCalledWith(`${USER_ID}/${DOCUMENT_ID}.${mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg'}`, expect.any(ArrayBuffer), { contentType: mimeType, upsert: false });
  expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: USER_ID, vehicle_id: VEHICLE_ID, mime_type: mimeType }));
  expect(mockCacheSave).toHaveBeenCalledWith(DOCUMENT_ID, expect.stringMatching(/\.(pdf|jpg|png)$/));
  expect(mockCacheSave).toHaveBeenCalledWith(DOCUMENT_ID, expect.stringContaining(`/cardoc-upload-staging/${USER_ID}/`));
  expect(result.offlineAvailable).toBe(true);
});

test('rejects unsupported, empty, oversized, and mismatched files', async () => {
  expect(() => validateSelectedFile({ uri: 'file://heic', name: 'photo.heic', mimeType: 'image/heic', sizeBytes: 100 })).toThrow();
  expect(() => validateSelectedFile({ uri: 'file://empty', name: 'empty.pdf', mimeType: 'application/pdf', sizeBytes: 0 })).toThrow();
  expect(() => validateSelectedFile({ uri: 'file://big', name: 'big.pdf', mimeType: 'application/pdf', sizeBytes: 20 * 1024 * 1024 + 1 })).toThrow();
  expect(() => validateSelectedFile({ uri: 'file://bad', name: 'bad.png', mimeType: 'application/pdf', sizeBytes: 100 })).toThrow();
});

test('rejects calendar dates that expiry status cannot parse', () => {
  const base = { scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID };
  expect(documentInputSchema.safeParse({ ...base, expiryDate: '1899-12-31' }).success).toBe(false);
  expect(documentInputSchema.safeParse({ ...base, expiryDate: '2027-02-29' }).success).toBe(false);
  expect(documentInputSchema.safeParse({ ...base, expiryDate: '2028-02-29' }).success).toBe(true);
});

test('Files and Photo Library selectors reject unsupported assets even when picker opens', async () => {
  mockDocumentPicker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://picked/rc.pdf', name: 'rc.pdf', mimeType: 'application/pdf', size: 8 }] });
  expect(await selectFile()).toMatchObject({ name: 'rc.pdf', mimeType: 'application/pdf' });
  expect(mockDocumentPicker).toHaveBeenCalledWith(expect.objectContaining({ copyToCacheDirectory: true, type: ['application/pdf', 'image/jpeg', 'image/png'] }));
  mockImagePicker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://picked/photo.heic', fileName: 'photo.heic', mimeType: 'image/heic', fileSize: 9 }] });
  await expect(selectPhoto()).rejects.toThrow('Only PDF, JPEG, and PNG');
  expect(mockImagePicker).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'] }));
  mockImagePicker.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://picked/photo.png', fileName: null, mimeType: null, fileSize: 9 }] });
  expect(await selectPhoto()).toMatchObject({ mimeType: 'image/png', name: 'photo.png' });
});

test('rejects a forged MIME when file bytes do not match', async () => {
  const file = selected('application/pdf', 'fake.pdf');
  mockFiles.set(file.uri, new Uint8Array([1, 2, 3, 4, 5]));
  file.sizeBytes = 5;
  await expect(uploadDocument({ scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate: null }, file)).rejects.toThrow('content');
  expect(mockStorageFrom).not.toHaveBeenCalled();
});

test('rejects driver/vehicle scope mismatch before any cloud call', async () => {
  const file = selected('application/pdf', 'licence.pdf');
  await expect(uploadDocument({ scope: 'driver', type: 'driving_license', displayName: 'DL', vehicleId: VEHICLE_ID, expiryDate: null }, file)).rejects.toThrow();
  expect(mockStorageFrom).not.toHaveBeenCalled();
});

test('storage failure does not insert a database record', async () => {
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: { message: 'Upload failed' } }) });
  await expect(uploadDocument({ scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate: null }, selected('application/pdf', 'insurance.pdf'))).rejects.toThrow('Upload failed');
  expect(mockFrom).not.toHaveBeenCalled();
});

test('database failure removes uploaded object', async () => {
  const remove = jest.fn().mockResolvedValue({ error: null });
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }), remove });
  const query = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }) };
  mockFrom.mockReturnValue(query);
  await expect(uploadDocument({ scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate: null }, selected('application/pdf', 'insurance.pdf'))).rejects.toThrow('Insert failed');
  expect(remove).toHaveBeenCalledWith([expect.stringMatching(new RegExp(`^${USER_ID}/`))]);
  expect(remove).toHaveBeenCalledTimes(1);
});

test('reports both database and cleanup failures without repeating cleanup', async () => {
  const remove = jest.fn().mockResolvedValue({ error: { message: 'Delete failed' } });
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }), remove });
  mockFrom.mockReturnValue({ insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }) });
  await expect(uploadDocument({ scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate: null }, selected('application/pdf', 'insurance.pdf'))).rejects.toThrow('Insert failed. Uploaded file cleanup also failed');
  expect(remove).toHaveBeenCalledTimes(1);
});

test('cache failure returns explicit online-only state', async () => {
  mockStorageFrom.mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue(insertQuery('application/pdf'));
  mockCacheSave.mockRejectedValue(new Error('Disk full'));
  const result = await uploadDocument({ scope: 'vehicle', type: 'insurance', displayName: 'Insurance', vehicleId: VEHICLE_ID, expiryDate: null }, selected('application/pdf', 'insurance.pdf'));
  expect(result.offlineAvailable).toBe(false);
  expect(mockWriteOfflineIndex).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ documents: [expect.objectContaining({ offlineAvailable: false })] }));
});

test('document listing and local URI access reject another signed-in owner', async () => {
  await expect(listDocuments('44444444-4444-4444-8444-444444444444')).rejects.toThrow('owner');
  await expect(getLocalDocumentUri({ id: DOCUMENT_ID, userId: '44444444-4444-4444-8444-444444444444' } as CarDocument)).rejects.toThrow('owner');
  expect(mockFrom).not.toHaveBeenCalled();
  expect(mockCacheGet).not.toHaveBeenCalled();
});
