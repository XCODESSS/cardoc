import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { cancelAllRemindersForUser, cancelReminders, rescheduleReminders } from '../lib/notifications';

const mockValues = new Map<string, string>();
const mockScheduled: string[] = [];
let mockPermission = { granted: true, ios: { status: 0 } };

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockValues.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockValues.delete(key); }),
    getAllKeys: jest.fn(async () => [...mockValues.keys()]),
  },
}));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  getPermissionsAsync: jest.fn(async () => mockPermission),
  requestPermissionsAsync: jest.fn(async () => mockPermission),
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => {
    const id = `notification-${mockScheduled.length + 1}`;
    mockScheduled.push(id);
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

const document = {
  id: 'document-a', userId: 'user-a', expiryDate: '2026-12-31',
};
const now = new Date(2026, 10, 1, 12);

beforeEach(() => {
  mockValues.clear();
  mockScheduled.length = 0;
  mockPermission = { granted: true, ios: { status: 0 } };
  jest.clearAllMocks();
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async () => {
    const id = `notification-${mockScheduled.length + 1}`;
    mockScheduled.push(id);
    return id;
  });
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async () => {});
});

test('schedules 30, 7, and 1 days before expiry at 09:00 local time', async () => {
  expect(await rescheduleReminders('user-a', document, { now })).toBe('scheduled');
  const calls = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls;
  expect(calls).toHaveLength(3);
  expect(calls.map(([request]) => {
    const trigger = request.trigger as { date: Date };
    return [trigger.date.getFullYear(), trigger.date.getMonth() + 1, trigger.date.getDate(), trigger.date.getHours()];
  })).toEqual([[2026, 12, 1, 9], [2026, 12, 24, 9], [2026, 12, 30, 9]]);
  expect(calls[0][0].content).toMatchObject({ title: 'Document expiry reminder' });
  expect(JSON.stringify(calls[0][0].content)).not.toContain('user-a');
  expect(JSON.stringify(calls[0][0].content)).not.toContain('document-a');
  expect(mockValues.get('cardoc.reminders.v1.user-a.document-a')).toContain('notification-3');
});

test('skips past reminder points and same-day points after 09:00', async () => {
  const result = await rescheduleReminders('user-a', { ...document, expiryDate: '2026-11-08' }, { now });
  expect(result).toBe('scheduled');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  expect((jest.mocked(Notifications.scheduleNotificationAsync).mock.calls[0][0].trigger as { date: Date }).date.getDate()).toBe(7);
});

test('rescheduling cancels old IDs before creating new ones', async () => {
  await rescheduleReminders('user-a', document, { now });
  const order: string[] = [];
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async (id) => { order.push(`cancel:${id}`); });
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async () => { order.push('schedule'); return `new-${order.length}`; });
  await rescheduleReminders('user-a', { ...document, expiryDate: '2027-01-31' }, { now });
  expect(order.slice(0, 3)).toEqual(['cancel:notification-1', 'cancel:notification-2', 'cancel:notification-3']);
  expect(order[3]).toBe('schedule');
});

test('deleting a document cancels only its own reminders', async () => {
  await rescheduleReminders('user-a', document, { now });
  await rescheduleReminders('user-b', { ...document, userId: 'user-b' }, { now });
  await cancelReminders('user-a', 'document-a');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
  expect(mockValues.has('cardoc.reminders.v1.user-a.document-a')).toBe(false);
  expect(mockValues.has('cardoc.reminders.v1.user-b.document-a')).toBe(true);
});

test('sign-out cancels all account reminders and preserves another account', async () => {
  await rescheduleReminders('user-a', document, { now });
  await rescheduleReminders('user-a', { ...document, id: 'document-b' }, { now });
  await rescheduleReminders('user-b', { ...document, userId: 'user-b' }, { now });
  await cancelAllRemindersForUser('user-a');
  expect(mockValues.has('cardoc.reminders.v1.user-a.document-a')).toBe(false);
  expect(mockValues.has('cardoc.reminders.v1.user-a.document-b')).toBe(false);
  expect(mockValues.has('cardoc.reminders.v1.user-b.document-a')).toBe(true);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(6);
});

test('denied permission does not schedule and reports disabled', async () => {
  mockPermission = { granted: false, ios: { status: 0 } };
  expect(await rescheduleReminders('user-a', document, { now })).toBe('disabled');
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('requests permission only when UI explicitly opts in', async () => {
  mockPermission = { granted: false, ios: { status: 0 } };
  expect(await rescheduleReminders('user-a', document, { now, requestPermission: true })).toBe('disabled');
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

test('null expiry cancels reminders without scheduling new ones', async () => {
  await rescheduleReminders('user-a', document, { now });
  expect(await rescheduleReminders('user-a', { ...document, expiryDate: null }, { now })).toBe('none');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
});

test('rejects cross-account documents', async () => {
  await expect(rescheduleReminders('user-b', document, { now })).rejects.toThrow('owner');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
