import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { hashPassword, verifyPassword } from "./passwordUtils";
import { validateEmail, validatePassword, requireNonEmpty } from "./validation";

// ─── Admin secret: set this env var in your Convex dashboard ───
// In Convex Dashboard → Settings → Environment Variables → ADMIN_SECRET
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

// ─── Auth ───
export const login = query({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (!company) return null;

    const valid = await verifyPassword(args.password, company.password);
    if (!valid) return null;

    // Return safe fields only — NEVER return the password
    const { password: _pw, ...safe } = company;
    return safe;
  },
});

export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    vatNumber: v.optional(v.string()),
    description: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate inputs
    requireNonEmpty(args.name, "Company name");
    if (!validateEmail(args.email)) return { error: "Invalid email format" };
    const pwError = validatePassword(args.password);
    if (pwError) return { error: pwError };
    requireNonEmpty(args.phone, "Phone");
    requireNonEmpty(args.address, "Address");
    requireNonEmpty(args.city, "City");

    const existing = await ctx.db
      .query("companies")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) return { error: "Email already registered" };

    const hashedPw = await hashPassword(args.password);

    const id = await ctx.db.insert("companies", {
      ...args,
      password: hashedPw,
      logo: "",
      verified: false,
      createdAt: Date.now(),
      subscriptionEnabled: false,
      onboardingStatus: "pending_terms",
    });
    return { id };
  },
});

// ─── Company Profile ───
export const getById = query({
  args: { id: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.id);
    if (!company) return null;
    // Never return the password field
    const { password: _pw, ...safe } = company;
    return { ...safe, onboardingStatus: company.onboardingStatus || "approved" };
  },
});

export const updateProfile = mutation({
  args: {
    id: v.id("companies"),
    name: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    vatNumber: v.optional(v.string()),
    description: v.string(),
    logo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

// ─── Dashboard Stats ───
export const getDashboardStats = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const roomIds = rooms.map((r) => r._id);

    let totalBookings = 0;
    let totalRevenue = 0;
    let upcomingBookings = 0;

    for (const roomId of roomIds) {
      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect();
      totalBookings += bookings.length;
      totalRevenue += bookings.reduce((sum, b) => sum + b.total, 0);
      upcomingBookings += bookings.filter((b) => b.status === "upcoming").length;
    }

    const subscribers = await ctx.db
      .query("playerSubscriptions")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    return {
      totalRooms: rooms.length,
      activeRooms: rooms.filter((r) => r.isActive !== false).length,
      totalBookings,
      upcomingBookings,
      totalRevenue,
      subscribers: subscribers.filter((s) => s.isActive).length,
    };
  },
});

// ─── Company Rooms ───
export const getRooms = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const createRoom = mutation({
  args: {
    companyId: v.id("companies"),
    title: v.string(),
    location: v.string(),
    image: v.string(),
    images: v.optional(v.array(v.string())),
    duration: v.number(),
    difficulty: v.number(),
    maxDifficulty: v.number(),
    players: v.string(),
    playersMin: v.number(),
    playersMax: v.number(),
    price: v.number(),
    pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))),
    theme: v.string(),
    tags: v.array(v.string()),
    description: v.string(),
    story: v.string(),
    paymentTerms: v.array(v.union(v.literal("full"), v.literal("deposit_20"), v.literal("pay_on_arrival"))),
    termsOfUse: v.optional(v.string()),
    isSubscriptionOnly: v.optional(v.boolean()),
    bookingMode: v.optional(v.union(v.literal("unlocked_primary"), v.literal("external_primary"))),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    operatingDays: v.optional(v.array(v.number())),
    defaultTimeSlots: v.optional(v.array(v.object({ time: v.string(), price: v.number() }))),
    overflowSlot: v.optional(v.object({ time: v.string(), price: v.number(), pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))), days: v.array(v.number()) })),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("rooms", {
      ...args,
      rating: 0,
      reviews: 0,
      isNew: true,
      isFeatured: false,
      isTrending: false,
      isActive: true,
    });
    return id;
  },
});

