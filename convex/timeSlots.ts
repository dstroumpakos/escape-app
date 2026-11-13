import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { sessionTokenV, optionalCompany, requireRoomOf } from "./companySession";

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
  args: { id: v.id("timeSlots"), available: v.boolean(), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const caller = await optionalCompany(ctx, args.sessionToken, "timeSlots:setAvailability");
    const slot = await ctx.db.get(args.id);
    if (!slot) return;
    await requireRoomOf(ctx, caller, slot.roomId);
    await ctx.db.patch(args.id, { available: args.available });
  },
});
