/**
 * Password hashing utilities for Convex backend.
 *
 * Uses Web Crypto API (available in Convex runtime) with PBKDF2
 * for secure password hashing. No external dependencies needed.
 */

/** Hash a plaintext password using PBKDF2 with a random salt */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hashArray = new Uint8Array(derivedBits);
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Store as "salt:hash" so we can verify later
  return `${saltHex}:${hashHex}`;
}

/** Verify a plaintext password against a stored hash */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  // Support legacy plaintext passwords (no colon separator)
  if (!storedHash.includes(":")) {
    // Legacy plaintext comparison — will be upgraded on next login
    return password === storedHash;
  }

  const [saltHex, hashHex] = storedHash.split(":");
  const encoder = new TextEncoder();

  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const computedHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHex === hashHex;
}
