import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdminSession } from "./adminSession";

// Paid promotion of rooms. The company pays the UNLOCKED team (outside the
// site); the team then turns the promotion on in admin > Promo with an end
// date. While `promoUntil` is in the future the room comes first on the
// homepage (web hero row, app Home via rooms.featured). Players see no
// label. Only admins can set it: companies never can.

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;

/** True while the room's paid promotion runs. */
export function isPromoted(room: { promoUntil?: number }, now = Date.now()) {
  return typeof room.promoUntil === "number" && room.promoUntil > now;
}

/** Every room (not photos-only) with its company and promotion, promoted first. */
export const adminList = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const now = Date.now();
    const rooms = (await ctx.db.query("rooms").collect()).filter((r) => !r.photosOnly);
    const companyIds = Array.from(new Set(rooms.map((r) => r.companyId).filter(Boolean)));
    const companies = await Promise.all(companyIds.map((id) => ctx.db.get(id!)));
    const names = new Map(companies.filter(Boolean).map((c) => [c!._id as string, c!.name]));
    return rooms
      .map((r) => ({
        _id: r._id,
        title: r.title,
        image: r.image,
        location: r.location,
        companyName: r.companyId ? names.get(r.companyId as string) ?? "" : "",
        isActive: r.isActive !== false,
        promoUntil: r.promoUntil ?? null,
        promoSince: r.promoSince ?? null,
        promoNote: r.promoNote ?? "",
        active: isPromoted(r, now),
      }))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.active && b.active) return (a.promoUntil ?? 0) - (b.promoUntil ?? 0);
        return a.title.localeCompare(b.title);
      });
  },
});

/** Start, extend or change a room's promotion: it runs until `until` (ms). */
export const adminSet = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("rooms"),
    until: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new ConvexError("Room not found");
    const now = Date.now();
    if (!Number.isFinite(args.until) || args.until <= now) throw new ConvexError("The end date must be in the future");
    if (args.until > now + MAX_DAYS * DAY) throw new ConvexError(`Up to ${MAX_DAYS} days at a time`);
    const note = (args.note ?? "").trim().slice(0, 300);
    await ctx.db.patch(args.roomId, {
      promoUntil: args.until,
      // A running promotion keeps its start; a new one starts now
      promoSince: isPromoted(room, now) ? room.promoSince ?? now : now,
      promoNote: note || undefined,
    });
  },
});

/** End a room's promotion now. */
export const adminStop = mutation({
  args: { sessionToken: v.string(), roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new ConvexError("Room not found");
    await ctx.db.patch(args.roomId, { promoUntil: undefined, promoSince: undefined });
  },
});

/** Terminal only (tests, support): npx convex run promo:setInternal '{"roomId":"...","days":7}'. days 0 stops it. */
export const setInternal = internalMutation({
  args: { roomId: v.id("rooms"), days: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.days <= 0) return await ctx.db.patch(args.roomId, { promoUntil: undefined, promoSince: undefined });
    await ctx.db.patch(args.roomId, { promoUntil: now + Math.min(args.days, MAX_DAYS) * DAY, promoSince: now });
  },
});
