import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { checkLengths } from "./validation";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { avatarUrl } from "./avatars";

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
      .take(args.limit || 50);

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

// ─── Check if user can review a room (has completed booking, hasn't reviewed it) ───
export const canReview = query({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!user) return { canReview: false, bookingId: null };
    // Get completed bookings for this room by this user
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const completedForRoom = bookings.filter(
      (b) => b.roomId === args.roomId && b.status === "completed"
    );

    if (completedForRoom.length === 0) {
      return { canReview: false, bookingId: null };
    }

    // Check if any of these bookings are unreviewed
    for (const booking of completedForRoom) {
      const existingReview = await ctx.db
        .query("reviews")
        .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
        .first();

      if (!existingReview) {
        return { canReview: true, bookingId: booking._id };
      }
    }

    return { canReview: false, bookingId: null };
  },
});

// ─── Submit a review ───
export const submit = mutation({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    roomId: v.id("rooms"),
    bookingId: v.id("bookings"),
    rating: v.number(),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    checkLengths([["Review", args.text, 2000]]);
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    // Validate rating
    if (args.rating < 1 || args.rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    // Verify the booking exists and belongs to the user
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.userId !== user._id) throw new Error("Not your booking");
    if (booking.roomId !== args.roomId) throw new Error("Booking is for a different room");
    if (booking.status !== "completed") throw new Error("Booking is not completed");

    // Check if already reviewed
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();
    if (existing) throw new Error("You already reviewed this booking");

    // Insert review
    await ctx.db.insert("reviews", {
      userId: user._id,
      roomId: args.roomId,
      bookingId: args.bookingId,
      rating: args.rating,
      text: args.text,
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
