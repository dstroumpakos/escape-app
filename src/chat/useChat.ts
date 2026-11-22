/**
 * Chat hooks, the same as escape-web src/lib/useChat.ts: this phone's device
 * key, and the keys of one conversation (unwrap, make a new one when members
 * changed, share with new devices). Crypto in crypto.ts, server in
 * convex/messages.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useUser } from '../UserContext';
import { getDevice } from './device';
import {
  decryptMessage,
  encryptMessage,
  newConversationKey,
  unwrap,
  wrapFor,
  type DeviceKeys,
  type WrappedKey,
} from './crypto';

// Unwrapped keys, kept in memory while the app runs.
const keyCache = new Map<string, Uint8Array>();
const cacheKey = (userId: string, conversationId: string, version: number) => `${userId}|${conversationId}|${version}`;

/** Unwraps (and caches) a conversation key wrapped for this phone. Null if it doesn't open. */
export function openKey(device: DeviceKeys, userId: string, conversationId: string, version: number, w: WrappedKey): Uint8Array | null {
  const ck = cacheKey(userId, conversationId, version);
  const hit = keyCache.get(ck);
  if (hit) return hit;
  try {
    const key = unwrap(device, w, { conversationId, keyVersion: version, userId });
    keyCache.set(ck, key);
    return key;
  } catch {
    return null;
  }
}

export function cachedKey(userId: string, conversationId: string, version: number) {
  return keyCache.get(cacheKey(userId, conversationId, version)) ?? null;
}

/** Decrypts a list preview; null when this phone can't open it. */
export function previewText(
  device: DeviceKeys,
  userId: string,
  c: { _id: string; lastKey: (WrappedKey & { keyVersion: number }) | null; lastMessage: { senderId: string; kind: string; keyVersion: number | null; iv: string | null; ciphertext: string | null } | null }
): string | null {
  const m = c.lastMessage;
  if (!m || m.kind !== 'text' || !c.lastKey || !m.iv || !m.ciphertext || !m.keyVersion) return null;
  const key = openKey(device, userId, c._id, c.lastKey.keyVersion, c.lastKey);
  if (!key) return null;
  try {
    return decryptMessage(key, { iv: m.iv, ciphertext: m.ciphertext }, { conversationId: c._id, keyVersion: m.keyVersion, senderId: m.senderId });
  } catch {
    return null;
  }
}

const registered = new Map<string, Promise<void>>();

/** This phone's device key, registered with the server. Null until ready. */
export function useChatDevice(): { device: DeviceKeys | null; error: boolean } {
  const { userId, sessionToken } = useUser();
  const register = useMutation(api.messages.registerDevice);
  const [device, setDevice] = useState<DeviceKeys | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId || !sessionToken) {
      setDevice(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await getDevice(userId);
        const regKey = `${userId}|${d.deviceId}`;
        let p = registered.get(regKey);
        if (!p) {
          p = register({ sessionToken, deviceId: d.deviceId, publicKey: d.publicJwk }).then(() => {});
          registered.set(regKey, p);
          p.catch(() => registered.delete(regKey));
        }
        await p;
        if (!cancelled) setDevice(d);
      } catch (e) {
        console.warn('[chat] device setup failed', e);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, sessionToken, register]);

  return { device, error };
}

/**
 * Runs while a player is logged in: registers this phone's chat key and passes
 * keys on to member devices that don't have them yet (a friend's new browser).
 */
export function useBackgroundKeySharing() {
  const { userId, sessionToken } = useUser();
  const { device } = useChatDevice();
  const pending = useQuery(
    api.messages.pendingKeyShares,
    device && sessionToken ? { sessionToken, deviceId: device.deviceId } : 'skip'
  );
  const shareKeys = useMutation(api.messages.shareKeys);
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!pending?.length || !device || !userId || !sessionToken) return;
    (async () => {
      for (const p of pending) {
        const sig = `${p.conversationId}:${p.missing.map((m) => `${m.userId}|${m.deviceId}|${m.keyVersion}`).join(',')}`;
        if (tried.current.has(sig)) continue;
        tried.current.add(sig);
        for (const k of p.myKeys) openKey(device, userId, p.conversationId, k.keyVersion, k);
        const wraps = p.missing
          .map((m) => {
            const key = cachedKey(userId, p.conversationId, m.keyVersion);
            if (!key) return null;
            return {
              keyVersion: m.keyVersion,
              userId: m.userId,
              deviceId: m.deviceId,
              ...wrapFor(key, m.publicKey, { conversationId: p.conversationId, keyVersion: m.keyVersion, userId: m.userId, deviceId: m.deviceId }),
            };
          })
          .filter((w): w is NonNullable<typeof w> => !!w);
        if (wraps.length) {
          await shareKeys({ sessionToken, conversationId: p.conversationId, wraps: wraps as any }).catch(() => tried.current.delete(sig));
        }
      }
    })();
  }, [pending, device, userId, sessionToken, shareKeys]);
}

const errCode = (e: unknown) => {
  const d = (e as any)?.data;
  return typeof d === 'string' ? d : '';
};

/**
 * Keys for one conversation. Makes a new key when the members changed, shares
 * keys with member devices that lack them, and sends / decrypts.
 */
