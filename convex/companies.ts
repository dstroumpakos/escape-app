import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import { hashPassword, verifyPassword } from "./passwordUtils";
import { validateEmail, validatePassword, requireNonEmpty } from "./validation";
import { nt } from "./notificationTexts";

// ─── Admin helper: verify the calling user has isAdmin ───
const ADMIN_EMAILS = ['apple_001386.f@private.relay', 'apple_001386.8@private.relay', 'dstroumpakos@planeraai.app'];

async function requireAdmin(ctx: any, userId: string) {
  const user = await ctx.db.get(userId);
  if (!user || (!user.isAdmin && !ADMIN_EMAILS.includes(user.email))) {
    throw new Error("Unauthorized: admin access required");
  }
  return user;
}

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
      onboardingStatus: "pending_terms",
    });

    // Send welcome email
    await ctx.scheduler.runAfter(0, internal.email.sendCompanyWelcome, {
      companyName: args.name,
      companyEmail: args.email,
    });

    return { id };
  },
});

// ─── Full Registration with Onboarding (matches app flow) ───
export const registerWithOnboarding = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    vatNumber: v.optional(v.string()),
    description: v.string(),
    password: v.string(),
    plan: v.union(v.literal("starter"), v.literal("pro"), v.literal("enterprise")),
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

    const { plan, ...rest } = args;
    const id = await ctx.db.insert("companies", {
      ...rest,
      password: hashedPw,
      logo: "",
      verified: false,
      createdAt: Date.now(),
      onboardingStatus: "pending_review",
      termsAcceptedAt: Date.now(),
      platformPlan: plan,
      platformSubscribedAt: Date.now(),
    });

    // Send welcome email with plan info
    await ctx.scheduler.runAfter(0, internal.email.sendCompanyWelcome, {
      companyName: args.name,
      companyEmail: args.email,
      plan,
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
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    description: v.optional(v.string()),
    logo: v.optional(v.string()),
    subscriptionEnabled: v.optional(v.boolean()),
    autoTranslateEnabled: v.optional(v.boolean()),
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
    const company = await ctx.db.get(args.companyId);
    const plan = company?.platformPlan || "starter";
    const roomLimit = getRoomLimit(plan);

    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const roomIds = rooms.map((r) => r._id);

    let totalBookings = 0;
    let totalRevenue = 0;
    let upcomingBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;
    let avgRating = 0;

    for (const roomId of roomIds) {
      const bookings = await ctx.db
        .query("bookings")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .collect();
      totalBookings += bookings.length;
      totalRevenue += bookings.filter((b) => b.status === "completed").reduce((sum, b) => sum + b.total, 0);
      upcomingBookings += bookings.filter((b) => b.status === "upcoming").length;
      completedBookings += bookings.filter((b) => b.status === "completed").length;
      cancelledBookings += bookings.filter((b) => b.status === "cancelled").length;
    }

    // Average rating across rooms
    const ratedRooms = rooms.filter((r) => r.reviews > 0);
    if (ratedRooms.length > 0) {
      avgRating = ratedRooms.reduce((sum, r) => sum + r.rating, 0) / ratedRooms.length;
    }

    // Base stats (all plans)
    const base = {
      totalRooms: rooms.length,
      activeRooms: rooms.filter((r) => r.isActive !== false).length,
      totalBookings,
      upcomingBookings,
      totalRevenue,
      plan,
      roomLimit,
    };

    // Advanced stats (pro + enterprise only)
    const advanced = (plan === "pro" || plan === "enterprise") ? {
      completedBookings,
      cancelledBookings,
      avgRating: Math.round(avgRating * 10) / 10,
      conversionRate: totalBookings > 0
        ? Math.round((completedBookings / totalBookings) * 100)
        : 0,
      avgRevenuePerBooking: completedBookings > 0
        ? Math.round(totalRevenue / completedBookings)
        : 0,
    } : null;

    // Full analytics (enterprise only)
    let fullAnalytics = null;
    if (plan === "enterprise") {
      // Count platform subscribers (app users with isPremium)
      const allUsers = await ctx.db.query("users").collect();
      const premiumUsers = allUsers.filter((u) => u.isPremium === true);
      const activeSubscribers = premiumUsers.filter(
        (u) => !u.premiumExpiresAt || u.premiumExpiresAt > Date.now()
      ).length;
      const churnedSubscribers = premiumUsers.length - activeSubscribers;

      // Collect ALL bookings across all rooms for deeper analytics
      const allBookings = [];
      const revenuePerRoom = [];
      for (const room of rooms) {
        const roomBookings = await ctx.db
          .query("bookings")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .collect();
        const roomRevenue = roomBookings.filter((b) => b.status === "completed").reduce((sum, b) => sum + b.total, 0);
        revenuePerRoom.push({
          roomId: room._id,
          title: room.title,
          revenue: roomRevenue,
        });
        allBookings.push(...roomBookings);
      }

      // ── Unique players ──
      const uniquePlayerIds = new Set(
        allBookings.filter((b) => b.userId).map((b) => b.userId!.toString())
      );
      const totalUniquePlayers = uniquePlayerIds.size;

      // ── Average group size ──
      const nonCancelledBookings = allBookings.filter((b) => b.status !== "cancelled");
      const avgGroupSize = nonCancelledBookings.length > 0
        ? Math.round((nonCancelledBookings.reduce((sum, b) => sum + b.players, 0) / nonCancelledBookings.length) * 10) / 10
        : 0;

      // ── Total players served ──
      const totalPlayersServed = nonCancelledBookings.reduce((sum, b) => sum + b.players, 0);

      // ── Repeat customers ──
      const playerBookingCount: Record<string, number> = {};
      for (const b of allBookings.filter((b) => b.userId && b.status !== "cancelled")) {
        const key = b.userId!.toString();
        playerBookingCount[key] = (playerBookingCount[key] || 0) + 1;
      }
      const repeatCustomers = Object.values(playerBookingCount).filter((c) => c > 1).length;
      const repeatCustomerRate = totalUniquePlayers > 0
        ? Math.round((repeatCustomers / totalUniquePlayers) * 100)
        : 0;

      // ── Overall escape rate ──
      const today = new Date().toISOString().split("T")[0];
      const pastNonCancelled = allBookings.filter(
        (b) => b.date <= today && b.status !== "cancelled" && b.status !== "pending_payment"
      );
      const completedPast = pastNonCancelled.filter((b) => b.status === "completed").length;
      const escapeRate = pastNonCancelled.length > 0
        ? Math.round((completedPast / pastNonCancelled.length) * 100)
        : 0;

      // ── Most popular day of week ──
      const dayCount: Record<number, number> = {};
      for (const b of nonCancelledBookings) {
        const day = new Date(b.date).getDay(); // 0=Sun..6=Sat
        dayCount[day] = (dayCount[day] || 0) + 1;
      }
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const peakDayNum = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];
      const peakDay = peakDayNum ? dayNames[Number(peakDayNum[0])] : "—";

      // ── Most popular time slot ──
      const timeCount: Record<string, number> = {};
      for (const b of nonCancelledBookings) {
        timeCount[b.time] = (timeCount[b.time] || 0) + 1;
      }
      const peakTimeEntry = Object.entries(timeCount).sort((a, b) => b[1] - a[1])[0];
      const peakTime = peakTimeEntry ? peakTimeEntry[0] : "—";

      // ── Booking source breakdown ──
      const platformBookings = allBookings.filter((b) => b.source !== "external" && b.status !== "cancelled").length;
      const widgetBookings = allBookings.filter((b) => b.source === "external" && b.status !== "cancelled").length;

      // ── Total reviews ──
      let totalReviews = 0;
      for (const room of rooms) {
        totalReviews += room.reviews ?? 0;
      }

      fullAnalytics = {
        totalSubscribers: premiumUsers.length,
        activeSubscribers,
        churnedSubscribers,
        revenuePerRoom,
        totalUniquePlayers,
        avgGroupSize,
        totalPlayersServed,
        repeatCustomerRate,
        escapeRate,
        peakDay,
        peakTime,
        platformBookings,
        widgetBookings,
        totalReviews,
      };
    }

    return { ...base, advanced, fullAnalytics };
  },
});

