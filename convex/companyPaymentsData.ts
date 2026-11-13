/**
 * Player payments into each company's OWN Stripe or Viva account.
 *
 * This file holds the queries/mutations (default runtime). The provider calls
 * and the encryption of the company's keys live in companyPayments.ts (Node).
 *
 * Security notes
 *  - Company portal calls carry a session token (companySession.ts), and
 *    every change to payment keys or payment settings also re-checks the
 *    company's password.
 *  - companyPaymentCredentials is only touched by internal functions.
 *  - A booking is only marked paid by markPaid, which is internal and is only
 *    called after the provider's own API said the money arrived.
 */
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { verifyPassword } from "./passwordUtils";
import { assertSlotStillBookable } from "./slotRules";
import { sessionTokenV, requireCompany } from "./companySession";

export const DEFAULT_DEPOSIT_PERCENT = 20;
export const MAX_BOOKING_FEE = 20; // euros
/** How long a player has to finish paying before the slot is released. */
export const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

const providerV = v.union(v.literal("stripe"), v.literal("viva"));
const modeV = v.union(v.literal("live"), v.literal("test"));
const termsV = v.union(v.literal("full"), v.literal("deposit_20"), v.literal("pay_on_arrival"));

type Terms = "full" | "deposit_20" | "pay_on_arrival";

// ─── Pure helpers ───

export function clampDepositPercent(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.min(99, Math.max(1, Math.round(n)));
}

/** Same formula as the room booking page and the widget. */
export function roomTotal(room: Doc<"rooms">, players: number): number {
  if (room.pricePerGroup && room.pricePerGroup.length > 0) {
    const match = room.pricePerGroup.find((p) => p.players === players);
    if (match) return match.price;
  }
  return room.price * players;
}

export function roomTerms(room: Doc<"rooms">): Terms[] {
  const raw = room.paymentTerms;
  if (Array.isArray(raw)) return raw.length ? raw : ["pay_on_arrival"];
  if (raw) return [raw];
  return ["full", "deposit_20", "pay_on_arrival"];
}

export function effectiveDepositPercent(room: Doc<"rooms">, company: Doc<"companies"> | null): number {
  return (
    clampDepositPercent(room.depositPercent) ??
    clampDepositPercent(company?.depositPercent) ??
    DEFAULT_DEPOSIT_PERCENT
  );
}

export function effectiveBookingFee(company: Doc<"companies"> | null): number {
  if (!company?.bookingFeeEnabled) return 0;
  const fee = company.bookingFeeAmount ?? 0;
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  return Math.min(MAX_BOOKING_FEE, Math.round(fee * 100) / 100);
}

/** Everything in cents so rounding is decided once. */
export function chargeFor(total: number, terms: "full" | "deposit_20", depositPercent: number, fee: number) {
  const totalCents = Math.round(total * 100);
  const partCents = terms === "full" ? totalCents : Math.round((totalCents * depositPercent) / 100);
  const feeCents = Math.round(fee * 100);
  return { totalCents, partCents, feeCents, dueCents: partCents + feeCents };
}

async function requireCompanyPassword(ctx: any, companyId: Id<"companies">, password: string) {
  const company = await ctx.db.get(companyId);
  if (!company) throw new ConvexError("Company not found");
  const ok = await verifyPassword(password, company.password);
  if (!ok) throw new ConvexError("Incorrect password");
  return company as Doc<"companies">;
}

// ─── Company portal ───

/** Non-secret payment settings for the company portal. */
export const getCompanySettings = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    await requireCompany(ctx, args, "companyPaymentsData:getCompanySettings");
    const c = await ctx.db.get(args.companyId);
    if (!c) return null;
    return {
      provider: c.paymentProvider ?? null,
      mode: c.paymentMode ?? null,
      accountLabel: c.paymentAccountLabel ?? null,
      connectedAt: c.paymentConnectedAt ?? null,
      depositPercent: clampDepositPercent(c.depositPercent) ?? DEFAULT_DEPOSIT_PERCENT,
      bookingFeeEnabled: c.bookingFeeEnabled ?? false,
      bookingFeeAmount: c.bookingFeeAmount ?? 0,
      serverReady: !!process.env.PAYMENT_CREDENTIALS_KEY,
    };
  },
});

