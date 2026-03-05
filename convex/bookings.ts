import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const create = mutation({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    total: v.number(),
    paymentTerms: v.optional(v.union(
      v.literal("full"),
      v.literal("deposit_20"),
      v.literal("pay_on_arrival")
    )),
    paymentMethod: v.optional(v.string()),
    pendingPayment: v.optional(v.boolean()),
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

    // Determine payment status based on payment terms
    const paymentTerms = args.paymentTerms || 'full';
    let paymentStatus: 'paid' | 'deposit' | 'unpaid' = 'paid';
    let depositPaid: number | undefined;
    if (paymentTerms === 'deposit_20') {
      paymentStatus = 'deposit';
      depositPaid = Math.round(args.total * 0.2 * 100) / 100;
    } else if (paymentTerms === 'pay_on_arrival') {
      paymentStatus = 'unpaid';
    }

    const bookingCode = `UNL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const id = await ctx.db.insert("bookings", {
      userId: args.userId,
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players,
      total: args.total,
      status: args.pendingPayment ? "pending_payment" : "upcoming",
      bookingCode,
      createdAt: Date.now(),
      source: "unlocked",
      companyId: room?.companyId,
      paymentStatus,
      paymentTerms,
      depositPaid,
    });

    // Send booking confirmation emails (player + company)
    const user = await ctx.db.get(args.userId);
    const company = room?.companyId ? await ctx.db.get(room.companyId) : null;
    if (user) {
      await ctx.scheduler.runAfter(0, internal.email.sendBookingEmails, {
        bookingCode,
        playerName: user.name,
        playerContact: user.email,
        playerPhone: (user as any).phone || "",
        roomTitle: room?.title || "Escape Room",
        date: args.date,
        time: args.time,
        players: args.players,
        total: args.total,
        paymentStatus,
        depositPaid,
        companyName: company?.name ?? "Escape Room",
        companyPhone: company?.phone ?? "",
        companyEmail: company?.email ?? "",
        lang: (user as any).language || "en",
      });
    }

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
    const booking = await ctx.db.get(args.id);
    await ctx.db.patch(args.id, { status: "cancelled" });

    // Check if this was the only active booking for this slot.
    // If so, the slot is now available again — mark slotAlerts as "ready"
    // by setting a special field so the client watcher can fire notifications.
    if (booking) {
      const otherActive = await ctx.db
        .query("bookings")
        .withIndex("by_room_date", (q) =>
          q.eq("roomId", booking.roomId).eq("date", booking.date)
        )
        .collect();
      const stillBooked = otherActive.some(
        (b) => b._id !== args.id && b.time === booking.time && b.status !== "cancelled"
      );

      if (!stillBooked) {
        // Slot is now free! Find all pending alerts for this slot
        const alerts = await ctx.db
          .query("slotAlerts")
          .withIndex("by_slot", (q) =>
            q.eq("roomId", booking.roomId).eq("date", booking.date).eq("time", booking.time)
          )
          .collect();
        for (const alert of alerts) {
          if (!alert.notified) {
            await ctx.db.patch(alert._id, { notified: true });
          }
        }

        // Also mark guest (widget) slot alerts as notified
        const guestAlerts = await ctx.db
          .query("guestSlotAlerts")
          .withIndex("by_slot", (q) =>
            q.eq("roomId", booking.roomId).eq("date", booking.date).eq("time", booking.time)
          )
          .collect();
        for (const ga of guestAlerts) {
          if (!ga.notified) {
            await ctx.db.patch(ga._id, { notified: true });
          }
        }
      }
    }
  },
});

export const complete = mutation({
  args: { id: v.id("bookings") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "completed" });
  },
});

// ── Lookup booking by code (for QR scanner validation) ──
export const getByCode = query({
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
export const updateStripeSession = mutation({
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
export const confirmBookingPayment = mutation({
  args: {
    bookingId: v.string(),
    paymentTerms: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId as any);
    if (!booking) return;
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

// ── Cancel unpaid booking (if Stripe checkout is abandoned) ──
export const cancelUnpaidBooking = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return;
    if (booking.paymentStatus === "paid" || booking.paymentStatus === "deposit") return;
    await ctx.db.patch(args.bookingId, { status: "cancelled" });
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
    return { ...booking, room };
  },
});
