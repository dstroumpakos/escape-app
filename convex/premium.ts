import { query, mutation, action, internalMutation, internalAction } from "./_generated/server";
import { notifyUser } from "./push";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { getAppleTransaction, getSubscriptionState, bundleId } from "./appStore";
import { rateLimit, HOUR } from "./rateLimit";
import { v } from "convex/values";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { listPublicRooms } from "./rooms";

const PREMIUM_PRICES = {
  monthly: 4.99,
  yearly: 29.99,
};

const EARLY_ACCESS_DAYS = 3;

// ─── Get premium status for a user ───
export const getStatus = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
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
// ─── In-app purchases (checklist item 9) ───
// The app sends the StoreKit transactionId; we ask Apple about it
// (appStore.ts) and give Premium only for a real, active purchase of one of
// our products, until the expiry date Apple reports. One purchase can only
// unlock one UNLOCKED account.

const PRODUCT_PLANS: Record<string, "monthly" | "yearly"> = {
  "com.unlocked.escapeapp.pro.monthly": "monthly",
  "com.unlocked.escapeapp.pro.yearly": "yearly",
};

/** Buy or restore on iOS. Returns the plan and the expiry Apple reports. */
export const verifyApplePurchase = action({
  args: { sessionToken: v.string(), transactionId: v.string() },
  handler: async (ctx, args): Promise<{ success: true; plan: "monthly" | "yearly"; expiresAt: number }> => {
    const { userId } = await ctx.runQuery(internal.userSession.verify, { sessionToken: args.sessionToken });
    const tx = await getAppleTransaction(args.transactionId.trim());
    if (!tx) throw new ConvexError("We couldn't find this purchase at the App Store.");
    if (tx.bundleId !== bundleId()) throw new ConvexError("This purchase is not for UNLOCKED.");
    if (!PRODUCT_PLANS[tx.productId]) throw new ConvexError("This is not an UNLOCKED Premium purchase.");
    // Sandbox purchases (TestFlight, App Review) cost nothing. Accept them only
    // where APPSTORE_ALLOW_SANDBOX=1: test backends, and production only while
    // Apple is reviewing the app.
    if (tx.environment !== "Production" && process.env.APPSTORE_ALLOW_SANDBOX !== "1") {
      throw new ConvexError("Test purchases can't be used here.");
    }
    // Every renewal is a new transaction, so the one the app sent can be an
    // old, expired renewal of a subscription that is still running. Judge the
    // whole subscription by its latest transaction instead.
    const state = await getSubscriptionState(tx.originalTransactionId);
    const current = state ?? {
      transactionId: tx.transactionId,
      productId: tx.productId,
      expiresDate: tx.expiresDate,
      revoked: typeof tx.revocationDate === "number",
    };
    const plan = PRODUCT_PLANS[current.productId];
    if (!plan) throw new ConvexError("This is not an UNLOCKED Premium purchase.");
    if (current.revoked) throw new ConvexError("This purchase was refunded or revoked.");
    if (!current.expiresDate || current.expiresDate <= Date.now()) {
      throw new ConvexError("This subscription has expired.");
    }
    await ctx.runMutation(internal.premium.grantFromStore, {
      userId,
      plan,
      platform: "ios",
      productId: current.productId,
      transactionId: current.transactionId,
      originalTransactionId: tx.originalTransactionId,
      expiresAt: current.expiresDate,
      environment: tx.environment,
    });
    return { success: true, plan, expiresAt: current.expiresDate };
  },
});

export const grantFromStore = internalMutation({
  args: {
    userId: v.id("users"),
    plan: v.union(v.literal("monthly"), v.literal("yearly")),
    platform: v.union(v.literal("ios"), v.literal("android")),
    productId: v.string(),
    transactionId: v.string(),
    originalTransactionId: v.string(),
    expiresAt: v.number(),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("Please sign in again");
    // One store subscription = one UNLOCKED account.
    const sameSub = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_originalTransactionId", (q) => q.eq("originalTransactionId", args.originalTransactionId))
      .collect();
    if (sameSub.some((s) => s.userId !== args.userId)) {
      throw new ConvexError("This purchase is already used by another UNLOCKED account.");
    }
    const now = Date.now();
    const mine = sameSub.find((s) => s.userId === args.userId);
    if (mine) {
      await ctx.db.patch(mine._id, {
        isActive: true,
        endDate: args.expiresAt,
        plan: args.plan,
        productId: args.productId,
        transactionId: args.transactionId,
      });
    } else {
      await ctx.db.insert("premiumSubscriptions", {
        userId: args.userId,
        plan: args.plan,
        price: PREMIUM_PRICES[args.plan],
        startDate: now,
        endDate: args.expiresAt,
        isActive: true,
        platform: args.platform,
        productId: args.productId,
        transactionId: args.transactionId,
        originalTransactionId: args.originalTransactionId,
        environment: args.environment,
      });
      await notifyUser(ctx, {
        userId: args.userId,
        type: "system",
        title: "Welcome to UNLOCKED Premium! 🎉",
        message: `You now have early access to new rooms 3 days before everyone else. Your ${args.plan} plan is active.`,
        read: false,
        createdAt: now,
      });
    }
    await ctx.db.patch(args.userId, {
      isPremium: true,
      premiumSince: user.premiumSince ?? now,
      premiumExpiresAt: args.expiresAt,
    });
  },
});