// ─── Plan limits helper ───
const PLAN_ROOM_LIMITS: Record<string, number> = {
  free: 1,
  starter: 1,
  pro: 2,
  enterprise: Infinity,
};

function getRoomLimit(plan?: string): number {
  return PLAN_ROOM_LIMITS[plan || "starter"] || 1;
}

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

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const getUrlMutation = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
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
    storyTranslations: v.optional(v.object({ en: v.optional(v.string()), el: v.optional(v.string()), nl: v.optional(v.string()) })),
    descriptionTranslations: v.optional(v.object({ en: v.optional(v.string()), el: v.optional(v.string()), nl: v.optional(v.string()) })),
    paymentTerms: v.array(v.union(v.literal("full"), v.literal("deposit_20"), v.literal("pay_on_arrival"))),
    termsOfUse: v.optional(v.string()),
    isSubscriptionOnly: v.optional(v.boolean()),
    bookingMode: v.optional(v.union(v.literal("unlocked_primary"), v.literal("external_primary"))),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    operatingDays: v.optional(v.array(v.number())),
    defaultTimeSlots: v.optional(v.array(v.object({ time: v.string(), price: v.number() }))),
    overflowSlot: v.optional(v.object({ time: v.string(), price: v.number(), pricePerGroup: v.optional(v.array(v.object({ players: v.number(), price: v.number() }))), days: v.array(v.number()) })),
    releaseDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // ── Enforce room limit based on plan ──
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");
    const limit = getRoomLimit(company.platformPlan);
    const existingRooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    if (existingRooms.length >= limit) {
      throw new Error(
        `Room limit reached. Your ${company.platformPlan || "starter"} plan allows up to ${limit} rooms. Upgrade your plan to add more.`
      );
    }

    const id = await ctx.db.insert("rooms", {
      ...args,
      rating: 0,
      reviews: 0,
      isNew: true,
      isFeatured: false,
      isTrending: false,
      isActive: true,
    });

    // ── Notify premium users about the new room (EA Partner Benefit) ──
    if (company.subscriptionEnabled) {
      const allUsers = await ctx.db.query("users").collect();
      const premiumUsers = allUsers.filter((u) => u.isPremium);
      for (const premiumUser of premiumUsers) {
        const lang = premiumUser.language;
        await ctx.db.insert("notifications", {
          userId: premiumUser._id,
          type: "new_room" as any,
          title: nt(lang, "new_room.title", { room: args.title }),
          message: nt(lang, "new_room.message", { company: company.name }),
          read: false,
          createdAt: Date.now(),
          data: { roomId: id },
        });
      }
    }

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
    storyTranslations: v.optional(v.object({ en: v.optional(v.string()), el: v.optional(v.string()), nl: v.optional(v.string()) })),
    descriptionTranslations: v.optional(v.object({ en: v.optional(v.string()), el: v.optional(v.string()), nl: v.optional(v.string()) })),
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
    isFeatured: v.optional(v.boolean()),
    releaseDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { roomId, ...fields } = args;

    // Gate featured listing to Pro+ plans
    if (fields.isFeatured === true) {
      const room = await ctx.db.get(roomId);
      if (room) {
        const company = room.companyId ? await ctx.db.get(room.companyId) : null;
        const plan = company?.platformPlan || "starter";
        if (plan === "starter") {
          throw new Error("Featured listings require a Pro or Enterprise plan. Upgrade to enable this feature.");
        }
      }
    }

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
      platformPlan: company.platformPlan || null,
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
    plan: v.union(v.literal("free"), v.literal("starter"), v.literal("pro"), v.literal("enterprise")),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    const updates: any = {
      platformPlan: args.plan,
      platformSubscribedAt: Date.now(),
    };

    if (company.onboardingStatus === "pending_plan") {
      updates.onboardingStatus = "pending_review";
    }

    await ctx.db.patch(args.companyId, updates);

    // Notify admin of new application
    if (updates.onboardingStatus === "pending_review") {
      await ctx.scheduler.runAfter(0, internal.email.sendNewApplicationNotification, {
        companyName: company.name,
        companyEmail: company.email,
        plan: args.plan,
      });
    }
  },
});