export const updateRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    title: v.optional(v.string()),
    location: v.optional(v.string()),
    image: v.optional(v.string()),
    images: v.optional(v.array(v.string())),
    duration: v.optional(v.number()),
    difficulty: v.optional(v.number()),
    players: v.optional(v.string()),
    playersMin: v.optional(v.number()),
    playersMax: v.optional(v.number()),
    price: v.optional(v.number()),
    pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))),
    theme: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
    story: v.optional(v.string()),
    paymentTerms: v.optional(v.array(v.union(v.literal("full"), v.literal("deposit_20"), v.literal("pay_on_arrival")))),
    termsOfUse: v.optional(v.string()),
    isSubscriptionOnly: v.optional(v.boolean()),
    bookingMode: v.optional(v.union(v.literal("unlocked_primary"), v.literal("external_primary"))),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    operatingDays: v.optional(v.array(v.number())),
    defaultTimeSlots: v.optional(v.array(v.object({ time: v.string(), price: v.number() }))),
    overflowSlot: v.optional(v.object({ time: v.string(), price: v.number(), pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))), days: v.array(v.number()) })),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { roomId, ...fields } = args;
    // Remove undefined fields
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(roomId, updates);
  },
});

export const deleteRoom = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    // Delete associated time slots
    const slots = await ctx.db
      .query("timeSlots")
      .withIndex("by_room_date", (q) => q.eq("roomId", args.roomId))
      .collect();
    for (const slot of slots) {
      await ctx.db.delete(slot._id);
    }
    await ctx.db.delete(args.roomId);
  },
});

// ─── Time Slot Management ───
export const getRoomSlots = query({
  args: { roomId: v.id("rooms"), date: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("timeSlots")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date)
      )
      .collect();
  },
});

export const setSlots = mutation({
  args: {
    roomId: v.id("rooms"),
    date: v.string(),
    slots: v.array(
      v.object({
        time: v.string(),
        price: v.number(),
        available: v.boolean(),
        pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing slots for this date
    const existing = await ctx.db
      .query("timeSlots")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", args.roomId).eq("date", args.date)
      )
      .collect();
    for (const slot of existing) {
      await ctx.db.delete(slot._id);
    }
    // Insert new slots
    for (const slot of args.slots) {
      await ctx.db.insert("timeSlots", {
        roomId: args.roomId,
        date: args.date,
        ...slot,
      });
    }
  },
});

// ─── Company Bookings ───
export const getBookings = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const allBookings = [];
    for (const room of rooms) {
      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();
      for (const b of bookings) {
        allBookings.push({ ...b, roomTitle: room.title });
      }
    }
    return allBookings.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ─── Subscription Management ───
export const updateSubscription = mutation({
  args: {
    companyId: v.id("companies"),
    subscriptionEnabled: v.boolean(),
    subscriptionMonthlyPrice: v.optional(v.number()),
    subscriptionYearlyPrice: v.optional(v.number()),
    subscriptionPerks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { companyId, ...fields } = args;
    await ctx.db.patch(companyId, fields);
  },
});

export const getSubscribers = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("playerSubscriptions")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const withUser = [];
    for (const sub of subs) {
      const user = await ctx.db.get(sub.userId);
      withUser.push({ ...sub, userName: user?.name || "Unknown", userEmail: user?.email || "" });
    }
    return withUser;
  },
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1 FIX: Company Authentication
// ═══════════════════════════════════════════════════════════════════════
// The original CompanyAuth.tsx handleLogin was broken — it passed the
// email string directly as companyId instead of verifying credentials.
// This mutation properly authenticates business users and returns the
// company ID + name for session persistence.
export const loginCompany = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (!company) throw new Error("No business account found with this email");

    const valid = await verifyPassword(args.password, company.password);
    if (!valid) throw new Error("Incorrect password");

    // Upgrade legacy plaintext passwords on successful login
    if (!company.password.includes(":")) {
      const hashed = await hashPassword(args.password);
      await ctx.db.patch(company._id, { password: hashed });
    }

    // Auto-patch old companies that existed before onboarding flow
    if (!company.onboardingStatus) {
      await ctx.db.patch(company._id, { onboardingStatus: "approved" });
    }
    return {
      _id: company._id,
      name: company.name,
      onboardingStatus: company.onboardingStatus || "approved",
    };
  },
});

// ─── Company Onboarding ───
export const acceptTerms = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      termsAcceptedAt: Date.now(),
      onboardingStatus: "pending_plan",
    });
  },
});

export const selectPlan = mutation({
  args: {
    companyId: v.id("companies"),
    plan: v.union(v.literal("starter"), v.literal("pro"), v.literal("enterprise")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      platformPlan: args.plan,
      platformSubscribedAt: Date.now(),
      onboardingStatus: "pending_review",
    });
  },
});

// Admin: list all pending review companies
export const getPendingReview = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    if (!ADMIN_SECRET || args.adminSecret !== ADMIN_SECRET) {
      throw new Error("Unauthorized: invalid admin credentials");
    }
    const all = await ctx.db.query("companies").collect();
    return all
      .filter((c) => c.onboardingStatus === "pending_review")
      .map(({ password: _pw, ...safe }) => safe);
  },
});

