import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    // Prevent double-booking: check for existing active booking at this slot
    const existing = await ctx.db
      .query("bookings")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date)
      )
      .collect();
    const conflict = existing.find(
      (b) => b.time === args.time && b.status !== "cancelled"
    );
    if (conflict) throw new Error("This time slot is no longer available");

    // Look up room to set companyId for tracking
    const room = await ctx.db.get(args.roomId);

    const bookingCode = `UNL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const id = await ctx.db.insert("bookings", {
      ...args,
      status: "upcoming",
      bookingCode,
      createdAt: Date.now(),
      source: "unlocked",
      companyId: room?.companyId,
      paymentStatus: "paid",
    });
    return { id, bookingCode };
  },
});

export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Enrich with room data
    const enriched = await Promise.all(
      bookings.map(async (b) => {
        const room = await ctx.db.get(b.roomId);
        return { ...b, room };
      })
    );
    return enriched;
  },
});

export const upcoming = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "upcoming")
      )
      .collect();

    const enriched = await Promise.all(
      bookings.map(async (b) => {
        const room = await ctx.db.get(b.roomId);
        return { ...b, room };
      })
    );
    return enriched;
  },
});

export const cancel = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "cancelled" });
  },
});

export const complete = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "completed" });
  },
});