export const updateSettings = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    password: v.string(),
    depositPercent: v.number(),
    bookingFeeEnabled: v.boolean(),
    bookingFeeAmount: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCompany(ctx, args, "companyPaymentsData:updateSettings");
    await requireCompanyPassword(ctx, args.companyId, args.password);
    const pct = clampDepositPercent(args.depositPercent);
    if (pct === undefined) throw new ConvexError("Enter a deposit between 1% and 99%");
    const fee = Math.round(args.bookingFeeAmount * 100) / 100;
    if (!Number.isFinite(fee) || fee < 0 || fee > MAX_BOOKING_FEE) {
      throw new ConvexError(`The booking fee must be between €0 and €${MAX_BOOKING_FEE}`);
    }
    await ctx.db.patch(args.companyId, {
      depositPercent: pct,
      bookingFeeEnabled: args.bookingFeeEnabled && fee > 0,
      bookingFeeAmount: fee,
    });
  },
});

// Used by the Node actions before touching keys.
export const checkPassword = internalQuery({
  args: { companyId: v.id("companies"), password: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return false;
    return await verifyPassword(args.password, company.password);
  },
});

export const getCredentialRow = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companyPaymentCredentials")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .first();
  },
});

export const storeCredentials = internalMutation({
  args: {
    companyId: v.id("companies"),
    provider: providerV,
    mode: modeV,
    encrypted: v.string(),
    accountLabel: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("companyPaymentCredentials")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.insert("companyPaymentCredentials", {
      companyId: args.companyId,
      provider: args.provider,
      mode: args.mode,
      encrypted: args.encrypted,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.companyId, {
      paymentProvider: args.provider,
      paymentMode: args.mode,
      paymentAccountLabel: args.accountLabel,
      paymentConnectedAt: Date.now(),
    });
  },
});

export const removeCredentials = internalMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("companyPaymentCredentials")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.patch(args.companyId, {
      paymentProvider: undefined,
      paymentMode: undefined,
      paymentAccountLabel: undefined,
      paymentConnectedAt: undefined,
    });
  },
});

// ─── Player checkout ───

/**
 * What the checkout page may offer for a room. Online terms are only offered
 * when the company has connected Stripe or Viva; otherwise players book and
 * pay at the venue.
 */
export const getCheckoutOptions = query({
  args: { roomId: v.id("rooms"), players: v.number() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;
    const company = room.companyId ? await ctx.db.get(room.companyId) : null;
    const online = !!company?.paymentProvider && !!process.env.PAYMENT_CREDENTIALS_KEY;
    const configured = roomTerms(room);
    let terms = configured.filter((t) => online || t === "pay_on_arrival");
    if (terms.length === 0) terms = ["pay_on_arrival"];
    const total = roomTotal(room, args.players);
    const depositPercent = effectiveDepositPercent(room, company);
    const bookingFee = effectiveBookingFee(company);
    return {
      terms,
      online,
      provider: online ? company!.paymentProvider! : null,
      testMode: online && company!.paymentMode === "test",
      total,
      depositPercent,
      bookingFee,
      depositAmount: chargeFor(total, "deposit_20", depositPercent, 0).partCents / 100,
    };
  },
});

