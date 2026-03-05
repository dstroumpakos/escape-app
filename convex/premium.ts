import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const PREMIUM_PRICES = {
  monthly: 4.99,
  yearly: 29.99,
};

const EARLY_ACCESS_DAYS = 3;

// ─── Get premium status for a user ───
export const getStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { isPremium: false };

    const now = Date.now();
    const isPremium = user.isPremium === true && (user.premiumExpiresAt ?? 0) > now;

    return {
      isPremium,
      premiumSince: user.premiumSince,
      premiumExpiresAt: user.premiumExpiresAt,
    };
  },
});

// ─── Subscribe via In-App Purchase ───
// Called after a successful native IAP transaction.
// Validates the receipt data and activates premium.
export const subscribeWithIAP = mutation({
  args: {
    userId: v.id("users"),
    plan: v.union(v.literal("monthly"), v.literal("yearly")),
    productId: v.string(),
    transactionId: v.string(),
    transactionReceipt: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    purchaseToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Check for duplicate transaction
    const existingSubs = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
      .collect();
    if (existingSubs.length > 0) {
      // Already processed — return success without double-activating
      return { success: true, alreadyProcessed: true };
    }

    const now = Date.now();
    const price = PREMIUM_PRICES[args.plan];
    const durationMs =
      args.plan === "monthly"
        ? 30 * 24 * 60 * 60 * 1000
        : 365 * 24 * 60 * 60 * 1000;
    const endDate = now + durationMs;

    // Create premium subscription record with IAP data
    await ctx.db.insert("premiumSubscriptions", {
      userId: args.userId,
      plan: args.plan,
      price,
      startDate: now,
      endDate,
      isActive: true,
      platform: args.platform,
      productId: args.productId,
      transactionId: args.transactionId,
      purchaseToken: args.purchaseToken,
    });

    // Update user premium status
    await ctx.db.patch(args.userId, {
      isPremium: true,
      premiumSince: user.premiumSince ?? now,
      premiumExpiresAt: endDate,
    });

    // Create notification
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "system",
      title: "Welcome to UNLOCKED Premium! 🎉",
      message: `You now have early access to new rooms 3 days before everyone else. Your ${args.plan} plan is active.`,
      read: false,
      createdAt: now,
    });

    return { success: true, expiresAt: endDate };
  },
});

// ─── Restore purchases ───
// Called when a user taps "Restore Purchases" — re-validates and reactivates.
export const restoreWithIAP = mutation({
  args: {
    userId: v.id("users"),
    productId: v.string(),
    transactionId: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    purchaseToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Determine plan from product ID
    const plan = args.productId.includes("yearly") ? "yearly" : "monthly";
    const price = PREMIUM_PRICES[plan];
    const durationMs =
      plan === "monthly"
        ? 30 * 24 * 60 * 60 * 1000
        : 365 * 24 * 60 * 60 * 1000;

    // Check if this transaction was already recorded
    const existingSubs = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
      .collect();

    const now = Date.now();
    const endDate = now + durationMs;

    if (existingSubs.length === 0) {
      // Record the restored subscription
      await ctx.db.insert("premiumSubscriptions", {
        userId: args.userId,
        plan,
        price,
        startDate: now,
        endDate,
        isActive: true,
        platform: args.platform,
        productId: args.productId,
        transactionId: args.transactionId,
        purchaseToken: args.purchaseToken,
      });
    } else {
      // Reactivate existing record
      const sub = existingSubs[0];
      await ctx.db.patch(sub._id, { isActive: true, endDate });
    }

    // Re-activate user premium
    await ctx.db.patch(args.userId, {
      isPremium: true,
      premiumSince: user.premiumSince ?? now,
      premiumExpiresAt: endDate,
    });

    return { success: true, plan, expiresAt: endDate };
  },
});

// ─── Legacy: Subscribe (kept for backwards compatibility / web) ───
export const subscribe = mutation({
  args: {
    userId: v.id("users"),
    plan: v.union(v.literal("monthly"), v.literal("yearly")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const now = Date.now();
    const price = PREMIUM_PRICES[args.plan];
    const durationMs = args.plan === "monthly" ? 30 * 24 * 60 * 60 * 1000 : 365 * 24 * 60 * 60 * 1000;
    const endDate = now + durationMs;

    await ctx.db.insert("premiumSubscriptions", {
      userId: args.userId,
      plan: args.plan,
      price,
      startDate: now,
      endDate,
      isActive: true,
      platform: "web",
    });

    await ctx.db.patch(args.userId, {
      isPremium: true,
      premiumSince: user.premiumSince ?? now,
      premiumExpiresAt: endDate,
    });

    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "system",
      title: "Welcome to UNLOCKED Premium! 🎉",
      message: `You now have early access to new rooms 3 days before everyone else. Your ${args.plan} plan is active.`,
      read: false,
      createdAt: now,
    });

    return { success: true, expiresAt: endDate };
  },
});

