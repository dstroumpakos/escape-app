import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { sessionTokenV, requireCompany } from "./companySession";
import {
  LATE_CANCEL_FLAG_THRESHOLD,
  LATE_CANCEL_LOOKBACK_DAYS,
  LATE_CANCEL_LOOKBACK_MS,
  type CancelReason,
} from "./cancelRules";

// ═══════════════════════════════════════════════════════════════════════
// Late-cancellation flags (rules in cancelRules.ts)
// ═══════════════════════════════════════════════════════════════════════
// Businesses see how many late cancellations a player has and the reasons,
// never which business or room they were at. Players see the same count
// about themselves, plus when the oldest one stops counting.

type LateCancelSummary = {
  count: number;
  reasons: Partial<Record<CancelReason | "none", number>>;
  /** When the oldest counted late cancellation drops out of the lookback period. */
  oldestExpiresAt: number | null;
};

async function loadLateCancels(ctx: QueryCtx, userId: Id<"users">, now: number): Promise<LateCancelSummary> {
  const since = now - LATE_CANCEL_LOOKBACK_MS;
  const cancelled = await ctx.db
    .query("bookings")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "cancelled"))
    .collect();
  const counted = cancelled.filter((b) => b.lateCancel && (b.cancelledAt ?? 0) >= since);
  const reasons: LateCancelSummary["reasons"] = {};
  for (const b of counted) {
    const key = b.cancelReason ?? "none";
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  const oldest = counted.reduce<number | null>(
    (min, b) => (min === null || b.cancelledAt! < min ? b.cancelledAt! : min),
    null
  );
  return {
    count: counted.length,
    reasons,
    oldestExpiresAt: oldest === null ? null : oldest + LATE_CANCEL_LOOKBACK_MS,
  };
}

/**
 * Late-cancellation flags for a business's upcoming bookings. Only bookings of
 * the calling business, only players at or over the flag threshold.
 */
export const flagsForBookings = query({
  args: {
    sessionToken: sessionTokenV,
    companyId: v.optional(v.id("companies")),
    bookingIds: v.array(v.id("bookings")),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "cancellations:flagsForBookings");
    const now = Date.now();
    const byUser = new Map<string, LateCancelSummary>();
    const roomOwner = new Map<string, string | undefined>();
    const out: { bookingId: Id<"bookings">; count: number; reasons: LateCancelSummary["reasons"] }[] = [];

    for (const bookingId of [...new Set(args.bookingIds)].slice(0, 300)) {
      const booking = await ctx.db.get(bookingId);
      if (!booking?.userId) continue;
      if (booking.status !== "upcoming" && booking.status !== "pending_payment") continue;
      if (booking.companyId !== company._id) {
        const roomKey = String(booking.roomId);
        if (!roomOwner.has(roomKey)) {
          const room = await ctx.db.get(booking.roomId);
          roomOwner.set(roomKey, room?.companyId ? String(room.companyId) : undefined);
        }
        if (roomOwner.get(roomKey) !== String(company._id)) continue;
      }
      const key = String(booking.userId);
      if (!byUser.has(key)) byUser.set(key, await loadLateCancels(ctx, booking.userId, now));
      const summary = byUser.get(key)!;
      if (summary.count < LATE_CANCEL_FLAG_THRESHOLD) continue;
      out.push({ bookingId, count: summary.count, reasons: summary.reasons });
    }
    return out;
  },
});

/** The player's own late cancellations: how many count and whether they're flagged. */
export const myLateCancels = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const summary = await loadLateCancels(ctx, args.userId, Date.now());
    return {
      count: summary.count,
      flagged: summary.count >= LATE_CANCEL_FLAG_THRESHOLD,
      threshold: LATE_CANCEL_FLAG_THRESHOLD,
      lookbackDays: LATE_CANCEL_LOOKBACK_DAYS,
      oldestExpiresAt: summary.oldestExpiresAt,
    };
  },
});