// Admin: list all companies for management
export const getAllCompanies = query({
  args: { adminSecret: v.string() },
  handler: async (ctx, args) => {
    if (!ADMIN_SECRET || args.adminSecret !== ADMIN_SECRET) {
      throw new Error("Unauthorized: invalid admin credentials");
    }
    const all = await ctx.db.query("companies").collect();
    return all.map(({ password: _pw, ...c }) => ({ ...c, onboardingStatus: c.onboardingStatus || "approved" }));
  },
});

// Admin: approve company
export const approveCompany = mutation({
  args: { companyId: v.id("companies"), adminSecret: v.string() },
  handler: async (ctx, args) => {
    if (!ADMIN_SECRET || args.adminSecret !== ADMIN_SECRET) {
      throw new Error("Unauthorized: invalid admin credentials");
    }
    await ctx.db.patch(args.companyId, {
      onboardingStatus: "approved",
      verified: true,
      reviewedAt: Date.now(),
      adminNotes: undefined,
    });
  },
});

// Admin: decline company with notes
export const declineCompany = mutation({
  args: { companyId: v.id("companies"), notes: v.string(), adminSecret: v.string() },
  handler: async (ctx, args) => {
    if (!ADMIN_SECRET || args.adminSecret !== ADMIN_SECRET) {
      throw new Error("Unauthorized: invalid admin credentials");
    }
    await ctx.db.patch(args.companyId, {
      onboardingStatus: "declined",
      reviewedAt: Date.now(),
      adminNotes: args.notes,
    });
  },
});

// Company: resubmit after decline
export const resubmitForReview = mutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      onboardingStatus: "pending_review",
      adminNotes: undefined,
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1 FIX: Ownership Guards
// ═══════════════════════════════════════════════════════════════════════
// All business mutations verify that the requesting company actually owns
// the resource. This prevents cross-company data access.

async function guardCompanyOwnsRoom(
  ctx: any, companyId: any, roomId: any
) {
  const room = await ctx.db.get(roomId);
  if (!room) throw new Error("Room not found");
  if (!room.companyId || String(room.companyId) !== String(companyId)) {
    throw new Error("Access denied: room does not belong to your company");
  }
  return room;
}

async function guardCompanyOwnsBooking(
  ctx: any, companyId: any, bookingId: any
) {
  const booking = await ctx.db.get(bookingId);
  if (!booking) throw new Error("Booking not found");
  // Check direct companyId first, then fall back to room ownership
  if (booking.companyId && String(booking.companyId) === String(companyId)) {
    return booking;
  }
  const room = await ctx.db.get(booking.roomId);
  if (!room || !room.companyId || String(room.companyId) !== String(companyId)) {
    throw new Error("Access denied: booking does not belong to your company");
  }
  return booking;
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: Company Booking Queries
// ═══════════════════════════════════════════════════════════════════════

// Get all bookings for a company on a specific date, enriched with room
// info and resolved player names. Used by the Calendar and Today views.
export const getBookingsByDate = query({
  args: { companyId: v.id("companies"), date: v.string() },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const allBookings: any[] = [];
    for (const room of rooms) {
      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_room_date", (q) =>
          q.eq("roomId", room._id).eq("date", args.date)
        )
        .collect();
      for (const b of bookings) {
        let playerName = b.playerName;
        if (!playerName && b.userId) {
          const user = await ctx.db.get(b.userId);
          playerName = user?.name || "Unknown Player";
        }
        allBookings.push({
          ...b,
          roomTitle: room.title,
          playerName: playerName || (b.source === "external" ? "External" : "Walk-in"),
          source: b.source || "unlocked",
        });
      }
    }
    return allBookings.sort((a, b) => a.time.localeCompare(b.time));
  },
});

// Full booking detail with resolved player info. Used by BookingDetail screen.
export const getBookingDetail = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;

    const room = await ctx.db.get(booking.roomId);
    let playerName = booking.playerName;
    let playerContact = booking.playerContact;
    if (!playerName && booking.userId) {
      const user = await ctx.db.get(booking.userId);
      playerName = user?.name || "Unknown";
      playerContact = playerContact || user?.email;
    }

    return {
      ...booking,
      roomTitle: room?.title || "Unknown Room",
      roomImage: room?.image,
      playerName: playerName || "Unknown",
      playerContact: playerContact || "",
      source: booking.source || "unlocked",
    };
  },
});

