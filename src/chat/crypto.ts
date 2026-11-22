/**
 * End-to-end encryption for chat, byte for byte the same as the website's
 * escape-web src/lib/chatCrypto.ts (server side: convex/messages.ts), so a
 * phone and a browser can read each other's messages.
 *
 * - Each phone has an ECDH P-256 key pair per player. The private key stays in
 *   the iOS Keychain / Android Keystore (see device.ts) and never leaves it.
 * - A conversation key is 32 random bytes used with AES-256-GCM. It is sent to
 *   each member device "wrapped": ECDH(one-off key, device key) → HKDF-SHA256 →
 *   AES-GCM. The server only sees wrapped keys and ciphertext.
 * - Message AAD binds a ciphertext to its conversation, key version and sender.
 *
 * Pure JavaScript (@noble), because React Native has no Web Crypto. Random
 * bytes come from crypto.getRandomValues, which polyfill.ts installs from
 * expo-crypto.
 */
import { p256 } from '@noble/curves/p256';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { gcm } from '@noble/ciphers/aes';

export interface WrappedKey {
  ephemeralPublicKey: string;
  iv: string;
  wrappedKey: string;
}

/** A device's key pair. `privateKey` is the raw 32-byte scalar. */
export interface DeviceKeys {
  deviceId: string;
  privateKey: Uint8Array;
  publicJwk: string;
}

// ─── bytes ───

export function randomBytes(n: number): Uint8Array {
  const c = (globalThis as any).crypto;
  if (!c?.getRandomValues) throw new Error('No secure random source');
  return c.getRandomValues(new Uint8Array(n));
}

export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      } else c = 0xfffd;
    } else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

export function fromUtf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    let c: number;
    if (x < 0x80) c = x;
    else if (x >= 0xc0 && x < 0xe0 && i < b.length) c = ((x & 31) << 6) | (b[i++] & 63);
    else if (x >= 0xe0 && x < 0xf0 && i + 1 < b.length) {
      c = ((x & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63);
      i += 2;
    } else if (x >= 0xf0 && i + 2 < b.length) {
      c = ((x & 7) << 18) | ((b[i] & 63) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63);
      i += 3;
    } else c = 0xfffd;
    if (c >= 0x10000) {
      c -= 0x10000;
      s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
    } else s += String.fromCharCode(c);
  }
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_INDEX[B64[i]] = i;
B64_INDEX['-'] = 62;
B64_INDEX['_'] = 63;

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return s;
}

/** Standard or URL-safe base64, with or without padding. */
export function fromB64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64_INDEX[ch];
    if (v === undefined) throw new Error('bad base64');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

const toB64Url = (b: Uint8Array) => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function randomId(): string {
  return toB64Url(randomBytes(18));
}

// ─── keys ───

/** Public key as the JWK the website exports: {kty, crv, x, y}. */
function publicJwkOf(privateKey: Uint8Array): string {
  const pub = p256.getPublicKey(privateKey, false); // 0x04 || x || y
  return JSON.stringify({ kty: 'EC', crv: 'P-256', x: toB64Url(pub.slice(1, 33)), y: toB64Url(pub.slice(33, 65)) });
}

function publicPointOf(jwk: string): Uint8Array {
  const j = JSON.parse(jwk);
  if (j?.kty !== 'EC' || j?.crv !== 'P-256') throw new Error('bad key');
  const x = fromB64(j.x);
  const y = fromB64(j.y);
  if (x.length !== 32 || y.length !== 32) throw new Error('bad key');
  const point = new Uint8Array(65);
  point[0] = 4;
  point.set(x, 1);
  point.set(y, 33);
  return point;
}

function newPrivateKey(): Uint8Array {
  // Same as noble's randomPrivateKey, with our random source.
  for (;;) {
    const k = randomBytes(32);
    if (p256.utils.isValidPrivateKey(k)) return k;
  }
}

export function newDeviceKeys(): DeviceKeys {
  const privateKey = newPrivateKey();
  return { deviceId: randomId(), privateKey, publicJwk: publicJwkOf(privateKey) };
}

