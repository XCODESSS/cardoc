const mockAuthState = jest.fn();
const mockReadOfflineIndex = jest.fn();
const mockWriteOfflineIndex = jest.fn();
const mockFrom = jest.fn();

jest.mock('../lib/auth', () => ({ getAuthState: () => mockAuthState() }));
jest.mock('../lib/offline-index', () => ({
  readOfflineIndex: (...args: unknown[]) => mockReadOfflineIndex(...args),
  writeOfflineIndex: (...args: unknown[]) => mockWriteOfflineIndex(...args),
}));
jest.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }) }));

import { createVehicle, deleteVehicle, listVehicles, updateVehicle } from '../lib/vehicles';

const row = {
  id: 'vehicle-a', user_id: 'user-a', nickname: 'My BMW', registration_number: 'GJ05AB1234',
  manufacturer: null, model: null, year: null,
  created_at: '2026-09-23T00:00:00Z', updated_at: '2026-09-23T00:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.mockReturnValue({ status: 'signedIn', userId: 'user-a' });
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [], documents: [] });
  mockWriteOfflineIndex.mockResolvedValue(undefined);
});

test('rejects requests for another owner before cloud or local metadata access', async () => {
  await expect(listVehicles('user-b')).rejects.toThrow('owner');
  expect(mockFrom).not.toHaveBeenCalled();
  expect(mockReadOfflineIndex).not.toHaveBeenCalled();
});

test('rejects a vehicle deletion when documents still refer to it', async () => {
  const documentsQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
  };
  documentsQuery.eq.mockReturnValueOnce(documentsQuery).mockResolvedValueOnce({ count: 1, error: null });
  mockFrom.mockReturnValueOnce(documentsQuery);
  await expect(deleteVehicle('vehicle-a')).rejects.toThrow('documents');
  expect(mockFrom).toHaveBeenCalledTimes(1);
  expect(documentsQuery.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-a');
  expect(documentsQuery.eq).toHaveBeenNthCalledWith(2, 'vehicle_id', 'vehicle-a');
  expect(mockWriteOfflineIndex).not.toHaveBeenCalled();
});

test('refuses deletion if the document count is unavailable', async () => {
  const documentsQuery = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
  documentsQuery.eq.mockReturnValueOnce(documentsQuery).mockResolvedValueOnce({ count: null, error: null });
  mockFrom.mockReturnValueOnce(documentsQuery);
  await expect(deleteVehicle('vehicle-a')).rejects.toThrow('Could not check');
  expect(mockFrom).toHaveBeenCalledTimes(1);
});

test('creation derives the owner from signed-in auth and saves the local index', async () => {
  const query = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: row, error: null }) };
  mockFrom.mockReturnValueOnce(query);
  const created = await createVehicle({ nickname: ' My BMW ', registrationNumber: ' GJ05AB1234 ' });
  expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-a', nickname: 'My BMW', registration_number: 'GJ05AB1234' }));
  expect(created).toMatchObject({ id: 'vehicle-a', userId: 'user-a', nickname: 'My BMW' });
  expect(mockWriteOfflineIndex).toHaveBeenCalledWith('user-a', expect.objectContaining({ vehicles: [created], documents: [] }));
});

test('update targets the signed-in owner and stores the returned row', async () => {
  const query = { update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: row, error: null }) };
  mockFrom.mockReturnValueOnce(query);
  await updateVehicle('vehicle-a', { nickname: 'My BMW', registrationNumber: 'GJ05AB1234' });
  expect(query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-a');
  expect(query.eq).toHaveBeenNthCalledWith(2, 'id', 'vehicle-a');
  expect(mockWriteOfflineIndex).toHaveBeenCalledTimes(1);
});

test('deletion with no documents removes only the owned vehicle and its local record', async () => {
  const documentsQuery = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
  documentsQuery.eq.mockReturnValueOnce(documentsQuery).mockResolvedValueOnce({ count: 0, error: null });
  const vehicleQuery = { delete: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), select: jest.fn().mockResolvedValue({ data: [{ id: 'vehicle-a' }], error: null }) };
  mockFrom.mockReturnValueOnce(documentsQuery).mockReturnValueOnce(vehicleQuery);
  mockReadOfflineIndex.mockResolvedValue({ vehicles: [{ id: 'vehicle-a', userId: 'user-a' }, { id: 'vehicle-b', userId: 'user-a' }], documents: [] });
  await deleteVehicle('vehicle-a');
  expect(vehicleQuery.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-a');
  expect(vehicleQuery.eq).toHaveBeenNthCalledWith(2, 'id', 'vehicle-a');
  expect(mockWriteOfflineIndex).toHaveBeenCalledWith('user-a', { vehicles: [{ id: 'vehicle-b', userId: 'user-a' }], documents: [] });
});