// ─── Discount Codes ───
export const validateDiscountCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const discount = await ctx.db
      .query("discountCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!discount) return { valid: false, error: "invalid_code" };
    if (!discount.isActive) return { valid: false, error: "code_inactive" };
    if (discount.expiresAt && discount.expiresAt < Date.now()) return { valid: false, error: "code_expired" };
    if (discount.maxUses && discount.usedCount >= discount.maxUses) return { valid: false, error: "code_used_up" };

    return {
      valid: true,
      plan: discount.plan,
      period: discount.period,
      durationMonths: discount.durationMonths,
    };
  },
});

export const redeemDiscountCode = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    const discount = await ctx.db
      .query("discountCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (!discount) throw new Error("Invalid discount code");
    if (!discount.isActive) throw new Error("This code is no longer active");
    if (discount.expiresAt && discount.expiresAt < Date.now()) throw new Error("This code has expired");
    if (discount.maxUses && discount.usedCount >= discount.maxUses) throw new Error("This code has been fully redeemed");

    // Increment usage count
    await ctx.db.patch(discount._id, {
      usedCount: discount.usedCount + 1,
    });

    return { plan: discount.plan, period: discount.period, durationMonths: discount.durationMonths };
  },
});

// Admin: list all pending review companies
export const getPendingReview = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.userId);
    const all = await ctx.db.query("companies").collect();
    return all
      .filter((c) => c.onboardingStatus === "pending_review")
      .map(({ password: _pw, ...safe }) => safe);
  },
});