/** Rebuilds a device from its stored private key. */
export function deviceFromPrivate(deviceId: string, privateKey: Uint8Array): DeviceKeys {
  return { deviceId, privateKey, publicJwk: publicJwkOf(privateKey) };
}

/** Web Crypto's ECDH deriveBits(256): the x coordinate of the shared point. */
function ecdh(privateKey: Uint8Array, publicJwk: string): Uint8Array {
  return p256.getSharedSecret(privateKey, publicPointOf(publicJwk), true).slice(1, 33);
}

function kek(privateKey: Uint8Array, publicJwk: string, info: string): Uint8Array {
  return hkdf(sha256, ecdh(privateKey, publicJwk), new Uint8Array(32), utf8(info), 32);
}

const wrapInfo = (conversationId: string, keyVersion: number, userId: string, deviceId: string) =>
  `unlocked-chat/wrap/v1|${conversationId}|${keyVersion}|${userId}|${deviceId}`;

// ─── conversation keys ───

export function newConversationKey(): Uint8Array {
  return randomBytes(32);
}

/** Encrypts a conversation key for one device. */
export function wrapFor(
  raw: Uint8Array,
  recipientPublicJwk: string,
  ctx: { conversationId: string; keyVersion: number; userId: string; deviceId: string }
): WrappedKey {
  const eph = newPrivateKey();
  const k = kek(eph, recipientPublicJwk, wrapInfo(ctx.conversationId, ctx.keyVersion, ctx.userId, ctx.deviceId));
  const iv = randomBytes(12);
  const ct = gcm(k, iv).encrypt(raw);
  return { ephemeralPublicKey: publicJwkOf(eph), iv: toB64(iv), wrappedKey: toB64(ct) };
}

/** Decrypts a conversation key wrapped for this device. Throws if it doesn't open. */
export function unwrap(
  device: DeviceKeys,
  w: WrappedKey,
  ctx: { conversationId: string; keyVersion: number; userId: string }
): Uint8Array {
  const k = kek(device.privateKey, w.ephemeralPublicKey, wrapInfo(ctx.conversationId, ctx.keyVersion, ctx.userId, device.deviceId));
  const raw = gcm(k, fromB64(w.iv)).decrypt(fromB64(w.wrappedKey));
  if (raw.length !== 32) throw new Error('bad key');
  return raw;
}

// ─── messages ───

const aad = (conversationId: string, keyVersion: number, senderId: string) =>
  utf8(`unlocked-chat/msg/v1|${conversationId}|${keyVersion}|${senderId}`);

export function encryptMessage(
  key: Uint8Array,
  text: string,
  ctx: { conversationId: string; keyVersion: number; senderId: string }
): { iv: string; ciphertext: string } {
  const iv = randomBytes(12);
  const body = utf8(JSON.stringify({ v: 1, text }));
  const ct = gcm(key, iv, aad(ctx.conversationId, ctx.keyVersion, ctx.senderId)).encrypt(body);
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export function decryptMessage(
  key: Uint8Array,
  m: { iv: string; ciphertext: string },
  ctx: { conversationId: string; keyVersion: number; senderId: string }
): string {
  const pt = gcm(key, fromB64(m.iv), aad(ctx.conversationId, ctx.keyVersion, ctx.senderId)).decrypt(fromB64(m.ciphertext));
  const parsed = JSON.parse(fromUtf8(pt));
  return typeof parsed?.text === 'string' ? parsed.text : '';
}

// ─── security code ───

/** Same 30-digit code the website shows for a player's device keys. */
export function securityCode(publicKeys: string[]): string {
  const material = [...publicKeys]
    .map((k) => {
      const j = JSON.parse(k);
      return `${j.x}.${j.y}`;
    })
    .sort()
    .join('|');
  const hash = sha256(utf8(`unlocked-chat/code/v1|${material}`));
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    const n = ((hash[i * 4] << 24) | (hash[i * 4 + 1] << 16) | (hash[i * 4 + 2] << 8) | hash[i * 4 + 3]) >>> 0;
    groups.push(String(n % 100000).padStart(5, '0'));
  }
  return groups.join(' ');
}
