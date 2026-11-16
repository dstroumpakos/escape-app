import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { requireUser, optionalUser } from "./userSession";
import { ConvexError, v } from "convex/values";
import { newBookingCode } from "./codes";
import { internal } from "./_generated/api";
import { assertSlotStillBookable } from "./slotRules";
import { roomTotal } from "./companyPaymentsData";
import { requireVerifiedEmail } from "./emailVerify";
import { slotStartMs } from "./reportRules";
import { PLAYER_CANCEL_REASONS, cancelReasonV, cleanCancelNote, isLateCancel } from "./cancelRules";
import { assertRoomOpen } from "./companyRules";
import { applyOffer, offerPercentFor } from "./slotOffers";
import { pushBookingToCompany, slotFreed } from "./push";

export const create = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    // Ignored: the price is always worked out on the server. Still accepted so
    // older app builds that send it keep working.
    total: v.optional(v.number()),
    paymentTerms: v.optional(v.union(
      v.literal("full"),
      v.literal("deposit_20"),
      v.literal("pay_on_arrival")
    )),
    paymentMethod: v.optional(v.string()),
    pendingPayment: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // The booking belongs to whoever is logged in, never to a userId from the client.
    const user = await requireUser(ctx, args.sessionToken);
    // No card payment here, so the email must be confirmed (see emailVerify.ts).
    requireVerifiedEmail(user);

    // The room decides the price and the group size, not the client.
    const room = await ctx.db.get(args.roomId);
    if (!room || room.isActive === false) throw new ConvexError("Room is not available");
    // Only rooms of companies the UNLOCKED team approved can be booked.
    await assertRoomOpen(ctx, room);
    if (
      !Number.isInteger(args.players) ||
      args.players < room.playersMin ||
      args.players > room.playersMax
    ) {
      throw new ConvexError(`Number of players must be between ${room.playersMin} and ${room.playersMax}`);
    }
    // Last-minute offer on this slot (bookings on UNLOCKED only, see slotOffers.ts)
    const offerPercent = await offerPercentFor(ctx, args.roomId, args.date, args.time);
    const total = applyOffer(roomTotal(room, args.players), offerPercent);

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

    // Started times / last-hour cutoff (see slotRules.ts)
    await assertSlotStillBookable(ctx, room, args.date, args.time, existing);

    // If this booking is pending Stripe payment, mark it as pending
    const isPending = args.pendingPayment === true;

    // No money moves through this mutation, so it never marks a booking paid.
    // Online payments go through companyPayments.startCheckout, which marks the
    // booking paid only after the company's Stripe/Viva account confirms it.
    const paymentTerms = isPending ? (args.paymentTerms || 'full') : 'pay_on_arrival';
    const paymentStatus: 'paid' | 'deposit' | 'unpaid' = 'unpaid';
    const depositPaid: number | undefined = undefined;

    const bookingCode = await newBookingCode(ctx, "UNL");
    const id = await ctx.db.insert("bookings", {
      userId: user._id,
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players,
      total,
      status: isPending ? "pending_payment" : "upcoming",
      bookingCode,
      createdAt: Date.now(),
      source: "unlocked",
      companyId: room.companyId,
      paymentStatus,
      paymentTerms,
      depositPaid,
      offerPercent: offerPercent || undefined,
    });

    // Only send confirmation emails if payment is not pending
    // (for Stripe bookings, emails are sent after payment is confirmed via webhook)
    if (!isPending) {
      await pushBookingToCompany(ctx, { ...args, companyId: room.companyId }, "new");
      const company: any = room.companyId ? await ctx.db.get(room.companyId as any) : null;
      if (user) {
        await ctx.scheduler.runAfter(0, internal.email.sendBookingEmails, {
          bookingCode,
          playerName: user.name,
          playerContact: user.email,
          playerPhone: (user as any).phone || "",
          roomTitle: room.title || "Escape Room",
          date: args.date,
          time: args.time,
          players: args.players,
          total,
          paymentStatus,
          depositPaid,
          companyName: company?.name ?? "Escape Room",
          companyPhone: company?.phone ?? "",
          companyEmail: company?.email ?? "",
          lang: (user as any).language || "en",
        });
      }
    }

    return { id, bookingCode };
  },
});

export const getById = internalQuery({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.bookingId);
  },
});

export const getByUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken);
    if (!user) return [];
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
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