// Admin: list all companies for management
export const getAllCompanies = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.userId);
    const all = await ctx.db.query("companies").collect();
    return all.map(({ password: _pw, ...c }) => ({ ...c, onboardingStatus: c.onboardingStatus || "approved" }));
  },
});

// Admin: approve company
export const approveCompany = mutation({
  args: { companyId: v.id("companies"), adminEmail: v.string() },
  handler: async (ctx, args) => {
    const email = args.adminEmail.toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(email)) throw new Error("Unauthorized: admin access required");
    const company = await ctx.db.get(args.companyId);
    await ctx.db.patch(args.companyId, {
      onboardingStatus: "approved",
      verified: true,
      reviewedAt: Date.now(),
      adminNotes: undefined,
    });

    // Send approved email with plan details
    if (company) {
      await ctx.scheduler.runAfter(0, internal.email.sendCompanyApproved, {
        companyName: company.name,
        companyEmail: company.email,
        plan: company.platformPlan || "starter",
      });
    }
  },
});

// Admin: decline company with notes
export const declineCompany = mutation({
  args: { companyId: v.id("companies"), notes: v.string(), adminEmail: v.string() },
  handler: async (ctx, args) => {
    const email = args.adminEmail.toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(email)) throw new Error("Unauthorized: admin access required");
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
          roomImage: room.image,
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
    playerPhone: v.optional(v.string()),
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
      playerPhone: args.playerPhone,
      notes: args.notes,
      paymentStatus: "unpaid",
    });

    // Send confirmation emails
    const company = await ctx.db.get(args.companyId);
    const room = await ctx.db.get(args.roomId);
    if (args.playerContact || args.playerPhone) {
      await ctx.scheduler.runAfter(0, internal.email.sendBookingEmails, {
        bookingCode,
        playerName: args.playerName,
        playerContact: args.playerContact || "",
        playerPhone: args.playerPhone || "",
        roomTitle: room?.title || "Escape Room",
        date: args.date,
        time: args.time,
        players: args.players,
        total: args.total,
        paymentStatus: "unpaid",
        notes: args.notes,
        companyName: company?.name ?? "Escape Room",
        companyPhone: company?.phone ?? "",
        companyEmail: company?.email ?? "",
      });
    }

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

export const adminCompleteBooking = mutation({
  args: {
    companyId: v.id("companies"),
    bookingId: v.id("bookings"),
  },
  handler: async (ctx, args) => {
    await guardCompanyOwnsBooking(ctx, args.companyId, args.bookingId);
    await ctx.db.patch(args.bookingId, { status: "completed" });
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

// ═══════════════════════════════════════════════════════════════
// ADMIN — Platform-wide login & dashboard
// ═══════════════════════════════════════════════════════════════

/** Admin login — email-only, no password needed (email must be in ADMIN_EMAILS) */
export const adminLogin = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(email)) {
      throw new Error("Not an admin email");
    }
    return { email, isAdmin: true };
  },
});

