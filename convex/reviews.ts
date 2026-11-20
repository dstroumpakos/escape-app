import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { checkLengths } from "./validation";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { rateLimit, HOUR } from "./rateLimit";
import { avatarUrl } from "./avatars";

/**
 * Room reviews, only from players who really played the room: they have the
 * room's stamp (the team QR the company shows after the game, passport.ts),
 * or a completed UNLOCKED booking (only when bookings are switched on).
 * One review per player per room.
 */

// ─── Get reviews for a room (newest first) ───
export const getByRoom = query({
  args: {
    roomId: v.id("rooms"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(Math.min(args.limit || 50, 100));

    // Attach user info
    const enriched = await Promise.all(
      reviews.map(async (r) => {
        const user = await ctx.db.get(r.userId);
        return {
          ...r,
          user: user
            ? { name: user.name, avatar: await avatarUrl(ctx, user) }
            : { name: "Unknown", avatar: "" },
        };
      })
    );

    return enriched;
  },
});

// ─── Get average rating for a room ───
export const getRoomStats = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    if (reviews.length === 0) return { average: 0, count: 0 };

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return {
      average: Math.round((sum / reviews.length) * 10) / 10,
      count: reviews.length,
    };
  },
});

// ─── Check if user already reviewed a booking ───
export const getUserReviewForBooking = query({
  args: {
    sessionToken: v.string(),
    bookingId: v.id("bookings"),
  },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken);
    if (!user) return null;
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();

    return existing && existing.userId === user._id ? existing : null;
  },
});

async function hasReviewed(ctx: QueryCtx, userId: Id<"users">, roomId: Id<"rooms">) {
  const r = await ctx.db
    .query("reviews")
    .withIndex("by_user_room", (q) => q.eq("userId", userId).eq("roomId", roomId))
    .first();
  return !!r;
}

async function hasStamp(ctx: QueryCtx, userId: Id<"users">, roomId: Id<"rooms">) {
  const s = await ctx.db
    .query("stamps")
    .withIndex("by_user_room", (q) => q.eq("userId", userId).eq("roomId", roomId))
    .first();
  return !!s;
}

async function completedBookingFor(ctx: QueryCtx, userId: Id<"users">, roomId: Id<"rooms">) {
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return bookings.find((b) => b.roomId === roomId && b.status === "completed") ?? null;
}

// ─── Can the player review this room? ───
// reason: "login" (logged out), "reviewed" (already did), "need_stamp" (hasn't played it)
export const canReview = query({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!user) return { canReview: false, bookingId: null, reason: "login" as const };
    if (await hasReviewed(ctx, user._id, args.roomId)) {
      return { canReview: false, bookingId: null, reason: "reviewed" as const };
    }
    if (await hasStamp(ctx, user._id, args.roomId)) {
      return { canReview: true, bookingId: null, reason: null };
    }
    const booking = await completedBookingFor(ctx, user._id, args.roomId);
    if (booking) {
      const used = await ctx.db
        .query("reviews")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .first();
      if (!used) return { canReview: true, bookingId: booking._id, reason: null };
    }
    return { canReview: false, bookingId: null, reason: "need_stamp" as const };
  },
});

// ─── Submit a review ───
export const submit = mutation({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    roomId: v.id("rooms"),
    bookingId: v.optional(v.id("bookings")),
    rating: v.number(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    checkLengths([["Review", args.text, 2000]]);
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    await rateLimit(ctx, `review:${user._id}`, 20, HOUR);
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }
    if (await hasReviewed(ctx, user._id, args.roomId)) {
      throw new Error("You already reviewed this room");
    }

    let bookingId: Id<"bookings"> | undefined;
    if (await hasStamp(ctx, user._id, args.roomId)) {
      // Played it: the stamp is the proof.
    } else if (args.bookingId) {
      const booking = await ctx.db.get(args.bookingId);
      if (!booking) throw new Error("Booking not found");
      if (booking.userId !== user._id) throw new Error("Not your booking");
      if (booking.roomId !== args.roomId) throw new Error("Booking is for a different room");
      if (booking.status !== "completed") throw new Error("Booking is not completed");
      bookingId = booking._id;
    } else {
      throw new Error("Collect this room's stamp first: scan the QR after your game.");
    }

    await ctx.db.insert("reviews", {
      userId: user._id,
      roomId: args.roomId,
      bookingId,
      rating: args.rating,
      text: args.text?.trim() || undefined,
      createdAt: Date.now(),
    });

    // Update room's aggregated rating and review count
    const room = await ctx.db.get(args.roomId);
    if (room) {
      const allReviews = await ctx.db
        .query("reviews")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect();

      // allReviews already includes the review inserted above.
      const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
      const newCount = allReviews.length;
      const avgRating = Math.round((totalRating / newCount) * 10) / 10;

      await ctx.db.patch(args.roomId, {
        rating: avgRating,
        reviews: newCount,
      });
    }

    return { success: true };
  },
});
