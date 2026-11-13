import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════════
// Business-portal sessions
// ═══════════════════════════════════════════════════════════════════════
// loginCompany / register* issue a random token. The client keeps the raw
// token and sends it as `sessionToken` on every company call; we only store
// its SHA-256. Every company-scoped function resolves the calling company
// from the token instead of trusting a `companyId` argument.
//
// Transition: older app builds don't send a token. Until the env var
// COMPANY_AUTH_ENFORCE is "1", calls without a token still work exactly as
// before but log a "[company-auth:legacy]" warning so we can see who still
// uses them. Once those logs stop, set COMPANY_AUTH_ENFORCE=1 on prod.

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // sliding, see resumeSession
/** Clients match on this exact text to send the user back to the login page. */
export const SESSION_EXPIRED = "Your session has expired. Please log in again.";
export const ACCESS_DENIED = "Access denied";

/** Add to the args of every company-scoped function. */
export const sessionTokenV = v.optional(v.string());

type Ctx = QueryCtx | MutationCtx;

function enforced(): boolean {
  const flag = process.env.COMPANY_AUTH_ENFORCE;
  return flag === "1" || flag === "true";
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

/** Creates a session for a company and returns the raw token (shown to the client once). */
export async function createCompanySession(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  client?: string
): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  // Housekeeping: drop this company's expired sessions.
  const old = await ctx.db
    .query("companySessions")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  for (const s of old) if (s.expiresAt < now) await ctx.db.delete(s._id);

  await ctx.db.insert("companySessions", {
    companyId,
    tokenHash: await hashToken(token),
    client: client === "app" ? "app" : "web",
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  return token;
}

/** The live session row for a token, or null if missing/expired. */
export async function findSession(ctx: Ctx, token: string): Promise<Doc<"companySessions"> | null> {
  if (!token || token.length > 128) return null;
  const tokenHash = await hashToken(token);
  const row = await ctx.db
    .query("companySessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!row || row.expiresAt < Date.now()) return null;
  return row;
}

export async function deleteSession(ctx: MutationCtx, token: string) {
  const row = await findSession(ctx, token);
  if (row) await ctx.db.delete(row._id);
}

function legacy(fn: string, detail: string) {
  console.warn(`[company-auth:legacy] ${fn} called without a session token (${detail})`);
}

/**
 * Resolves the calling company. Use in every function that used to take a
 * trusted `companyId`: pass both the old `companyId` arg and `sessionToken`.
 * With a token, the token decides and `companyId` must match it.
 */
export async function requireCompany(
  ctx: Ctx,
  args: { sessionToken?: string; companyId?: Id<"companies"> },
  fn: string
): Promise<Doc<"companies">> {
  if (args.sessionToken) {
    const session = await findSession(ctx, args.sessionToken);
    if (!session) throw new ConvexError(SESSION_EXPIRED);
    if (args.companyId && args.companyId !== session.companyId) throw new ConvexError(ACCESS_DENIED);
    const company = await ctx.db.get(session.companyId);
    if (!company) throw new ConvexError(SESSION_EXPIRED);
    return company;
  }
  if (enforced()) throw new ConvexError(SESSION_EXPIRED);
  if (!args.companyId) throw new ConvexError(ACCESS_DENIED);
  legacy(fn, `companyId=${args.companyId}`);
  const company = await ctx.db.get(args.companyId);
  if (!company) throw new ConvexError("Company not found");
  return company;
}

/**
 * For functions that never took a companyId (they act on a room, booking or
 * photo id). Returns the company, or null for a legacy call without a token,
 * in which case the caller skips its ownership check, as before.
 */
export async function optionalCompany(
  ctx: Ctx,
  sessionToken: string | undefined,
  fn: string
): Promise<Doc<"companies"> | null> {
  if (sessionToken) return await requireCompany(ctx, { sessionToken }, fn);
  if (enforced()) throw new ConvexError(SESSION_EXPIRED);
  legacy(fn, "no companyId");
  return null;
}

/** Room must exist and, when we know the company, belong to it. */
export async function requireRoomOf(
  ctx: Ctx,
  company: Doc<"companies"> | null,
  roomId: Id<"rooms">
): Promise<Doc<"rooms">> {
  const room = await ctx.db.get(roomId);
  if (!room) throw new ConvexError("Room not found");
  if (company && room.companyId !== company._id) throw new ConvexError(ACCESS_DENIED);
  return room;
}

/** Booking must exist and, when we know the company, belong to it (directly or via its room). */
export async function requireBookingOf(
  ctx: Ctx,
  company: Doc<"companies"> | null,
  bookingId: Id<"bookings">
): Promise<Doc<"bookings">> {
  const booking = await ctx.db.get(bookingId);
  if (!booking) throw new ConvexError("Booking not found");
  if (!company || booking.companyId === company._id) return booking;
  const room = await ctx.db.get(booking.roomId);
  if (!room || room.companyId !== company._id) throw new ConvexError(ACCESS_DENIED);
  return booking;
}

/**
 * Actions can't read the database, so they resolve the company through this.
 * Returns the company id the action may act for.
 */
export const resolveForAction = internalQuery({
  args: { sessionToken: sessionTokenV, companyId: v.optional(v.id("companies")), fn: v.string() },
  handler: async (ctx, args): Promise<Id<"companies">> => {
    const company = await requireCompany(ctx, args, args.fn);
    return company._id;
  },
});
