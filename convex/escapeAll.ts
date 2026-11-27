import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdminSession } from "./adminSession";

/**
 * EscapeAll ratings on our room pages ("4.9 from 449 reviews on EscapeAll").
 *
 * The team looks the room up on EscapeAll and types its score and number of
 * reviews in the admin. Only those two numbers are kept: no review texts, and
 * no link to EscapeAll (the team doesn't want one). EscapeAll blocks automated
 * requests (Cloudflare), so nothing is fetched; the admin shows the date each
 * rating was set, to spot old ones.
 */

const SOURCE = "EscapeAll";

/** Admin: set a room's EscapeAll rating, or clear it by leaving both numbers out. */
export const adminSetRoomRating = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("rooms"),
    rating: v.optional(v.number()),
    count: v.optional(v.number()),
    // Ignored: older admin pages still send it. No link to EscapeAll is stored.
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new ConvexError("Room not found");
    const { rating, count } = args;
    if (rating === undefined && count === undefined) {
      if (room.externalRating?.source === SOURCE) await ctx.db.patch(args.roomId, { externalRating: undefined });
      return null;
    }
    if (rating === undefined || !(rating >= 0 && rating <= 5)) throw new ConvexError("The EscapeAll rating must be between 0 and 5");
    if (count === undefined || !Number.isInteger(count) || count < 0) throw new ConvexError("The number of EscapeAll reviews must be a whole number");
    await ctx.db.patch(args.roomId, {
      externalRating: { source: SOURCE, rating: Math.round(rating * 10) / 10, count, updatedAt: Date.now() },
    });
    return { rating, count };
  },
});
