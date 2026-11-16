/**
 * ═══════════════════════════════════════════════════════════════
 * Widget Functions — Used by the embeddable website booking plugin
 * ═══════════════════════════════════════════════════════════════
 *
 * These queries/mutations are called by the booking widget embedded
 * on external websites. They support guest bookings (no userId required).
 */

import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { pushBookingToCompany } from "./push";
import { rateLimit, HOUR } from "./rateLimit";
import { sendGuestBookingConfirmation } from "./emailVerify";
import { validateEmail, checkLengths } from "./validation";
import { v } from "convex/values";
import { newBookingCode } from "./codes";
import { internal } from "./_generated/api";
import { slotClosedReason, assertSlotStillBookable } from "./slotRules";
import { assertRoomOpen, companyIsPublic } from "./companyRules";

// ─── Get Widget Configuration ─────────────────────────────────
// Returns company info + its active rooms for the widget to render
export const getConfig = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");
    // Not approved yet (or declined): the widget shows no rooms.
    if (!companyIsPublic(company)) {
      return { company: { name: company.name, logo: company.logo, phone: "", address: "", city: "" }, rooms: [] };
    }

    // Get active rooms for this company
    const allRooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const rooms = allRooms
      .filter((r) => r.isActive !== false) // default to active
      .map((r) => ({
        _id: r._id,
        title: r.title,
        location: r.location,
        image: r.image,
        images: r.images,
        rating: r.rating,
        reviews: r.reviews,
        duration: r.duration,
        difficulty: r.difficulty,
        maxDifficulty: r.maxDifficulty,
        players: r.players,
        playersMin: r.playersMin,
        playersMax: r.playersMax,
        price: r.price,
        pricePerGroup: r.pricePerGroup,
        theme: r.theme,
        description: r.description,
        operatingDays: r.operatingDays,
        defaultTimeSlots: r.defaultTimeSlots,
        overflowSlot: r.overflowSlot,
        paymentTerms: r.paymentTerms,
      }));

    return {
      company: {
        name: company.name,
        logo: company.logo,
        phone: company.phone,
        address: company.address,
        city: company.city,
      },
      rooms,
    };
  },
});

// ─── Get Room Availability for a Specific Date ───────────────
// Returns available time slots for a room on a given date
export const getRoomAvailability = query({
  args: {
    roomId: v.id("rooms"),
    date: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    // Get day of week: 0=Sun, 1=Mon, ..., 6=Sat
    const dayOfWeek = new Date(args.date + "T00:00:00").getDay();

    // Check if room operates on this day
    if (room.operatingDays && !room.operatingDays.includes(dayOfWeek)) {
      return { available: false, closed: true, slots: [] };
    }

    // Get custom time slots for this date (if any were set)
    const customSlots = await ctx.db
      .query("timeSlots")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date)
      )
      .collect();

    // Get booked times for this date
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date)
      )
      .collect();

    const bookedTimes = new Set(
      bookings.filter((b) => b.status !== "cancelled").map((b) => b.time)
    );

    // Build slot list: use custom slots if any, otherwise fall back to defaults
    let slots: { time: string; price: number; available: boolean; pricePerGroup?: { players: number; price: number }[] }[];

    if (customSlots.length > 0) {
      slots = customSlots.map((s) => ({
        time: s.time,
        price: s.price,
        available: s.available && !bookedTimes.has(s.time),
        pricePerGroup: s.pricePerGroup,
      }));
    } else if (room.defaultTimeSlots) {
      slots = room.defaultTimeSlots.map((s) => ({
        time: s.time,
        price: s.price,
        available: !bookedTimes.has(s.time),
        pricePerGroup: room.pricePerGroup,
      }));
    } else {
      return { available: false, closed: false, slots: [] };
    }

    // Check overflow slot: show when ALL regular slots are booked (even if overflow itself is booked)
    const allRegularBooked = slots.length > 0 && slots.every((s) => !s.available);
    if (allRegularBooked && room.overflowSlot) {
      const overflowDays = room.overflowSlot.days || [];
      if (overflowDays.includes(dayOfWeek)) {
        slots.push({
          time: room.overflowSlot.time,
          price: room.overflowSlot.price,
          available: !bookedTimes.has(room.overflowSlot.time),
          pricePerGroup: room.overflowSlot.pricePerGroup,
        });
      }
    }

    // Started times, and free times inside their last hour whose previous time
    // isn't booked, can't be booked any more (see slotRules.ts). Done after the
    // overflow check so the bonus slot still only depends on real bookings.
    const allTimes = new Set<string>([...slots.map((s) => s.time), ...bookedTimes]);
    const nowMs = Date.now();
    for (const s of slots) {
      if (s.available && slotClosedReason(args.date, s.time, allTimes, bookedTimes, nowMs)) {
        s.available = false;
      }
    }

    // Sort by time — treat hours before 06:00 as late-night (after 23:59)
    const sortKey = (t: string) => {
      const hour = parseInt(t.split(":")[0], 10);
      return hour < 6 ? hour + 24 : hour;
    };
    slots.sort((a, b) => sortKey(a.time) - sortKey(b.time));

    return {
      available: slots.some((s) => s.available),
      closed: false,
      slots,
      room: {
        title: room.title,
        duration: room.duration,
        playersMin: room.playersMin,
        playersMax: room.playersMax,
        price: room.price,
        pricePerGroup: room.pricePerGroup,
        paymentTerms: room.paymentTerms,
      },
    };
  },
});

