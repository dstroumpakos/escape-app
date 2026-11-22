import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { checkLengths } from "./validation";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { requireAdminSession } from "./adminSession";
import { rateLimit, HOUR } from "./rateLimit";
import { avatarUrl } from "./avatars";

/**
 * Room reviews, only from players who really played the room: they have the
 * room's stamp (the team QR the company shows after the game, passport.ts),
 * or a completed UNLOCKED booking (only when bookings are switched on).
 *
 * Safeguards against fake reviews:
 * - one review per player per room, from a confirmed email address
 * - within REVIEW_WINDOW_MS of the stamp
 * - a burst (more than BURST_MAX reviews for one room in 24 hours) is held
 *   for the UNLOCKED admin ("pending") instead of being published.
 * Reviews without a status are older ones and count as published.
 */

const DAY = 24 * 60 * 60 * 1000;
export const REVIEW_WINDOW_MS = 30 * DAY;
const BURST_MAX = 5;

const isPublished = (r: Doc<"reviews">) => !r.status || r.status === "published";

// ─── Get reviews for a room (newest first, published only) ───
export const getByRoom = query({
  args: {
    roomId: v.id("rooms"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const max = Math.min(Math.max(Math.floor(args.limit || 50), 1), 100);
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(max + 50);
    const reviews = rows.filter(isPublished).slice(0, max);

    return await Promise.all(
      reviews.map(async (r) => {
        const user = await ctx.db.get(r.userId);
        return {
          _id: r._id,
          roomId: r.roomId,
          rating: r.rating,
          text: r.text,
          createdAt: r.createdAt,
          user: user
            ? { name: user.name, avatar: await avatarUrl(ctx, user) }
            : { name: "Unknown", avatar: "" },
        };
      })
    );
  },
});

// ─── Get average rating for a room ───
export const getRoomStats = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const reviews = (
      await ctx.db
        .query("reviews")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect()
    ).filter(isPublished);

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

async function stampFor(ctx: QueryCtx, userId: Id<"users">, roomId: Id<"rooms">) {
  return await ctx.db
    .query("stamps")
    .withIndex("by_user_room", (q) => q.eq("userId", userId).eq("roomId", roomId))
    .first();
}

async function completedBookingFor(ctx: QueryCtx, userId: Id<"users">, roomId: Id<"rooms">) {
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return bookings.find((b) => b.roomId === roomId && b.status === "completed") ?? null;
}

type Reason = "login" | "reviewed" | "need_email" | "too_late" | "need_stamp";

/** Whether the player may review the room, and which booking to attach (booking path only). */
async function eligibility(
  ctx: QueryCtx,
  user: Doc<"users">,
  roomId: Id<"rooms">
): Promise<{ ok: true; bookingId: Id<"bookings"> | null } | { ok: false; reason: Reason }> {
  if (await hasReviewed(ctx, user._id, roomId)) return { ok: false, reason: "reviewed" };
  // false = signed up with email + password and never pressed the link.
  if (user.emailVerified === false) return { ok: false, reason: "need_email" };
  const stamp = await stampFor(ctx, user._id, roomId);
  if (stamp) {
    if (Date.now() - stamp.createdAt > REVIEW_WINDOW_MS) return { ok: false, reason: "too_late" };
    return { ok: true, bookingId: null };
  }
  const booking = await completedBookingFor(ctx, user._id, roomId);
  if (booking) {
    const used = await ctx.db
      .query("reviews")
      .withIndex("by_booking", (q) => q.eq("bookingId", booking._id))
      .first();
    if (!used) return { ok: true, bookingId: booking._id };
  }
  return { ok: false, reason: "need_stamp" };
}

// ─── Can the player review this room? ───
export const canReview = query({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!user) return { canReview: false, bookingId: null, reason: "login" as Reason };
    const e = await eligibility(ctx, user, args.roomId);
    if (!e.ok) return { canReview: false, bookingId: null, reason: e.reason };
    return { canReview: true, bookingId: e.bookingId, reason: null };
  },
});

/** Recompute a room's rating and review count from its published reviews. */
async function refreshRoomRating(ctx: MutationCtx, roomId: Id<"rooms">) {
  const room = await ctx.db.get(roomId);
  if (!room) return;
  const published = (
    await ctx.db
      .query("reviews")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .collect()
  ).filter(isPublished);
  const total = published.reduce((sum, r) => sum + r.rating, 0);
  await ctx.db.patch(roomId, {
    rating: published.length ? Math.round((total / published.length) * 10) / 10 : 0,
    reviews: published.length,
  });
}

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
      throw new ConvexError("Rating must be between 1 and 5");
    }
    const e = await eligibility(ctx, user, args.roomId);
    if (!e.ok) {
      const msg: Record<Reason, string> = {
        login: "Please log in again.",
        reviewed: "You already reviewed this room.",
        need_email: "Confirm your email address first (check your inbox for our link).",
        too_late: "Reviews can be written up to 30 days after the game.",
        need_stamp: "Collect this room's stamp first: scan the QR after your game.",
      };
      throw new ConvexError(msg[e.reason]);
    }
    // A booking passed by the client must be the one we found.
    if (args.bookingId && e.bookingId && args.bookingId !== e.bookingId) {
      throw new ConvexError("Booking is for a different room");
    }

    // Many reviews for one room at once: hold the new ones for the admin.
    const now = Date.now();
    const recent = await ctx.db
      .query("reviews")
      .withIndex("by_room_created", (q) => q.eq("roomId", args.roomId).gte("createdAt", now - DAY))
      .collect();
    const status = recent.length >= BURST_MAX ? ("pending" as const) : ("published" as const);

    await ctx.db.insert("reviews", {
      userId: user._id,
      roomId: args.roomId,
      bookingId: e.bookingId ?? undefined,
      rating: args.rating,
      text: args.text?.trim() || undefined,
      createdAt: now,
      status,
    });
    if (status === "published") await refreshRoomRating(ctx, args.roomId);

    return { success: true, pending: status === "pending" };
  },
});

// ─── Admin: reviews held for checking ───
export const adminPending = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(100);
    return await Promise.all(
      rows.map(async (r) => {
        const [user, room] = await Promise.all([ctx.db.get(r.userId), ctx.db.get(r.roomId)]);
        const company = room?.companyId ? await ctx.db.get(room.companyId) : null;
        const stamp = await stampFor(ctx, r.userId, r.roomId);
        return {
          _id: r._id,
          rating: r.rating,
          text: r.text ?? "",
          createdAt: r.createdAt,
          userName: user?.name ?? "",
          userEmail: user?.email ?? "",
          userSince: user?._creationTime ?? 0,
          roomTitle: room?.title ?? "",
          companyName: company?.name ?? "",
          stampAt: stamp?.createdAt ?? null,
        };
      })
    );
  },
});

export const adminDecide = mutation({
  args: { sessionToken: v.string(), reviewId: v.id("reviews"), approve: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const r = await ctx.db.get(args.reviewId);
    if (!r || r.status !== "pending") return;
    await ctx.db.patch(r._id, { status: args.approve ? "published" : "rejected" });
    if (args.approve) await refreshRoomRating(ctx, r.roomId);
  },
});
