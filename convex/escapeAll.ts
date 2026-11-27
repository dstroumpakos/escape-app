import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAdminSession } from "./adminSession";
import { cleanExternalUrl } from "./externalLinks";

/**
 * EscapeAll ratings on our room pages ("4.9 from 449 reviews on EscapeAll").
 *
 * The team looks the room up on EscapeAll and types its score and number of
 * reviews in the admin, with the room's EscapeAll page as the link. Only those
 * two numbers are kept, never review texts. EscapeAll blocks automated
 * requests (Cloudflare), so there is no automatic fetch: the admin shows the
 * date each rating was set, to spot old ones.
 */

const SOURCE = "EscapeAll";

/** An EscapeAll room page link, without the date/slot query. "" clears. Throws on other sites. */
export function cleanEscapeAllUrl(raw: string): string {
  const s = cleanExternalUrl(raw);
  if (!s) return "";
  const u = new URL(s);
  if (!/(^|\.)escapeall\.[a-z]{2,}$/i.test(u.hostname) || !/\/EscapeRoom\/Details\/[^/]+/i.test(u.pathname)) {
    throw new ConvexError("Paste the room's page on EscapeAll, like https://www.escapeall.gr/el/EscapeRoom/Details/...");
  }
  return `https://${u.hostname}${u.pathname.replace(/\/+$/, "")}`;
}

/** Admin: set a room's EscapeAll rating, or clear it with url "". */
export const adminSetRoomRating = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("rooms"),
    url: v.string(),
    rating: v.optional(v.number()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new ConvexError("Room not found");
    const url = cleanEscapeAllUrl(args.url);
    if (!url) {
      if (room.externalRating?.source === SOURCE) await ctx.db.patch(args.roomId, { externalRating: undefined });
      return null;
    }
    const { rating, count } = args;
    if (rating === undefined || !(rating >= 0 && rating <= 5)) throw new ConvexError("The EscapeAll rating must be between 0 and 5");
    if (count === undefined || !Number.isInteger(count) || count < 0) throw new ConvexError("The number of EscapeAll reviews must be a whole number");
    await ctx.db.patch(args.roomId, {
      externalRating: { source: SOURCE, rating: Math.round(rating * 10) / 10, count, url, updatedAt: Date.now() },
    });
    return { rating, count };
  },
});
