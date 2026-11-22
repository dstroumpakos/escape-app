/**
 * This phone's chat key per player, kept in the iOS Keychain / Android
 * Keystore (expo-secure-store). The private key never leaves the phone; only
 * the public key is registered with convex/messages.ts.
 */
import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';
import { deviceFromPrivate, fromB64, newDeviceKeys, toB64, type DeviceKeys } from './crypto';

// React Native has no crypto.getRandomValues: take it from expo-crypto (the OS's secure random).
const g = globalThis as any;
if (!g.crypto) g.crypto = {};
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = (a: any) => ExpoCrypto.getRandomValues(a);

const storeKey = (userId: string) => `chatDevice_${userId.replace(/[^A-Za-z0-9._-]/g, '')}`;

const devices = new Map<string, Promise<DeviceKeys>>();

/** This phone's chat key for a player (made the first time). */
export function getDevice(userId: string): Promise<DeviceKeys> {
  let p = devices.get(userId);
  if (!p) {
    p = (async () => {
      const saved = await SecureStore.getItemAsync(storeKey(userId));
      if (saved) {
        try {
          const j = JSON.parse(saved);
          if (j?.deviceId && j?.privateKey) return deviceFromPrivate(j.deviceId, fromB64(j.privateKey));
        } catch {
          // unreadable: make a new one below
        }
      }
      const d = newDeviceKeys();
      await SecureStore.setItemAsync(
        storeKey(userId),
        JSON.stringify({ deviceId: d.deviceId, privateKey: toB64(d.privateKey) }),
        { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
      );
      return d;
    })();
    devices.set(userId, p);
    p.catch(() => devices.delete(userId));
  }
  return p;
}
