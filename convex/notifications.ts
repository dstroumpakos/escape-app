import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";

// ─── Create a notification ───
export const create = mutation({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    type: v.union(
      v.literal("booking"),
      v.literal("cancelled"),
      v.literal("reminder"),
      v.literal("promo"),
      v.literal("system"),
      v.literal("slot_available"),
      v.literal("new_room"),
      v.literal("photos_ready"),
      v.literal("friend_request"),
      v.literal("friend_accepted"),
      v.literal("booking_invite")
    ),
    title: v.string(),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // A notification can only be created for yourself.
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    if (args.title.length > 200 || args.message.length > 1000) {
      throw new Error("Notification text is too long");
    }
    return await ctx.db.insert("notifications", {
      userId: user._id,
      type: args.type,
      title: args.title,
      message: args.message,
      read: false,
      createdAt: Date.now(),
      data: args.data,
    });
  },
});

// ─── Get all notifications for a user (newest first, limited) ───
export const getByUser = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!user) return [];
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);
  },
});

// ─── Mark one notification as read ───
export const markAsRead = mutation({
  args: { id: v.id("notifications"), sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    const n = await ctx.db.get(args.id);
    if (!n || n.userId !== user._id) return;
    await ctx.db.patch(args.id, { read: true });
  },
});

// ─── Mark all notifications as read for a user ───
export const markAllRead = mutation({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
  },
});

// ─── Get unread count ───
export const unreadCount = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!user) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();
    return unread.length;
  },
});
