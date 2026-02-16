import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── Toggle alert for a specific slot ──
// If the user already has an alert for this slot, remove it; otherwise create one.
export const toggle = mutation({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("slotAlerts")
      .withIndex("by_user_slot", (q) =>
        q
          .eq("userId", args.userId)
          .eq("roomId", args.roomId)
          .eq("date", args.date)
          .eq("time", args.time)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { subscribed: false };
    }

    await ctx.db.insert("slotAlerts", {
      userId: args.userId,
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      createdAt: Date.now(),
      notified: false,
    });
    return { subscribed: true };
  },
});

// ── Get all alerts the current user has for a given room + date ──
export const getByUserRoomDate = query({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("slotAlerts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    // Filter to this room + date
    return all.filter(
      (a) => a.roomId === args.roomId && a.date === args.date && !a.notified
    );
  },
});

// ── Get pending (un-notified) alerts for a specific slot ──
// Called when a slot becomes available again to find who to notify.
export const getPendingForSlot = query({
  args: {
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
  },
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("slotAlerts")
      .withIndex("by_slot", (q) =>
        q
          .eq("roomId", args.roomId)
          .eq("date", args.date)
          .eq("time", args.time)
      )
      .collect();
    return alerts.filter((a) => !a.notified);
  },
});

// ── Mark alerts as notified ──
export const markNotified = mutation({
  args: { ids: v.array(v.id("slotAlerts")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.patch(id, { notified: true });
    }
  },
});

// ── Get all active (un-notified) alerts for a user ──
// Used by the notification watcher to detect when watched slots become available.
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("slotAlerts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return all.filter((a) => !a.notified);
  },
});

// ── Get recently notified alerts for a user (notified = true) ──
// The client uses this to detect newly-notified alerts and fire device notifications.
export const getNotifiedByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("slotAlerts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return all.filter((a) => a.notified);
  },
});

// ── Delete old notified alerts (cleanup) ──
export const deleteNotified = mutation({
  args: { ids: v.array(v.id("slotAlerts")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      await ctx.db.delete(id);
    }
  },
});