export function useConversationKeys(conversationId: string | null, device: DeviceKeys | null) {
  const { userId, sessionToken: token } = useUser();
  const state = useQuery(
    api.messages.keyState,
    conversationId && device && token ? { sessionToken: token, conversationId: conversationId as any, deviceId: device.deviceId } : 'skip'
  );
  const rotateKey = useMutation(api.messages.rotateKey);
  const shareKeys = useMutation(api.messages.shareKeys);
  const sendMutation = useMutation(api.messages.sendMessage);

  // Bumped whenever a key lands in the cache, so the view decrypts again.
  const [keysTick, setKeysTick] = useState(0);
  const rotating = useRef(false);
  const sharedSig = useRef('');

  /** Makes a new key, wrapped for every member device. */
  const rotate = useCallback(async (): Promise<boolean> => {
    if (!conversationId || !device || !token || !state || !userId || rotating.current) return false;
    rotating.current = true;
    try {
      const version = state.keyVersion + 1;
      const raw = newConversationKey();
      const wraps = state.devices.map((d) => ({
        userId: d.userId,
        deviceId: d.deviceId,
        ...wrapFor(raw, d.publicKey, { conversationId, keyVersion: version, userId: d.userId, deviceId: d.deviceId }),
      }));
      await rotateKey({
        sessionToken: token,
        conversationId: conversationId as any,
        deviceId: device.deviceId,
        expectedVersion: state.keyVersion,
        wraps: wraps as any,
      });
      keyCache.set(cacheKey(userId, conversationId, version), raw);
      setKeysTick((n) => n + 1);
      return true;
    } catch (e) {
      // Someone else made a key or a device appeared: keyState updates and we try again.
      const code = errCode(e);
      if (code !== 'KEY_CHANGED' && code !== 'DEVICES_CHANGED') console.warn('[chat] rotate failed', e);
      return false;
    } finally {
      rotating.current = false;
    }
  }, [conversationId, device, token, state, userId, rotateKey]);

  // Unwrap my keys; make a new key if needed; share with devices that lack one.
  useEffect(() => {
    if (!state || !device || !conversationId || !userId || !token) return;
    let cancelled = false;
    (async () => {
      let added = false;
      for (const k of state.myKeys) {
        if (cachedKey(userId, conversationId, k.keyVersion)) continue;
        if (openKey(device, userId, conversationId, k.keyVersion, k)) added = true;
      }
      if (cancelled) return;
      if (added) setKeysTick((n) => n + 1);

      if (state.needsRotation) {
        await rotate();
        return;
      }

      const todo = state.missing.filter(
        (m) => !(m.userId === userId && m.deviceId === device.deviceId) && cachedKey(userId, conversationId, m.keyVersion)
      );
      const sig = todo.map((m) => `${m.userId}|${m.deviceId}|${m.keyVersion}`).join(',');
      if (!todo.length || sig === sharedSig.current) return;
      sharedSig.current = sig;
      const byDevice = new Map(state.devices.map((d) => [`${d.userId}|${d.deviceId}`, d.publicKey]));
      const wraps = todo
        .map((m) => {
          const pub = byDevice.get(`${m.userId}|${m.deviceId}`);
          const key = cachedKey(userId, conversationId, m.keyVersion);
          if (!pub || !key) return null;
          return {
            keyVersion: m.keyVersion,
            userId: m.userId,
            deviceId: m.deviceId,
            ...wrapFor(key, pub, { conversationId, keyVersion: m.keyVersion, userId: m.userId, deviceId: m.deviceId }),
          };
        })
        .filter((w): w is NonNullable<typeof w> => !!w);
      if (!cancelled && wraps.length) {
        shareKeys({ sessionToken: token, conversationId: conversationId as any, wraps: wraps as any }).catch(() => {
          sharedSig.current = '';
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, device, conversationId, userId, token, rotate, shareKeys]);

  /** Encrypts and sends. Makes a new key first if this phone has none yet. */
  const send = useCallback(
    async (text: string) => {
      if (!conversationId || !token || !userId || !state) throw new Error('not ready');
      let version = state.keyVersion;
      let key = version > 0 && !state.needsRotation ? cachedKey(userId, conversationId, version) : null;
      if (!key) {
        if (!(await rotate())) throw new Error('KEY_CHANGED');
        version = state.keyVersion + 1;
        key = cachedKey(userId, conversationId, version);
        if (!key) throw new Error('KEY_CHANGED');
      }
      const box = encryptMessage(key, text, { conversationId, keyVersion: version, senderId: userId });
      await sendMutation({ sessionToken: token, conversationId: conversationId as any, keyVersion: version, ...box });
    },
    [conversationId, token, userId, state, rotate, sendMutation]
  );

  /** Decrypts one message. Null when this phone doesn't have its key (yet). */
  const decrypt = useCallback(
    (m: { keyVersion: number | null; iv: string | null; ciphertext: string | null; senderId: string }): string | null => {
      if (!conversationId || !userId || !m.keyVersion || !m.iv || !m.ciphertext) return null;
      const key = cachedKey(userId, conversationId, m.keyVersion);
      if (!key) return null;
      try {
        return decryptMessage(key, { iv: m.iv, ciphertext: m.ciphertext }, { conversationId, keyVersion: m.keyVersion, senderId: m.senderId });
      } catch {
        return null;
      }
    },
    // keysTick: a new key may open messages that failed before
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, userId, keysTick]
  );

  return { ready: !!state, devices: state?.devices ?? [], keysTick, send, decrypt };
}
