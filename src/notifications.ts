import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Configure how notifications appear when the app is in the foreground ──
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Request permissions & get push token ──
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push tokens don't work on simulators, but local notifications do
    console.log('Push notifications require a physical device for tokens.');
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permissions not granted.');
    return null;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#DC2626',
    });

    await Notifications.setNotificationChannelAsync('new-rooms', {
      name: 'New Rooms',
      description: 'Notifications about new escape rooms',
      importance: Notifications.AndroidImportance.HIGH,
    });

    await Notifications.setNotificationChannelAsync('bookings', {
      name: 'Bookings',
      description: 'Booking confirmations and availability updates',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

// ── Schedule a local notification ──
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId?: string,
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data ?? {},
      sound: 'default',
      ...(Platform.OS === 'android' && channelId ? { channelId } : {}),
    },
    trigger: null, // fire immediately
  });
}

// ── Helpers to track "last-seen" counts for detecting new items ──
const LAST_ROOM_COUNT_KEY = '@notif_last_room_count';
const LAST_BOOKING_IDS_KEY = '@notif_last_booking_ids';
const LAST_BOOKING_STATUSES_KEY = '@notif_last_booking_statuses';
const LAST_COMPANY_BOOKING_IDS_KEY = '@notif_last_company_booking_ids';
const LAST_COMPANY_BOOKING_STATUSES_KEY = '@notif_last_company_booking_statuses';

export async function getLastRoomCount(): Promise<number> {
  const val = await AsyncStorage.getItem(LAST_ROOM_COUNT_KEY);
  return val ? parseInt(val, 10) : 0;
}

export async function setLastRoomCount(count: number): Promise<void> {
  await AsyncStorage.setItem(LAST_ROOM_COUNT_KEY, String(count));
}

export async function getLastBookingIds(): Promise<string[]> {
  const val = await AsyncStorage.getItem(LAST_BOOKING_IDS_KEY);
  return val ? JSON.parse(val) : [];
}

export async function setLastBookingIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(LAST_BOOKING_IDS_KEY, JSON.stringify(ids));
}

export async function getLastBookingStatuses(): Promise<Record<string, string>> {
  const val = await AsyncStorage.getItem(LAST_BOOKING_STATUSES_KEY);
  return val ? JSON.parse(val) : {};
}

export async function setLastBookingStatuses(statuses: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(LAST_BOOKING_STATUSES_KEY, JSON.stringify(statuses));
}

export async function getLastCompanyBookingIds(): Promise<string[]> {
  const val = await AsyncStorage.getItem(LAST_COMPANY_BOOKING_IDS_KEY);
  return val ? JSON.parse(val) : [];
}

export async function setLastCompanyBookingIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(LAST_COMPANY_BOOKING_IDS_KEY, JSON.stringify(ids));
}

export async function getLastCompanyBookingStatuses(): Promise<Record<string, string>> {
  const val = await AsyncStorage.getItem(LAST_COMPANY_BOOKING_STATUSES_KEY);
  return val ? JSON.parse(val) : {};
}

export async function setLastCompanyBookingStatuses(statuses: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(LAST_COMPANY_BOOKING_STATUSES_KEY, JSON.stringify(statuses));
}

// ── Notification response listener (for handling taps) ──
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void,
) {
  return Notifications.addNotificationReceivedListener(callback);
}