/** Full platform dashboard — returns every metric the admin needs */
export const getAdminDashboard = query({
  args: { adminEmail: v.string() },
  handler: async (ctx, args) => {
    const email = args.adminEmail.toLowerCase().trim();
    if (!ADMIN_EMAILS.includes(email)) {
      throw new Error("Unauthorized");
    }

    // ── Companies ──
    const allCompanies = await ctx.db.query("companies").collect();
    const companiesSafe = allCompanies.map((c) => {
      const { password: _pw, ...safe } = c;
      return safe;
    });
    const approvedCompanies = allCompanies.filter((c) => c.onboardingStatus === "approved");
    const pendingCompanies = allCompanies.filter(
      (c) => c.onboardingStatus === "pending_review" || c.onboardingStatus === "pending_terms" || c.onboardingStatus === "pending_plan"
    );
    const declinedCompanies = allCompanies.filter((c) => c.onboardingStatus === "declined");

    // Plan breakdown
    const planCounts = { starter: 0, pro: 0, enterprise: 0, none: 0 };
    for (const c of allCompanies) {
      if (c.platformPlan === "starter") planCounts.starter++;
      else if (c.platformPlan === "pro") planCounts.pro++;
      else if (c.platformPlan === "enterprise") planCounts.enterprise++;
      else planCounts.none++;
    }

    // ── Rooms ──
    const allRooms = await ctx.db.query("rooms").collect();
    const activeRooms = allRooms.filter((r) => r.isActive !== false);
    const ratedRooms = allRooms.filter((r) => r.reviews > 0);
    const avgRating = ratedRooms.length > 0
      ? ratedRooms.reduce((sum, r) => sum + r.rating, 0) / ratedRooms.length
      : 0;

    // ── Bookings ──
    const allBookings = await ctx.db.query("bookings").collect();
    const upcomingBookings = allBookings.filter((b) => b.status === "upcoming");
    const completedBookings = allBookings.filter((b) => b.status === "completed");
    const cancelledBookings = allBookings.filter((b) => b.status === "cancelled");
    const totalRevenue = allBookings
      .filter((b) => b.status !== "cancelled")
      .reduce((sum, b) => sum + b.total, 0);

    // Bookings by source
    const unlockedBookings = allBookings.filter((b) => b.source === "unlocked" || !b.source);
    const externalBookings = allBookings.filter((b) => b.source === "external");

    // Revenue by month (last 6 months)
    const now = Date.now();
    const sixMonthsAgo = now - 6 * 30 * 24 * 60 * 60 * 1000;
    const recentBookings = allBookings.filter(
      (b) => b.createdAt > sixMonthsAgo && b.status !== "cancelled"
    );
    const revenueByMonth: Record<string, number> = {};
    const bookingsByMonth: Record<string, number> = {};
    for (const b of recentBookings) {
      const d = new Date(b.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      revenueByMonth[key] = (revenueByMonth[key] || 0) + b.total;
      bookingsByMonth[key] = (bookingsByMonth[key] || 0) + 1;
    }

    // Recent bookings (last 20)
    const recentBookingsList = [...allBookings]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((b) => {
        const room = allRooms.find((r) => String(r._id) === String(b.roomId));
        const company = allCompanies.find(
          (c) => String(c._id) === String(b.companyId)
        );
        return {
          ...b,
          roomTitle: room?.title || "Deleted room",
          companyName: company?.name || "—",
        };
      });

    // ── Users ──
    const allUsers = await ctx.db.query("users").collect();
    const premiumUsers = allUsers.filter((u) => u.isPremium);

    // ── Posts ──
    const allPosts = await ctx.db.query("posts").collect();

    // ── Top companies by bookings ──
    const companyBookingCounts: Record<string, number> = {};
    const companyRevenue: Record<string, number> = {};
    for (const b of allBookings) {
      if (b.companyId && b.status !== "cancelled") {
        const cid = String(b.companyId);
        companyBookingCounts[cid] = (companyBookingCounts[cid] || 0) + 1;
        companyRevenue[cid] = (companyRevenue[cid] || 0) + b.total;
      }
    }
    const topCompanies = Object.entries(companyBookingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cid, count]) => {
        const c = allCompanies.find((co) => String(co._id) === cid);
        return {
          name: c?.name || "Unknown",
          city: c?.city || "",
          bookings: count,
          revenue: companyRevenue[cid] || 0,
          plan: c?.platformPlan || null,
        };
      });

    return {
      companies: {
        total: allCompanies.length,
        approved: approvedCompanies.length,
        pending: pendingCompanies.length,
        declined: declinedCompanies.length,
        plans: planCounts,
        list: companiesSafe,
      },
      rooms: {
        total: allRooms.length,
        active: activeRooms.length,
        avgRating: Math.round(avgRating * 10) / 10,
        totalReviews: ratedRooms.reduce((s, r) => s + r.reviews, 0),
      },
      bookings: {
        total: allBookings.length,
        upcoming: upcomingBookings.length,
        completed: completedBookings.length,
        cancelled: cancelledBookings.length,
        totalRevenue,
        unlocked: unlockedBookings.length,
        external: externalBookings.length,
        revenueByMonth,
        bookingsByMonth,
        recent: recentBookingsList,
      },
      users: {
        total: allUsers.length,
        premium: premiumUsers.length,
      },
      social: {
        totalPosts: allPosts.length,
      },
      topCompanies,
    };
  },
});