// ─── Create Guest Booking (from Widget) ──────────────────────
// Supports booking without a user account — stores guest name/contact
export const createGuestBooking = mutation({
  args: {
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    playerName: v.string(),
    playerContact: v.string(), // email
    playerPhone: v.string(),   // phone number (mandatory)
    notes: v.optional(v.string()),
    paymentTerms: v.optional(
      v.union(
        v.literal("full"),
        v.literal("deposit_20"),
        v.literal("pay_on_arrival")
      )
    ),
  },
  handler: async (ctx, args) => {
    checkLengths([["Name", args.playerName, 100], ["Email", args.playerContact, 200], ["Phone", args.playerPhone, 30], ["Notes", args.notes, 1000]]);
    // Validate player name & contact
    if (!args.playerName.trim()) throw new Error("Name is required");
    if (!args.playerContact.trim()) throw new Error("Email is required");
    if (!validateEmail(args.playerContact.trim())) throw new Error("Please enter a valid email");
    if (!args.playerPhone.trim()) throw new Error("Phone number is required");

    // Get room & validate
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    if (room.isActive === false) throw new Error("Room is not available");
    // Only rooms of companies the UNLOCKED team approved can be booked.
    await assertRoomOpen(ctx, room);

    // Validate player count
    if (args.players < room.playersMin || args.players > room.playersMax) {
      throw new Error(
        `Number of players must be between ${room.playersMin} and ${room.playersMax}`
      );
    }

    // Stop one person (or a bot) filling a room's calendar with fake bookings.
    const guestEmail = args.playerContact.trim().toLowerCase();
    await rateLimit(ctx, `guestBooking:email:${guestEmail}`, 3, HOUR);
    await rateLimit(ctx, `guestBooking:room:${args.roomId}`, 20, HOUR);
    // Site-wide cap: each guest booking emails a confirm link to the address given.
    await rateLimit(ctx, "emails:guestBooking", 300, HOUR);

    // Prevent double-booking
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
    await assertSlotStillBookable(ctx, room, args.date, args.time, existing);

    // Calculate price
    let total: number;
    if (room.pricePerGroup && room.pricePerGroup.length > 0) {
      // Find the per-group price for this player count
      const groupPrice = room.pricePerGroup.find(
        (p) => p.players === args.players
      );
      total = groupPrice ? groupPrice.price : room.price * args.players;
    } else {
      total = room.price * args.players;
    }

    // The widget doesn't take payments, so the booking is never marked paid
    // here: the player pays at the venue.
    const paymentTerms = "pay_on_arrival" as const;
    const paymentStatus = "unpaid" as "paid" | "deposit" | "unpaid";
    const depositPaid: number | undefined = undefined;

    // Generate booking code
    const bookingCode = await newBookingCode(ctx, "WEB");

    const id = await ctx.db.insert("bookings", {
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players,
      total,
      // Holds the slot until the guest presses the link in the email; it is
      // cancelled after 30 minutes otherwise (see emailVerify.ts).
      status: "pending_payment",
      awaitingEmailConfirm: true,
      bookingCode,
      createdAt: Date.now(),
      source: "external",
      externalSource: "Website Widget",
      companyId: room.companyId,
      playerName: args.playerName.trim(),
      playerContact: args.playerContact.trim(),
      playerPhone: args.playerPhone.trim(),
      notes: args.notes,
      paymentStatus,
      paymentTerms,
      depositPaid,
    });

    // Ask the guest to confirm by email. The usual booking emails (guest and
    // company) go out after they press the link: see sendGuestBookingEmails.
    await sendGuestBookingConfirmation(
      ctx,
      {
        _id: id,
        playerName: args.playerName.trim(),
        playerContact: guestEmail,
        date: args.date,
        time: args.time,
      },
      room.title
    );

    return {
      id,
      bookingCode,
      // New: the booking only counts once the guest confirms by email.
      needsEmailConfirm: true,
      total,
      paymentStatus,
      depositPaid,
      roomTitle: room.title,
      date: args.date,
      time: args.time,
      players: args.players,
    };
  },
});