/** Creates the booking in pending_payment state and returns what the checkout needs. */
export const createPendingBooking = internalMutation({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    paymentTerms: v.union(v.literal("full"), v.literal("deposit_20")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("User not found");
    const room = await ctx.db.get(args.roomId);
    if (!room || room.isActive === false) throw new ConvexError("Room is not available");
    const company = room.companyId ? await ctx.db.get(room.companyId) : null;
    if (!company?.paymentProvider) {
      throw new ConvexError("This escape room doesn't take online payments yet. Choose pay at the venue.");
    }
    if (!roomTerms(room).includes(args.paymentTerms)) {
      throw new ConvexError("This payment option isn't available for this room");
    }
    if (
      !Number.isInteger(args.players) ||
      args.players < room.playersMin ||
      args.players > room.playersMax
    ) {
      throw new ConvexError(`Number of players must be between ${room.playersMin} and ${room.playersMax}`);
    }

    const existing = await ctx.db
      .query("bookings")
      .withIndex("by_room_date", (q) => q.eq("roomId", args.roomId).eq("date", args.date))
      .collect();
    if (existing.some((b) => b.time === args.time && b.status !== "cancelled")) {
      throw new ConvexError("This time slot is no longer available");
    }
    await assertSlotStillBookable(ctx, room, args.date, args.time, existing);

    const total = roomTotal(room, args.players);
    const depositPercent = effectiveDepositPercent(room, company);
    const bookingFee = effectiveBookingFee(company);
    const charge = chargeFor(total, args.paymentTerms, depositPercent, bookingFee);
    if (charge.dueCents < 50) throw new ConvexError("The amount is too small to pay online");

    const bookingCode = `UNL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const bookingId = await ctx.db.insert("bookings", {
      userId: args.userId,
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players,
      total,
      status: "pending_payment",
      bookingCode,
      createdAt: Date.now(),
      source: "unlocked",
      companyId: room.companyId,
      paymentStatus: "unpaid",
      paymentTerms: args.paymentTerms,
      paymentProvider: company.paymentProvider,
      paymentMode: company.paymentMode,
      depositPercent: args.paymentTerms === "deposit_20" ? depositPercent : undefined,
      bookingFee: bookingFee || undefined,
      amountDueNow: charge.dueCents / 100,
    });

    return {
      bookingId,
      bookingCode,
      companyId: company._id,
      provider: company.paymentProvider,
      roomTitle: room.title,
      companyName: company.name,
      playerName: user.name,
      playerEmail: user.email,
      lang: (user as any).language || "en",
      ...charge,
    };
  },
});

/** Everything an action needs to (re)open or verify a booking's checkout. */
export const getBookingForPayment = internalQuery({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    const room = await ctx.db.get(booking.roomId);
    const user = booking.userId ? await ctx.db.get(booking.userId) : null;
    const company = booking.companyId ? await ctx.db.get(booking.companyId) : null;
    const total = booking.total;
    const terms = booking.paymentTerms === "deposit_20" ? "deposit_20" : "full";
    const charge = chargeFor(total, terms, booking.depositPercent ?? DEFAULT_DEPOSIT_PERCENT, booking.bookingFee ?? 0);
    return {
      booking,
      roomTitle: room?.title ?? "Escape room",
      companyName: company?.name ?? "Escape room",
      playerName: user?.name ?? booking.playerName ?? "",
      playerEmail: user?.email ?? booking.playerContact ?? "",
      lang: (user as any)?.language || "en",
      ...charge,
    };
  },
});

export const findBookingByVivaOrder = internalQuery({
  args: { orderCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bookings")
      .withIndex("by_vivaOrderCode", (q) => q.eq("vivaOrderCode", args.orderCode))
      .first();
  },
});

export const attachCheckout = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    stripeSessionId: v.optional(v.string()),
    vivaOrderCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.bookingId, {
      stripeSessionId: args.stripeSessionId,
      vivaOrderCode: args.vivaOrderCode,
    });
  },
});

/**
 * Marks a booking paid. Only call after the provider confirmed the payment.
 * Idempotent: a second call for the same booking does nothing.
 */
export const markPaid = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    reference: v.optional(v.string()),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return { ok: false as const, reason: "not_found" };
    if (booking.paidAt) return { ok: true as const, already: true };

    const dueCents = Math.round((booking.amountDueNow ?? 0) * 100);
    if (args.amountCents + 1 < dueCents) {
      console.error(`[payments] ${booking.bookingCode}: paid ${args.amountCents}c, expected ${dueCents}c`);
      return { ok: false as const, reason: "amount_mismatch" };
    }

    const isDeposit = booking.paymentTerms === "deposit_20";
    const depositPaid = isDeposit
      ? chargeFor(booking.total, "deposit_20", booking.depositPercent ?? DEFAULT_DEPOSIT_PERCENT, 0).partCents / 100
      : undefined;

    // Paid after the slot was already released (very late payment). Keep it
    // visible to the company instead of silently dropping the money.
    let status: Doc<"bookings">["status"] = "upcoming";
    let notes = booking.notes;
    if (booking.status === "cancelled") {
      const clash = (
        await ctx.db
          .query("bookings")
          .withIndex("by_room_date", (q) => q.eq("roomId", booking.roomId).eq("date", booking.date))
          .collect()
      ).some((b) => b._id !== booking._id && b.time === booking.time && b.status !== "cancelled");
      if (clash) {
        status = "cancelled";
        notes = `${notes ? notes + "\n" : ""}Paid online after the payment window closed and the slot was taken. Refund the player.`;
        console.error(`[payments] ${booking.bookingCode}: late payment, slot taken — needs refund`);
      }
    }

    await ctx.db.patch(booking._id, {
      status,
      notes,
      paymentStatus: isDeposit ? "deposit" : "paid",
      depositPaid,
      paymentReference: args.reference,
      stripePaymentIntentId: booking.paymentProvider === "stripe" ? args.reference : booking.stripePaymentIntentId,
      paidAt: Date.now(),
    });

    if (status === "cancelled") return { ok: true as const, lateCancelled: true };

    const room = await ctx.db.get(booking.roomId);
    const user = booking.userId ? await ctx.db.get(booking.userId) : null;
    const company = booking.companyId ? await ctx.db.get(booking.companyId) : null;
    if (user) {
      const lang = (user as any).language || "en";
      await ctx.scheduler.runAfter(0, internal.email.sendBookingEmails, {
        bookingCode: booking.bookingCode,
        playerName: user.name,
        playerContact: user.email,
        playerPhone: (user as any).phone || "",
        roomTitle: room?.title || "Escape Room",
        date: booking.date,
        time: booking.time,
        players: booking.players,
        total: booking.total,
        paymentStatus: isDeposit ? "deposit" : "paid",
        depositPaid,
        companyName: company?.name ?? "Escape Room",
        companyPhone: company?.phone ?? "",
        companyEmail: company?.email ?? "",
        lang,
      });
      await ctx.scheduler.runAfter(0, internal.email.sendStripeReceipt, {
        playerName: user.name,
        playerEmail: user.email,
        bookingCode: booking.bookingCode,
        roomTitle: room?.title || "Escape Room",
        date: booking.date,
        time: booking.time,
        players: booking.players,
        total: booking.total,
        amountCharged: dueCents / 100,
        paymentTerms: booking.paymentTerms || "full",
        companyName: company?.name ?? "Escape Room",
        lang,
      });
    }
    return { ok: true as const };
  },
});

/** Releases the slot when the payment window passed without a payment. */
export const expirePendingBooking = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.paidAt) return;
    if (booking.status !== "pending_payment") return;
    await ctx.db.patch(args.bookingId, { status: "cancelled" });
  },
});

// ─── Player-facing status ───

/** Small, non-sensitive view of a booking's payment state for the return pages. */
export const getPaymentState = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.bookingId);
    if (!b) return null;
    return {
      bookingId: b._id,
      bookingCode: b.bookingCode,
      status: b.status,
      paymentStatus: b.paymentStatus ?? null,
      paymentTerms: b.paymentTerms ?? null,
      roomId: b.roomId,
      date: b.date,
      time: b.time,
      players: b.players,
      total: b.total,
      amountDueNow: b.amountDueNow ?? null,
      depositPaid: b.depositPaid ?? null,
      provider: b.paymentProvider ?? null,
    };
  },
});