/**
 * Old app builds: these trusted whatever the app sent, so anyone could get
 * Premium for free. Closed; the app now calls verifyApplePurchase.
 */
const iapArgs = {
  sessionToken: v.optional(v.string()),
  userId: legacyUserIdV, // old app builds; they only get the "please update" message
  plan: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
  productId: v.string(),
  transactionId: v.string(),
  transactionReceipt: v.optional(v.string()),
  platform: v.union(v.literal("ios"), v.literal("android")),
  purchaseToken: v.optional(v.string()),
};
export const subscribeWithIAP = mutation({
  args: iapArgs,
  handler: async () => {
    throw new ConvexError("Please update the UNLOCKED app to buy Premium.");
  },
});
export const restoreWithIAP = mutation({
  args: iapArgs,
  handler: async () => {
    throw new ConvexError("Please update the UNLOCKED app to restore Premium.");
  },
});

// ─── Cancel premium subscription ───
export const cancel = mutation({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);

    // Find active subscription
    const subs = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
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
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    // The same rooms as the website's Discover (rooms.listPublicRooms): hides
    // Inactive, photos-only, unapproved and free-plan rooms.
    const allRooms = await listPublicRooms(ctx);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    let isPremium = false;
    if (args.sessionToken) {
      const user = await optionalUser(ctx, args.sessionToken, args.userId);
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
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    const isPremium = user?.isPremium === true && (user?.premiumExpiresAt ?? 0) > Date.now();
    if (!isPremium) return [];

    // Same public rooms as Discover (rooms.listPublicRooms).
    const allRooms = await listPublicRooms(ctx);
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
        { icon: "pricetag-outline", title: "10% Off Official Merch", desc: "Plus free shipping on every UNLOCKED Official order" },
        { icon: "time-outline", title: "Early Merch Drops", desc: "Buy new drops 48 hours before everyone else" },
        { icon: "storefront-outline", title: "Member Prices at Escape Rooms", desc: "Premium prices on merch from rooms that offer them, plus members-only items" },
        { icon: "gift-outline", title: "Yearly Welcome Gift", desc: "A free sticker pack with your first Official order on the yearly plan" },
      ],
    };
  },
});

// ─── Renewals, expiry and refunds (App Store Server Notifications) ───
// Apple calls /appstore-notifications (http.ts) when a subscription renews,
// expires or is refunded. The notification is only used to know WHICH
// subscription changed: its state is then read from Apple's API with our
// key, so a fake notification can't give anyone Premium.

/** Keeps a flood of (possibly fake) notifications from hammering Apple's API. */
export const notificationRateLimit = internalMutation({
  args: {},
  handler: async (ctx) => {
    await rateLimit(ctx, "appstore:notifications", 1000, HOUR);
  },
});

export const refreshFromApple = internalAction({
  args: { originalTransactionId: v.string() },
  handler: async (ctx, args) => {
    const state = await getSubscriptionState(args.originalTransactionId);
    if (!state) return { updated: false };
    await ctx.runMutation(internal.premium.applyStoreState, {
      originalTransactionId: state.originalTransactionId,
      transactionId: state.transactionId,
      productId: state.productId,
      expiresAt: state.expiresDate ?? 0,
      revoked: state.revoked,
    });
    return { updated: true };
  },
});

export const applyStoreState = internalMutation({
  args: {
    originalTransactionId: v.string(),
    transactionId: v.string(),
    productId: v.string(),
    expiresAt: v.number(),
    revoked: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Only subscriptions already linked to an account (via verifyApplePurchase).
    const rows = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_originalTransactionId", (q) => q.eq("originalTransactionId", args.originalTransactionId))
      .collect();
    const now = Date.now();
    const active = !args.revoked && args.expiresAt > now;
    for (const row of rows) {
      const plan = PRODUCT_PLANS[args.productId] ?? row.plan;
      await ctx.db.patch(row._id, {
        isActive: active,
        endDate: args.revoked ? now : args.expiresAt,
        transactionId: args.transactionId,
        productId: args.productId,
        plan,
      });
      const user = await ctx.db.get(row.userId);
      if (!user) continue;
      await ctx.db.patch(user._id, {
        isPremium: active,
        // Refund: Premium ends now. Otherwise until Apple's expiry date.
        premiumExpiresAt: args.revoked ? now : args.expiresAt,
      });
    }
  },
});
