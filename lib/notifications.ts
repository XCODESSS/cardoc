import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { CarDocument } from '../types/document';
import { parseExpiryDate } from './document-status';

type ReminderDocument = Pick<CarDocument, 'id' | 'userId' | 'expiryDate'>;
export type ReminderResult = 'scheduled' | 'disabled' | 'none';

const REMINDER_DAYS = [30, 7, 1] as const;
const CHANNEL_ID = 'expiry-reminders';
const VERSION = 1;

function reminderKey(userId: string, documentId: string): string {
  if (!userId || !documentId) throw new Error('User and document IDs are required for reminders.');
  return `cardoc.reminders.v${VERSION}.${userId}.${documentId}`;
}

async function readIds(key: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)
      || parsed.version !== VERSION || !('ids' in parsed) || !Array.isArray(parsed.ids)
      || !parsed.ids.every((id) => typeof id === 'string')) {
      throw new Error('Invalid reminder index.');
    }
    return parsed.ids;
  } catch {
    throw new Error('Invalid reminder index.');
  }
}

async function writeIds(key: string, ids: string[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify({ version: VERSION, ids }));
}

export async function cancelReminders(userId: string, documentId: string): Promise<void> {
  const key = reminderKey(userId, documentId);
  const ids = await readIds(key);
  for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id);
  await AsyncStorage.removeItem(key);
}

function isAllowed(settings: Notifications.NotificationPermissionsStatus): boolean {
  return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** Call with requestPermission=true only after the UI explains reminders to the user. */
export async function rescheduleReminders(
  userId: string,
  document: ReminderDocument,
  options: { now?: Date; requestPermission?: boolean } = {},
): Promise<ReminderResult> {
  if (document.userId !== userId) throw new Error('Document owner mismatch.');
  const key = reminderKey(userId, document.id);
  const now = options.now ?? new Date();
  await cancelReminders(userId, document.id);
  if (document.expiryDate === null) return 'none';

  const expiry = parseExpiryDate(document.expiryDate);
  const triggerDates = REMINDER_DAYS.map((daysBefore) => {
    const date = new Date(expiry);
    date.setDate(date.getDate() - daysBefore);
    date.setHours(9, 0, 0, 0);
    return { date, daysBefore };
  }).filter(({ date }) => date.getTime() > now.getTime());
  if (triggerDates.length === 0) return 'none';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Expiry reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (!isAllowed(permission) && options.requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!isAllowed(permission)) return 'disabled';

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  const ids: string[] = [];
  try {
    for (const { date, daysBefore } of triggerDates) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Document expiry reminder',
          body: `A saved document expires in ${daysBefore} ${daysBefore === 1 ? 'day' : 'days'}.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      });
      ids.push(id);
      await writeIds(key, ids);
    }
    return 'scheduled';
  } catch (error) {
    for (const id of ids) await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(key);
    throw error;
  }
}