// ── Stripe helpers ──────────────────────────────────────────

export const updateStripeCustomer = mutation({
  args: {
    companyId: v.id("companies"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

export const updateStripePaymentStatus = mutation({
  args: {
    companyId: v.id("companies"),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("cancelled"), v.literal("past_due")),
    plan: v.optional(v.union(v.literal("starter"), v.literal("pro"), v.literal("enterprise"))),
    period: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
  },
  handler: async (ctx, args) => {
    const updates: any = { stripePaymentStatus: args.status };
    if (args.plan) updates.platformPlan = args.plan;
    if (args.period) updates.billingPeriod = args.period;
    await ctx.db.patch(args.companyId, updates);
  },
});

export const completeStripePayment = mutation({
  args: {
    companyId: v.id("companies"),
    stripeSubscriptionId: v.string(),
    plan: v.union(v.literal("starter"), v.literal("pro"), v.literal("enterprise")),
    period: v.union(v.literal("monthly"), v.literal("yearly")),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    await ctx.db.patch(args.companyId, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePaymentStatus: "active",
      platformPlan: args.plan,
      billingPeriod: args.period,
      platformSubscribedAt: Date.now(),
      onboardingStatus: "pending_review",
    });

    // Notify admin of new application
    await ctx.scheduler.runAfter(0, internal.email.sendNewApplicationNotification, {
      companyName: company.name,
      companyEmail: company.email,
      plan: args.plan,
    });
  },
});

export const findCompanyByStripeCustomer = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companies")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .first();
  },
});

// Called by the customer.subscription.updated webhook
// Handles plan changes, cancel_at_period_end, and reactivation
export const handleSubscriptionUpdated = mutation({
  args: {
    companyId: v.id("companies"),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("cancelled"), v.literal("past_due")),
    cancelAtPeriodEnd: v.boolean(),
    plan: v.optional(v.union(v.literal("starter"), v.literal("pro"), v.literal("enterprise"))),
    period: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
  },
  handler: async (ctx, args) => {
    const updates: any = {};

    // Map Stripe status to our status
    if (args.cancelAtPeriodEnd) {
      updates.stripePaymentStatus = "cancelled";
    } else if (args.status === "active") {
      updates.stripePaymentStatus = "active";
    } else if (args.status === "past_due") {
      updates.stripePaymentStatus = "past_due";
    }

    // If plan/period changed (upgrade/downgrade via portal)
    if (args.plan) updates.platformPlan = args.plan;
    if (args.period) updates.billingPeriod = args.period;

    await ctx.db.patch(args.companyId, updates);
  },
});
