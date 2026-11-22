import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A random, anonymous id for this phone, so the company stats count a
 * visitor once per room per day (convex/companyStats.ts). Not linked to the
 * player's account and never sent anywhere else.
 */
const KEY = 'unlocked_vid';
let memo: Promise<string> | undefined;

function fresh(): string {
  let s = '';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function visitorId(): Promise<string> {
  if (!memo) {
    memo = (async () => {
      let id = '';
      try { id = (await AsyncStorage.getItem(KEY)) || ''; } catch {}
      if (!/^[a-z0-9]{16,40}$/.test(id)) {
        id = fresh();
        try { await AsyncStorage.setItem(KEY, id); } catch {}
      }
      return id;
    })();
  }
  return memo;
}