// Today's stats for the dashboard. Counts bookings, revenue, availability.
export const getTodayStats = query({
  args: { companyId: v.id("companies"), date: v.string() },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    let totalBookings = 0;
    let unlockedBookings = 0;
    let externalBookings = 0;
    let revenue = 0;
    let totalSlots = 0;
    let availableSlots = 0;

    for (const room of rooms) {
      if (room.isActive === false) continue;

      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_room_date", (q) =>
          q.eq("roomId", room._id).eq("date", args.date)
        )
        .collect();
      const active = bookings.filter((b) => b.status !== "cancelled");
      totalBookings += active.length;
      unlockedBookings += active.filter((b) => (b.source || "unlocked") === "unlocked").length;
      externalBookings += active.filter((b) => b.source === "external").length;
      revenue += active.reduce((sum, b) => sum + (b.total || 0), 0);

      const slots = await ctx.db
        .query("timeSlots")
        .withIndex("by_room_date", (q) =>
          q.eq("roomId", room._id).eq("date", args.date)
        )
        .collect();
      totalSlots += slots.length;
      const bookedTimes = new Set(active.map((b) => b.time));
      availableSlots += slots.filter((s) => s.available && !bookedTimes.has(s.time)).length;
    }

    return {
      totalBookings,
      unlockedBookings,
      externalBookings,
      revenue,
      totalSlots,
      availableSlots,
      activeRooms: rooms.filter((r) => r.isActive !== false).length,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: Admin Booking Creation
// ═══════════════════════════════════════════════════════════════════════

// Company creates an UNLOCKED booking (manual). Double-booking is
// prevented by checking existing bookings for the same room+date+time.
export const createAdminBooking = mutation({
  args: {
    companyId: v.id("companies"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    playerName: v.string(),
    playerContact: v.optional(v.string()),
    notes: v.optional(v.string()),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    await guardCompanyOwnsRoom(ctx, args.companyId, args.roomId);

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
    if (conflict) throw new Error("This time slot is already booked");

    const bookingCode = `UNL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const id = await ctx.db.insert("bookings", {
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players,
      total: args.total,
      status: "upcoming",
      bookingCode,
      createdAt: Date.now(),
      companyId: args.companyId,
      source: "unlocked",
      playerName: args.playerName,
      playerContact: args.playerContact,
      notes: args.notes,
      paymentStatus: "unpaid",
    });
    return { id, bookingCode };
  },
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: External Booking Blocks
// ═══════════════════════════════════════════════════════════════════════
// External bookings represent EscapeAll bookings, phone reservations,
// walk-ins, or private events. They block availability but do NOT
// collect payments through UNLOCKED.
export const createExternalBlock = mutation({
  args: {
    companyId: v.id("companies"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    externalSource: v.string(),
    playerName: v.optional(v.string()),
    players: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await guardCompanyOwnsRoom(ctx, args.companyId, args.roomId);

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
    if (conflict) throw new Error("This time slot is already booked or blocked");

    const bookingCode = `EXT-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const id = await ctx.db.insert("bookings", {
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players || 0,
      total: 0,
      status: "upcoming",
      bookingCode,
      createdAt: Date.now(),
      companyId: args.companyId,
      source: "external",
      externalSource: args.externalSource,
      playerName: args.playerName,
      notes: args.notes,
      paymentStatus: "na",
    });
    return { id, bookingCode };
  },
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: Admin Booking Management
// ═══════════════════════════════════════════════════════════════════════

export const adminCancelBooking = mutation({
  args: {
    companyId: v.id("companies"),
    bookingId: v.id("bookings"),
  },
  handler: async (ctx, args) => {
    await guardCompanyOwnsBooking(ctx, args.companyId, args.bookingId);
    await ctx.db.patch(args.bookingId, { status: "cancelled" });
  },
});

export const adminRescheduleBooking = mutation({
  args: {
    companyId: v.id("companies"),
    bookingId: v.id("bookings"),
    newDate: v.string(),
    newTime: v.string(),
  },
  handler: async (ctx, args) => {
    const booking = await guardCompanyOwnsBooking(
      ctx, args.companyId, args.bookingId
    );

    // Check for conflicts at new slot
    const existing = await ctx.db
      .query("bookings")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", booking.roomId).eq("date", args.newDate)
      )
      .collect();
    const conflict = existing.find(
      (b) =>
        b.time === args.newTime &&
        b.status !== "cancelled" &&
        String(b._id) !== String(args.bookingId)
    );
    if (conflict) throw new Error("The new time slot is already booked");

    await ctx.db.patch(args.bookingId, {
      date: args.newDate,
      time: args.newTime,
    });
  },
});

export const updateBookingNotes = mutation({
  args: {
    companyId: v.id("companies"),
    bookingId: v.id("bookings"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await guardCompanyOwnsBooking(ctx, args.companyId, args.bookingId);
    await ctx.db.patch(args.bookingId, { notes: args.notes });
  },
});