export const upcoming = internalQuery({
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

// Player cancels their own booking. reason/note/userId are optional so older
// app builds that only send { id } keep working. Cancelling an upcoming booking
// less than 24h before it starts is recorded as a late cancellation, which
// counts against the player (see cancelRules.ts).
export const cancel = mutation({
  args: {
    id: v.id("bookings"),
    sessionToken: v.string(),
    reason: v.optional(cancelReasonV),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const booking = await ctx.db.get(args.id);
    if (!booking) return { lateCancel: false };
    // Only the owner can cancel (bookings made by guests/companies have no player owner).
    if (!booking.userId || booking.userId !== user._id) {
      throw new ConvexError("This booking belongs to another account");
    }
    if (booking.status === "cancelled") return { lateCancel: !!booking.lateCancel };
    if (booking.status === "completed") throw new ConvexError("This booking was already played");
    if (args.reason && !(PLAYER_CANCEL_REASONS as readonly string[]).includes(args.reason)) {
      throw new ConvexError("Pick a reason for cancelling");
    }

    const now = Date.now();
    const lateCancel =
      booking.status === "upcoming" &&
      !!booking.userId &&
      isLateCancel(slotStartMs(booking.date, booking.time), now);
    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: "player",
      cancelReason: args.reason,
      cancelNote: cleanCancelNote(args.note),
      lateCancel,
    });

    // Tell the company, and anyone waiting for this time (see push.ts).
    await pushBookingToCompany(ctx, booking, "cancelled");
    await slotFreed(ctx, booking.roomId, booking.date, booking.time);
  },
});

export const complete = internalMutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "completed" });
  },
});

// ── Lookup booking by code (for QR scanner validation) ──
export const getByCode = internalQuery({
  args: { bookingCode: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_bookingCode", (q) => q.eq("bookingCode", args.bookingCode))
      .first();
    if (!booking) return null;

    const room = await ctx.db.get(booking.roomId);
    let playerName: string | undefined;
    if (booking.userId) {
      const user = await ctx.db.get(booking.userId);
      playerName = user?.name;
    }
    return { ...booking, room, playerName: playerName || booking.playerName };
  },
});

// ── Get booked (taken) times for a room+date ──
// Returns an array of time strings that are already booked (not cancelled)
export const getBookedTimes = query({
  args: { roomId: v.id("rooms"), date: v.string() },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date)
      )
      .collect();
    return bookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => b.time);
  },
});

// ── Update booking with Stripe session ID (marks payment as pending) ──
export const updateStripeSession = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    stripeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bookingId, {
      stripeSessionId: args.stripeSessionId,
      paymentStatus: "unpaid", // Will be updated to paid/deposit by webhook
    });
  },
});

// ── Confirm booking payment after Stripe checkout succeeds ──
export const confirmBookingPayment = internalMutation({
  args: {
    bookingId: v.string(),
    paymentTerms: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find the booking - bookingId is stored as string from Stripe metadata
    const booking = await ctx.db.get(args.bookingId as any);
    if (!booking) return;

    // Check that this is a booking record
    if (!('total' in booking)) return;
    const bookingDoc = booking as any;

    const updates: Record<string, any> = {
      stripePaymentIntentId: args.stripePaymentIntentId,
      status: "upcoming", // Payment confirmed — activate the booking
    };

    if (args.paymentTerms === "full") {
      updates.paymentStatus = "paid";
    } else if (args.paymentTerms === "deposit_20") {
      updates.paymentStatus = "deposit";
      updates.depositPaid = Math.round(bookingDoc.total * 0.2 * 100) / 100;
    }

    await ctx.db.patch(booking._id as any, updates);
    if (bookingDoc.status === "pending_payment") await pushBookingToCompany(ctx, bookingDoc, "new");

    // Now that payment is confirmed, send booking confirmation emails
    const room: any = await ctx.db.get(bookingDoc.roomId);
    const user: any = bookingDoc.userId ? await ctx.db.get(bookingDoc.userId) : null;
    const company: any = room?.companyId ? await ctx.db.get(room.companyId) : null;
    if (user) {
      await ctx.scheduler.runAfter(0, internal.email.sendBookingEmails, {
        bookingCode: bookingDoc.bookingCode,
        playerName: (user as any).name,
        playerContact: (user as any).email,
        playerPhone: (user as any).phone || "",
        roomTitle: room?.title || "Escape Room",
        date: bookingDoc.date,
        time: bookingDoc.time,
        players: bookingDoc.players,
        total: bookingDoc.total,
        paymentStatus: updates.paymentStatus || "paid",
        depositPaid: updates.depositPaid,
        companyName: company?.name ?? "Escape Room",
        companyPhone: (company as any)?.phone ?? "",
        companyEmail: company?.email ?? "",
        lang: (user as any).language || "en",
      });
    }
  },
});

// ── Cancel booking and refund if it was paid (called if Stripe checkout is abandoned) ──
export const cancelUnpaidBooking = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return;
    // Only cancel if payment hasn't been confirmed yet
    if (booking.paymentStatus === "paid" || booking.paymentStatus === "deposit") return;
    await ctx.db.patch(args.bookingId, { status: "cancelled", cancelledAt: Date.now(), cancelledBy: "system" });
    await slotFreed(ctx, booking.roomId, booking.date, booking.time);
  },
});

// ── Get booking by Stripe session ID (used after Stripe redirect) ──
export const getByStripeSession = query({
  args: { stripeSessionId: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeSessionId", args.stripeSessionId))
      .first();
    if (!booking) return null;
    const room = await ctx.db.get(booking.roomId);
    // Only what the confirmation page needs: no email/phone/userId/Stripe ids.
    return {
      _id: booking._id,
      bookingCode: booking.bookingCode,
      roomId: booking.roomId,
      date: booking.date,
      time: booking.time,
      players: booking.players,
      total: booking.total,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      room,
    };
  },
});
