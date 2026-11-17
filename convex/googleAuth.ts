/**
 * Sign in with Google: verify the ID token (a JWT signed by Google) that
 * Google Identity Services hands the website, so a client can't just claim
 * "I am Google user X". Checks the signature against Google's published keys,
 * the issuer, the audience (our OAuth client id) and the expiry.
 *
 * Audience: GOOGLE_CLIENT_IDS (comma-separated) on the Convex deployment.
 * There is no default: unset means Google sign-in is off.
 */

const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const GOOGLE_KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export type GoogleIdentity = {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
};

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseJson(bytes: Uint8Array): any {
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function verifyGoogleIdToken(token: string): Promise<GoogleIdentity> {
  const allowed = (process.env.GOOGLE_CLIENT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) throw new Error("GOOGLE_NOT_CONFIGURED");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("GOOGLE_TOKEN_INVALID");
  const [h, p, sig] = parts;

  let header: any;
  let payload: any;
  try {
    header = parseJson(b64urlToBytes(h));
    payload = parseJson(b64urlToBytes(p));
  } catch {
    throw new Error("GOOGLE_TOKEN_INVALID");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("GOOGLE_TOKEN_INVALID");

  const res = await fetch(GOOGLE_KEYS_URL);
  if (!res.ok) throw new Error("GOOGLE_KEYS_UNAVAILABLE");
  const { keys } = (await res.json()) as { keys: any[] };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("GOOGLE_TOKEN_INVALID");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(sig).buffer as ArrayBuffer,
    new TextEncoder().encode(`${h}.${p}`).buffer as ArrayBuffer
  );
  if (!ok) throw new Error("GOOGLE_TOKEN_INVALID");

  if (!GOOGLE_ISSUERS.includes(payload.iss)) throw new Error("GOOGLE_TOKEN_INVALID");
  if (!allowed.includes(payload.aud)) throw new Error("GOOGLE_TOKEN_INVALID");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) throw new Error("GOOGLE_TOKEN_EXPIRED");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("GOOGLE_TOKEN_INVALID");

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}
