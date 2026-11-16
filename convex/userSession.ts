import { ConvexError, v } from "convex/values";
import { internalQuery, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════════
// Player sessions
// ═══════════════════════════════════════════════════════════════════════
// login / register / loginWithApple issue a random token. The client keeps the
// raw token and sends it as `sessionToken`; we only store its SHA-256. Player
// functions resolve the calling user from the token (requireUser) instead of
// trusting a `userId` argument.

export const USER_SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days, fixed
/** Clients match on this exact text to send the user back to the login screen. */
export const USER_SESSION_EXPIRED = "Your session has expired. Please log in again.";

type Ctx = QueryCtx | MutationCtx;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

/** Creates a session for a player and returns the raw token (shown to the client once). */
export async function createUserSession(
  ctx: MutationCtx,
  userId: Id<"users">,
  client?: string
): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  // Housekeeping: drop this user's expired sessions.
  const old = await ctx.db
    .query("userSessions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const s of old) if (s.expiresAt < now) await ctx.db.delete(s._id);

  await ctx.db.insert("userSessions", {
    userId,
    tokenHash: await hashToken(token),
    client: client === "app" ? "app" : "web",
    createdAt: now,
    expiresAt: now + USER_SESSION_TTL_MS,
  });
  return token;
}

/** The live session row for a token, or null if missing/expired. */
export async function findUserSession(ctx: Ctx, token: string): Promise<Doc<"userSessions"> | null> {
  if (!token || token.length > 128) return null;
  const tokenHash = await hashToken(token);
  const row = await ctx.db
    .query("userSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!row || row.expiresAt < Date.now()) return null;
  return row;
}

// ── Old app builds ──────────────────────────────────────────────────────
// App builds up to 1.1.0 send the player's userId instead of a session token.
// Until PLAYER_AUTH_ENFORCE is "1", a call with no token but a userId still
// works exactly as before and logs "[player-auth:legacy]", so we can see when
// the old builds are gone. Then set PLAYER_AUTH_ENFORCE=1 on prod. A call that
// sends a token never falls back, even if the token has expired.

/** Validator for the userId that old app builds send (each function lists it under the name the old build used). */
export const legacyUserIdV = v.optional(v.id("users"));

export function playerAuthEnforced(): boolean {
  return process.env.PLAYER_AUTH_ENFORCE === "1";
}

async function legacyUser(ctx: Ctx, legacyUserId: Id<"users"> | undefined): Promise<Doc<"users"> | null> {
  if (!legacyUserId || playerAuthEnforced()) return null;
  console.warn(`[player-auth:legacy] called without a session token (userId=${legacyUserId})`);
  return await ctx.db.get(legacyUserId);
}

/** Resolves the calling player from a session token (or, for old app builds, their userId), or throws "session expired". */
export async function requireUser(
  ctx: Ctx,
  token: string | undefined,
  legacyUserId?: Id<"users">
): Promise<Doc<"users">> {
  if (!token) {
    const legacy = await legacyUser(ctx, legacyUserId);
    if (legacy) return legacy;
    throw new ConvexError(USER_SESSION_EXPIRED);
  }
  const session = await findUserSession(ctx, token);
  if (!session) throw new ConvexError(USER_SESSION_EXPIRED);
  const user = await ctx.db.get(session.userId);
  if (!user) throw new ConvexError(USER_SESSION_EXPIRED);
  return user;
}

/** Like requireUser but returns null instead of throwing: for queries, so an expired session shows a logged-out view instead of crashing the page. */
export async function optionalUser(
  ctx: Ctx,
  token: string | undefined,
  legacyUserId?: Id<"users">
): Promise<Doc<"users"> | null> {
  if (!token) return await legacyUser(ctx, legacyUserId);
  const session = await findUserSession(ctx, token);
  if (!session) return null;
  return await ctx.db.get(session.userId);
}

/** For actions (which cannot read the database): resolves the caller from a session token. */
export const verify = internalQuery({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    return { userId: user._id };
  },
});

/** Ends the session for this token. Never fails: an unknown token is already logged out. */
export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const row = await findUserSession(ctx, args.sessionToken);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
