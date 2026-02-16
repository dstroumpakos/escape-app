import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Create a notification ───
export const create = mutation({
  args: {
    userId: v.id("users"),
    type: v.union(
      v.literal("booking"),
      v.literal("cancelled"),
      v.literal("reminder"),
      v.literal("promo"),
      v.literal("system"),
      v.literal("slot_available")
    ),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      userId: args.userId,
      type: args.type,
      title: args.title,
      message: args.message,
      read: false,
      createdAt: Date.now(),
      data: args.data,
    });
  },
});

// ─── Get all notifications for a user (newest first) ───
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ─── Mark one notification as read ───
export const markAsRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { read: true });
  },
});

// ─── Mark all notifications as read for a user ───
export const markAllRead = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", args.userId).eq("read", false))
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});

// ─── Get unread count ───
export const unreadCount = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", args.userId).eq("read", false))
      .collect();
    return unread.length;
  },
});
