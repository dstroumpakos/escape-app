import { ConvexError, v } from "convex/values";
import { slotFreed } from "./push";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser, optionalUser } from "./userSession";
import { rateLimit, HOUR } from "./rateLimit";

// ═══════════════════════════════════════════════════════════════════════
// Email confirmation (checklist item 14)
// ═══════════════════════════════════════════════════════════════════════
// - New email+password players get emailVerified=false and a link. They can
//   sign in and browse, but can't make "pay on arrival" bookings until they
//   press it. (Card payments don't need it: the payment proves the person.)
// - Widget guest bookings hold the slot as "pending_payment" with
//   awaitingEmailConfirm=true. If the guest doesn't press the link within
//   30 minutes the booking is cancelled and the slot frees up.
// The link opens /verify-email on the site, which asks for a button press
// before confirming (so mail scanners that open links don't confirm).

export const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";
const USER_LINK_TTL_MS = 48 * HOUR;
export const BOOKING_CONFIRM_TTL_MS = 30 * 60 * 1000;

function siteUrl(): string {
  return (process.env.SITE_URL || "https://unlocked.gr").replace(/\/+$/, "");
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

async function issueToken(
  ctx: MutationCtx,
  purpose: "verify_user" | "confirm_booking",
  ref: { userId?: Id<"users">; bookingId?: Id<"bookings"> },
  ttlMs: number
): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  await ctx.db.insert("emailTokens", {
    purpose,
    ...ref,
    tokenHash: await hashToken(token),
    expiresAt: Date.now() + ttlMs,
  });
  return `${siteUrl()}/verify-email?token=${token}`;
}

/** Throws EMAIL_NOT_VERIFIED for players who signed up and haven't confirmed yet. */
export function requireVerifiedEmail(user: Doc<"users">) {
  if (user.emailVerified === false) throw new ConvexError(EMAIL_NOT_VERIFIED);
}

/** Called from users.register: sends the "confirm your email" link. */
export async function sendUserVerification(ctx: MutationCtx, user: Doc<"users">, lang?: string) {
  // Old links stop working once a new one is sent.
  const old = await ctx.db
    .query("emailTokens")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  for (const t of old) await ctx.db.delete(t._id);

  const url = await issueToken(ctx, "verify_user", { userId: user._id }, USER_LINK_TTL_MS);
  await ctx.scheduler.runAfter(0, internal.email.sendConfirmLink, {
    kind: "account",
    to: user.email,
    name: user.name,
    url,
    lang: lang ?? user.language,
  });
}

/** Called from widget.createGuestBooking for a booking that waits for confirmation. */
export async function sendGuestBookingConfirmation(
  ctx: MutationCtx,
  booking: { _id: Id<"bookings">; playerName: string; playerContact: string; date: string; time: string },
  roomTitle: string,
  lang?: string
) {
  const url = await issueToken(ctx, "confirm_booking", { bookingId: booking._id }, BOOKING_CONFIRM_TTL_MS);
  await ctx.scheduler.runAfter(0, internal.email.sendConfirmLink, {
    kind: "booking",
    to: booking.playerContact,
    name: booking.playerName,
    url,
    lang,
    roomTitle,
    date: booking.date,
    time: booking.time,
  });
  await ctx.scheduler.runAfter(BOOKING_CONFIRM_TTL_MS, internal.emailVerify.expireGuestBooking, {
    bookingId: booking._id,
  });
}

/**
 * The /verify-email page calls this when the user presses "Confirm".
 * Returns what was confirmed, or { ok: false } for a used/expired link.
 */
export const confirm = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!args.token || args.token.length > 128) return { ok: false as const };
    const tokenHash = await hashToken(args.token);
    const t = await ctx.db
      .query("emailTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!t || t.expiresAt < Date.now()) return { ok: false as const };
    await ctx.db.delete(t._id);

    if (t.purpose === "verify_user" && t.userId) {
      const user = await ctx.db.get(t.userId);
      if (!user) return { ok: false as const };
      if (user.emailVerified === false) await ctx.db.patch(user._id, { emailVerified: true });
      return { ok: true as const, kind: "account" as const };
    }

    if (t.purpose === "confirm_booking" && t.bookingId) {
      const booking = await ctx.db.get(t.bookingId);
      if (!booking || booking.status !== "pending_payment" || !booking.awaitingEmailConfirm) {
        return { ok: false as const };
      }
      await ctx.db.patch(booking._id, { status: "upcoming", awaitingEmailConfirm: undefined });
      // Now that it's real, send the usual booking emails to guest and company.
      await ctx.scheduler.runAfter(0, internal.widget.sendGuestBookingEmails, { bookingId: booking._id });
      return { ok: true as const, kind: "booking" as const, bookingCode: booking.bookingCode };
    }
    return { ok: false as const };
  },
});

/** "Send the link again", for a logged-in player who hasn't confirmed. */
export const resend = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    if (user.emailVerified !== false) return { alreadyVerified: true };
    await rateLimit(ctx, `verifyResend:${user._id}`, 3, HOUR);
    await sendUserVerification(ctx, user);
    return { alreadyVerified: false };
  },
});

/** For clients: does the logged-in player still need to confirm? */
export const status = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken);
    return { needsVerification: user?.emailVerified === false };
  },
});

/** Runs 30 minutes after a widget booking: cancel it if still unconfirmed. */
export const expireGuestBooking = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.status !== "pending_payment" || !booking.awaitingEmailConfirm) return;
    await ctx.db.patch(booking._id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledBy: "system",
      awaitingEmailConfirm: undefined,
    });
    await slotFreed(ctx, booking.roomId, booking.date, booking.time);
  },
});