/** Booking emails for a widget booking, after the guest confirmed it. */
export const sendGuestBookingEmails = internalMutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const b = await ctx.db.get(args.bookingId);
    if (!b || b.status !== "upcoming") return;
    await pushBookingToCompany(ctx, b, "new");
    const room = await ctx.db.get(b.roomId);
    const company = b.companyId ? await ctx.db.get(b.companyId) : null;
    await ctx.scheduler.runAfter(0, internal.email.sendBookingEmails, {
      bookingCode: b.bookingCode,
      playerName: b.playerName ?? "",
      playerContact: b.playerContact ?? "",
      playerPhone: b.playerPhone ?? "",
      roomTitle: room?.title ?? "Escape Room",
      date: b.date,
      time: b.time,
      players: b.players,
      total: b.total,
      paymentStatus: b.paymentStatus ?? "unpaid",
      depositPaid: b.depositPaid,
      notes: b.notes,
      companyName: company?.name ?? "Escape Room",
      companyPhone: company?.phone ?? "",
      companyEmail: company?.email ?? "",
    });
  },
});

// ─── Lookup Booking by Code (for confirmation page) ──────────
export const getBookingByCode = internalQuery({
  args: { bookingCode: v.string() },
  handler: async (ctx, args) => {
    const booking = await ctx.db
      .query("bookings")
      .withIndex("by_bookingCode", (q) => q.eq("bookingCode", args.bookingCode))
      .first();
    if (!booking) return null;

    const room = await ctx.db.get(booking.roomId);
    return {
      bookingCode: booking.bookingCode,
      roomTitle: room?.title,
      date: booking.date,
      time: booking.time,
      players: booking.players,
      total: booking.total,
      status: booking.status,
      playerName: booking.playerName,
    };
  },
});

// ─── Guest Slot Alert (bell icon on widget) ───────────────────
// Creates a notification request so we can alert the guest when a slot opens up
export const createGuestSlotAlert = mutation({
  args: {
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    contact: v.string(),
  },
  handler: async (ctx, args) => {
    const alertRoom = await ctx.db.get(args.roomId);
    if (!alertRoom) throw new Error("Room not found");
    await assertRoomOpen(ctx, alertRoom);
    // Check if this contact already has an alert for this exact slot
    const existing = await ctx.db
      .query("guestSlotAlerts")
      .withIndex("by_slot", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date).eq("time", args.time)
      )
      .collect();

    const alreadyExists = existing.some(
      (a) => a.contact === args.contact && !a.notified
    );

    if (alreadyExists) {
      return { success: true, alreadySubscribed: true };
    }

    if (args.contact.length > 200) throw new Error("Contact is too long");
    await rateLimit(ctx, `guestAlert:contact:${args.contact.trim().toLowerCase()}`, 10, HOUR);
    await rateLimit(ctx, `guestAlert:room:${args.roomId}`, 50, HOUR);
    await rateLimit(ctx, "emails:guestAlert", 500, HOUR); // site-wide cap

    await ctx.db.insert("guestSlotAlerts", {
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      contact: args.contact,
      createdAt: Date.now(),
      notified: false,
    });

    return { success: true, alreadySubscribed: false };
  },
});

// ─── Upload Widget Bundle ─────────────────────────────────────
// Stores the built widget JS so it can be served from the Convex site URL
export const uploadBundle = internalMutation({
  args: {
    content: v.string(),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    // Delete any existing bundles
    const existing = await ctx.db.query("widgetBundle").collect();
    for (const bundle of existing) {
      await ctx.db.delete(bundle._id);
    }
    // Insert new bundle
    await ctx.db.insert("widgetBundle", {
      content: args.content,
      version: args.version,
      updatedAt: Date.now(),
    });
    return { success: true, version: args.version };
  },
});

// ─── Get Widget Bundle (used by HTTP action) ─────────────────
export const getBundle = query({
  args: {},
  handler: async (ctx) => {
    const bundles = await ctx.db.query("widgetBundle").collect();
    return bundles[0] ?? null;
  },
});
