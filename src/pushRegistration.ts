import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { convex } from './convex';
import { api } from '../convex/_generated/api';
import { registerForPushNotificationsAsync } from './notifications';

/**
 * Tells the server which phone to push to (convex/push.ts).
 * Player: after login and when notification settings change.
 * Company: after the business login. Both are removed again on logout.
 */

export const PREF_KEY = '@notification_preferences';
// Same defaults as NotificationPrefsScreen (promotions need an opt-in).
const DEFAULT_PREFS: Record<string, boolean> = {
  bookingConfirmations: true,
  bookingReminders: true,
  newRooms: true,
  promotions: false,
  slotAlerts: true,
  systemUpdates: true,
};

let tokenPromise: Promise<string | null> | null = null;

function pushToken(): Promise<string | null> {
  if (!tokenPromise) {
    tokenPromise = registerForPushNotificationsAsync().catch(() => null);
    // Retry next time if permission was refused or the lookup failed.
    tokenPromise.then((t) => {
      if (!t) tokenPromise = null;
    });
  }
  return tokenPromise;
}

const platform = (): 'ios' | 'android' => (Platform.OS === 'ios' ? 'ios' : 'android');

/** The notification kinds the player turned off in the app's settings. */
async function mutedKinds(): Promise<string[]> {
  let prefs = { ...DEFAULT_PREFS };
  try {
    const stored = await AsyncStorage.getItem(PREF_KEY);
    if (stored) prefs = { ...prefs, ...JSON.parse(stored) };
  } catch {}
  return Object.keys(prefs).filter((k) => prefs[k] === false);
}

export async function syncPlayerPush(sessionToken: string | null) {
  if (!sessionToken) return;
  const token = await pushToken();
  if (!token) return;
  await convex
    .mutation(api.push.registerPlayer, { sessionToken, token, platform: platform(), muted: await mutedKinds() })
    .catch(() => {});
}

export async function syncCompanyPush(sessionToken: string | null) {
  if (!sessionToken) return;
  const token = await pushToken();
  if (!token) return;
  await convex.mutation(api.push.registerCompany, { sessionToken, token, platform: platform() }).catch(() => {});
}

/** On logout: this phone stops getting that account's pushes. */
export async function unregisterPush(role: 'player' | 'company') {
  const token = await pushToken();
  if (!token) return;
  await convex.mutation(api.push.unregister, { token, role }).catch(() => {});
}
