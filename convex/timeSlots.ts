import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByRoomAndDate = query({
  args: { roomId: v.id("rooms"), date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("timeSlots")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date)
      )
      .collect();
  },
});

export const setAvailability = mutation({
  args: { id: v.id("timeSlots"), available: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { available: args.available });
  },
});