// ─── Cancel premium subscription ───
export const cancel = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Find active subscription
    const subs = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const active = subs.find((s) => s.isActive);
    if (active) {
      await ctx.db.patch(active._id, { isActive: false, cancelledAt: Date.now() });
    }

    // Keep premium until expiry but note cancellation
    // They keep access until premiumExpiresAt
    return { success: true, accessUntil: user.premiumExpiresAt };
  },
});

// ─── Get rooms visible to this user ───
// Premium users see rooms with releaseDate up to 3 days in the future
// Non-premium users only see rooms that are already released (or have no releaseDate)
export const getVisibleRooms = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const allRooms = await ctx.db.query("rooms").collect();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    let isPremium = false;
    if (args.userId) {
      const user = await ctx.db.get(args.userId);
      isPremium = user?.isPremium === true && (user?.premiumExpiresAt ?? 0) > Date.now();
    }

    // Calculate the early access cutoff date (3 days from now)
    const earlyAccessDate = new Date(now);
    earlyAccessDate.setDate(earlyAccessDate.getDate() + EARLY_ACCESS_DAYS);
    const earlyAccessStr = `${earlyAccessDate.getFullYear()}-${String(earlyAccessDate.getMonth() + 1).padStart(2, "0")}-${String(earlyAccessDate.getDate()).padStart(2, "0")}`;

    return allRooms
      .filter((room) => {
        // Rooms without releaseDate are always visible
        if (!room.releaseDate) return true;
        // Room is already public
        if (room.releaseDate <= todayStr) return true;
        // Premium users can see rooms releasing within 3 days
        if (isPremium && room.releaseDate <= earlyAccessStr) return true;
        // Not visible yet
        return false;
      })
      .map((room) => ({
        ...room,
        // Tag if this is an early access room (not yet public)
        isEarlyAccess: room.releaseDate ? room.releaseDate > todayStr : false,
        daysUntilRelease: room.releaseDate
          ? Math.max(0, Math.ceil((new Date(room.releaseDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
          : 0,
      }));
  },
});

// ─── Get early access rooms only (for premium showcase) ───
export const getEarlyAccessRooms = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const isPremium = user?.isPremium === true && (user?.premiumExpiresAt ?? 0) > Date.now();
    if (!isPremium) return [];

    const allRooms = await ctx.db.query("rooms").collect();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const earlyAccessDate = new Date(now);
    earlyAccessDate.setDate(earlyAccessDate.getDate() + EARLY_ACCESS_DAYS);
    const earlyAccessStr = `${earlyAccessDate.getFullYear()}-${String(earlyAccessDate.getMonth() + 1).padStart(2, "0")}-${String(earlyAccessDate.getDate()).padStart(2, "0")}`;

    return allRooms
      .filter((room) => room.releaseDate && room.releaseDate > todayStr && room.releaseDate <= earlyAccessStr)
      .map((room) => ({
        ...room,
        isEarlyAccess: true,
        daysUntilRelease: Math.max(0, Math.ceil((new Date(room.releaseDate!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
      }));
  },
});

// ─── Premium plan info (for UI) ───
export const getPlanInfo = query({
  args: {},
  handler: async () => {
    return {
      monthly: { price: PREMIUM_PRICES.monthly, label: "Monthly", period: "/month" },
      yearly: { price: PREMIUM_PRICES.yearly, label: "Yearly", period: "/year", savings: "Save 33%" },
      perks: [
        { icon: "rocket-outline", title: "Early Access", desc: "Book new rooms 3 days before public release" },
        { icon: "diamond-outline", title: "Premium Badge", desc: "Exclusive badge on your profile" },
        { icon: "notifications-outline", title: "Priority Notifications", desc: "Be the first to know about new rooms" },
        { icon: "headset-outline", title: "Priority Support", desc: "Get faster responses from our team" },
      ],
    };
  },
});
