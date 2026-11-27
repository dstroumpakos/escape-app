/**
 * Merch shop: products, orders, company portal and admin (default runtime).
 * Payments live in merchPayments.ts (Node); the rules in merchRules.ts.
 *
 * Security notes
 *  - Company functions carry a session token (companySession.ts) and only
 *    ever touch the company's own products and orders.
 *  - Admin functions check the admin email, like reports.ts.
 *  - Prices are always computed here from the product rows; the client only
 *    sends product, variant and quantity.
 *  - An order is only marked paid by markOrderPaid (internal), after the
 *    provider's own API said the money arrived.
 */
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { notifyUser } from "./push";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { sessionTokenV, requireCompany } from "./companySession";
import { requireAdminSession } from "./adminSession";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { dateAthens } from "./plans";
import { rateLimit, HOUR } from "./rateLimit";
import { slotStartMs } from "./reportRules";
import { isOwnStorageUrl } from "./uploads";
import { randomCode } from "./codes";
import {
  MAX_ITEMS_PER_ORDER,
  MAX_PRICE_CENTS,
  MAX_QTY_PER_LINE,
  MAX_SHIPPING_CENTS,
  PREMIUM_EARLY_ACCESS_MS,
  SHIP_COUNTRIES,
  WELCOME_GIFT,
  allowedNextStatuses,
  clampPremiumDiscount,
  discounted,
  isOpenStatus,
  isPaidStatus,
  merchAddressV,
  merchCategoryV,
  merchDeliveryV,
  merchFeeCents,
  merchOrderStatusV,
  merchPaymentV,
  merchProductStatusV,
  merchUnlockRuleV,
  merchVariantV,
  platformShippingCents,
  premiumDiscountPercent,
  premiumPerks,
  releaseState,
  type MerchStatus,
} from "./merchRules";

type Ctx = QueryCtx | MutationCtx;
type Product = Doc<"merchProducts">;
type Order = Doc<"merchOrders">;

// ─── Helpers ───
function isPremiumUser(user: Doc<"users"> | null | undefined, now = Date.now()): boolean {
  return !!user && user.isPremium === true && (user.premiumExpiresAt ?? 0) > now;
}

async function isYearlyPremium(ctx: Ctx, user: Doc<"users">): Promise<boolean> {
  if (!isPremiumUser(user)) return false;
  const subs = await ctx.db
    .query("premiumSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const now = Date.now();
  return subs.some((s) => s.isActive && s.plan === "yearly" && s.endDate > now);
}

// The yearly welcome gift is a physical item, so it waits until the yearly
// subscription has been active this long (past the usual refund window), and
// never comes from a free test (sandbox) purchase unless sandbox is allowed.
const GIFT_AFTER_DAYS = 14;

async function welcomeGiftEligible(ctx: Ctx, user: Doc<"users">): Promise<boolean> {
  if (user.merchWelcomeGiftOrderId || !isPremiumUser(user)) return false;
  const subs = await ctx.db
    .query("premiumSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const now = Date.now();
  const sandboxOk = process.env.APPSTORE_ALLOW_SANDBOX === "1";
  return subs.some(
    (s) =>
      s.isActive &&
      s.plan === "yearly" &&
      s.endDate > now &&
      now - s.startDate >= GIFT_AFTER_DAYS * 24 * 60 * 60 * 1000 &&
      (s.environment !== "Sandbox" || sandboxOk)
  );
}

function companyIsLive(c: Doc<"companies"> | null): c is Doc<"companies"> {
  return !!c && (c.onboardingStatus === undefined || c.onboardingStatus === "approved");
}

function companyTakesOnline(c: Doc<"companies"> | null): boolean {
  return !!c?.paymentProvider && !!process.env.PAYMENT_CREDENTIALS_KEY;
}

function platformTakesOnline(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Has this player played (completed) or escaped the room? */
async function meetsUnlock(ctx: Ctx, userId: Id<"users"> | undefined, p: Product): Promise<boolean> {
  if (!p.unlockRoomId) return true;
  if (!userId) return false;
  const perf = await ctx.db
    .query("bookingPerformance")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const roomPerf = perf.filter((r) => r.roomId === p.unlockRoomId);
  if (p.unlockRule === "escaped") return roomPerf.some((r) => r.escaped);
  if (roomPerf.length > 0) return true;
  const completed = await ctx.db
    .query("bookings")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "completed"))
    .collect();
  return completed.some((b) => b.roomId === p.unlockRoomId);
}

type Viewer = { userId?: Id<"users">; user: Doc<"users"> | null; isPremium: boolean };

async function viewerOf(ctx: Ctx, sessionToken?: string, legacyUserId?: Id<"users">): Promise<Viewer> {
  const user = await optionalUser(ctx, sessionToken, legacyUserId);
  return { userId: user?._id, user, isPremium: isPremiumUser(user) };
}

type SellerInfo = {
  seller: "platform" | "company";
  companyId: Id<"companies"> | null;
  name: string;
  logo: string | null;
  city: string | null;
  premiumDiscountPercent: number;
  pickupNote: string | null;
  onlinePayment: boolean;
};

const PLATFORM_SELLER: Omit<SellerInfo, "onlinePayment"> = {
  seller: "platform",
  companyId: null,
  name: "UNLOCKED Official",
  logo: null,
  city: null,
  premiumDiscountPercent: premiumPerks.platformDiscountPercent,
  pickupNote: null,
};

async function sellerOf(ctx: Ctx, p: Product, cache: Map<string, SellerInfo | null>): Promise<SellerInfo | null> {
  const key = p.seller === "platform" ? "platform" : String(p.companyId);
  if (cache.has(key)) return cache.get(key)!;
  let info: SellerInfo | null = null;
  if (p.seller === "platform") {
    info = { ...PLATFORM_SELLER, onlinePayment: platformTakesOnline() };
  } else if (p.companyId) {
    const c = await ctx.db.get(p.companyId);
    if (companyIsLive(c)) {
      info = {
        seller: "company",
        companyId: c._id,
        name: c.name,
        logo: c.logo || null,
        city: c.city || null,
        premiumDiscountPercent: clampPremiumDiscount(c.merchPremiumDiscountPercent),
        pickupNote: c.merchPickupNote || null,
        onlinePayment: companyTakesOnline(c),
      };
    }
  }
  cache.set(key, info);
  return info;
}

function isListed(p: Product): boolean {
  return p.status === "active" && !p.hiddenByAdmin;
}

/** The public view of a product for one viewer. */
async function viewProduct(
  ctx: Ctx,
  p: Product,
  viewer: Viewer,
  cache: Map<string, SellerInfo | null>
) {
  const seller = await sellerOf(ctx, p, cache);
  if (!seller) return null;
  const now = Date.now();
  const pctForPremium = p.seller === "platform" ? premiumPerks.platformDiscountPercent : seller.premiumDiscountPercent;
  const pct = premiumDiscountPercent(p.seller, seller.premiumDiscountPercent, viewer.isPremium);
  const release = releaseState(p.releaseAt, viewer.isPremium, now);
  const unlocked = await meetsUnlock(ctx, viewer.userId, p);
  const unlockRoom = p.unlockRoomId ? await ctx.db.get(p.unlockRoomId) : null;
  const variants = p.variants.map((x) => ({
    id: x.id,
    label: x.label,
    soldOut: x.stock !== undefined && x.stock <= 0,
    stockLeft: x.stock !== undefined && x.stock <= 5 ? Math.max(0, x.stock) : null,
  }));
  const soldOut = variants.every((x) => x.soldOut);
  let locked: null | "premium_only" | "unlock_played" | "unlock_escaped" | "upcoming" = null;
  if (p.premiumOnly && !viewer.isPremium) locked = "premium_only";
  else if (!unlocked) locked = p.unlockRule === "escaped" ? "unlock_escaped" : "unlock_played";
  else if (release === "upcoming") locked = "upcoming";
  return {
    _id: p._id,
    seller: p.seller,
    sellerName: seller.name,
    companyId: seller.companyId,
    companyLogo: seller.logo,
    companyCity: seller.city,
    pickupNote: seller.pickupNote,
    title: p.title,
    description: p.description,
    category: p.category,
    images: p.images,
    priceCents: p.priceCents,
    yourPriceCents: discounted(p.priceCents, pct),
    yourDiscountPercent: pct,
    premiumDiscountPercent: pctForPremium,
    premiumPriceCents: pctForPremium > 0 ? discounted(p.priceCents, pctForPremium) : null,
    variants,
    pickup: p.seller === "company" && p.pickup,
    shipping: p.shipping,
    shippingCents: p.seller === "platform" ? null : p.shippingCents,
    premiumOnly: !!p.premiumOnly,
    unlockRule: p.unlockRoomId ? p.unlockRule ?? "played" : null,
    unlockRoomId: p.unlockRoomId ?? null,
    unlockRoomTitle: unlockRoom?.title ?? null,
    releaseAt: p.releaseAt ?? null,
    earlyAccessAt: p.releaseAt ? p.releaseAt - PREMIUM_EARLY_ACCESS_MS : null,
    release,
    soldOut,
    locked,
    canBuy: !locked && !soldOut,
    onlinePayment: seller.onlinePayment,
    roomIds: p.roomIds ?? [],
  };
}

export type ProductView = NonNullable<Awaited<ReturnType<typeof viewProduct>>>;

async function listedProducts(ctx: Ctx): Promise<Product[]> {
  const platform = await ctx.db
    .query("merchProducts")
    .withIndex("by_seller_status", (q) => q.eq("seller", "platform").eq("status", "active"))
    .collect();
  const company = await ctx.db
    .query("merchProducts")
    .withIndex("by_seller_status", (q) => q.eq("seller", "company").eq("status", "active"))
    .collect();
  return [...platform, ...company].filter(isListed);
}

function sortProducts<T extends { sortOrder?: number; createdAt: number }>(list: T[]): T[] {
  return list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.createdAt - a.createdAt);
}

async function perksFor(ctx: Ctx, viewer: Viewer) {
  const yearly = viewer.user ? await isYearlyPremium(ctx, viewer.user) : false;
  return {
    isPremium: viewer.isPremium,
    yearly,
    welcomeGiftAvailable: viewer.user ? await welcomeGiftEligible(ctx, viewer.user) : false,
    ...premiumPerks,
  };
}

// ─── Player: browsing ───

/** Everything for the /shop page. */
export const listShop = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const viewer = await viewerOf(ctx, args.sessionToken, args.userId);
    const cache = new Map<string, SellerInfo | null>();
    const products = [];
    for (const p of sortProducts(await listedProducts(ctx))) {
      const view = await viewProduct(ctx, p, viewer, cache);
      // Members-only items stay visible (they sell Premium); unlock items too.
      if (view) products.push(view);
    }
    const sellers = [...cache.values()].filter((s): s is SellerInfo => !!s);
    return { products, sellers, perks: await perksFor(ctx, viewer) };
  },
});

export const getProduct = query({
  args: { productId: v.id("merchProducts"), sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.productId);
    if (!p || !isListed(p)) return null;
    const viewer = await viewerOf(ctx, args.sessionToken, args.userId);
    const cache = new Map<string, SellerInfo | null>();
    const product = await viewProduct(ctx, p, viewer, cache);
    if (!product) return null;
    const siblings = sortProducts(
      (await listedProducts(ctx)).filter(
        (x) => x._id !== p._id && x.seller === p.seller && x.companyId === p.companyId
      )
    ).slice(0, 4);
    const more = [];
    for (const s of siblings) {
      const view = await viewProduct(ctx, s, viewer, cache);
      if (view) more.push(view);
    }
    return { product, more, perks: await perksFor(ctx, viewer) };
  },
});

/** Merch shown on a room page: the company's items for this room, plus its "I escaped" items. */
export const roomMerch = query({
  args: { roomId: v.id("rooms"), sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room?.companyId) return [];
    const viewer = await viewerOf(ctx, args.sessionToken, args.userId);
    const cache = new Map<string, SellerInfo | null>();
    const rows = await ctx.db
      .query("merchProducts")
      .withIndex("by_company", (q) => q.eq("companyId", room.companyId))
      .collect();
    const out = [];
    for (const p of sortProducts(rows.filter(isListed))) {
      const forRoom = !p.roomIds || p.roomIds.length === 0 || p.roomIds.includes(args.roomId);
      if (!forRoom && p.unlockRoomId !== args.roomId) continue;
      const view = await viewProduct(ctx, p, viewer, cache);
      if (view) out.push(view);
    }
    return out;
  },
});

/** A company's shop page. */
export const companyStore = query({
  args: { companyId: v.id("companies"), sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.companyId);
    if (!companyIsLive(c)) return null;
    const viewer = await viewerOf(ctx, args.sessionToken, args.userId);
    const cache = new Map<string, SellerInfo | null>();
    const rows = await ctx.db
      .query("merchProducts")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();
    const products = [];
    for (const p of sortProducts(rows.filter(isListed))) {
      const view = await viewProduct(ctx, p, viewer, cache);
      if (view) products.push(view);
    }
    return {
      company: {
        _id: c._id,
        name: c.name,
        logo: c.logo || null,
        city: c.city || null,
        address: c.address || null,
        premiumDiscountPercent: clampPremiumDiscount(c.merchPremiumDiscountPercent),
        pickupNote: c.merchPickupNote || null,
      },
      products,
      perks: await perksFor(ctx, viewer),
    };
  },
});

export const myPerks = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => perksFor(ctx, await viewerOf(ctx, args.sessionToken)),
});

/** Upcoming games at this company, to pick up an order at. */
export const pickupBookings = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV, companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!me) return [];
    const today = dateAthens(Date.now());
    const rows = await ctx.db
      .query("bookings")
      .withIndex("by_user_status", (q) => q.eq("userId", me._id).eq("status", "upcoming"))
      .collect();
    const out = [];
    for (const b of rows) {
      if (b.date < today) continue;
      const room = await ctx.db.get(b.roomId);
      if (!room || room.companyId !== args.companyId) continue;
      out.push({ _id: b._id, date: b.date, time: b.time, roomTitle: room.title, bookingCode: b.bookingCode });
    }
    return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  },
});

// ─── Player: orders ───

async function orderView(ctx: Ctx, o: Order) {
  const company = o.companyId ? await ctx.db.get(o.companyId) : null;
  const booking = o.bookingId ? await ctx.db.get(o.bookingId) : null;
  const room = booking ? await ctx.db.get(booking.roomId) : null;
  return {
    _id: o._id,
    orderCode: o.orderCode,
    seller: o.seller,
    sellerName: o.seller === "platform" ? PLATFORM_SELLER.name : company?.name ?? "Escape room",
    companyId: o.companyId ?? null,
    companyAddress: company?.address ?? null,
    companyCity: company?.city ?? null,
    pickupNote: company?.merchPickupNote ?? null,
    items: o.items,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    shippingCents: o.shippingCents,
    totalCents: o.totalCents,
    premiumApplied: o.premiumApplied,
    welcomeGift: !!o.welcomeGift,
    delivery: o.delivery,
    payment: o.payment,
    provider: o.paymentProvider ?? null,
    testMode: o.paymentMode === "test",
    status: o.status,
    paidAt: o.paidAt ?? null,
    shippingAddress: o.shippingAddress ?? null,
    trackingCode: o.trackingCode ?? null,
    trackingUrl: o.trackingUrl ?? null,
    sellerNote: o.sellerNote ?? null,
    buyerNote: o.buyerNote ?? null,
    booking: booking
      ? { _id: booking._id, date: booking.date, time: booking.time, status: booking.status, roomTitle: room?.title ?? "" }
      : null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export type OrderView = Awaited<ReturnType<typeof orderView>>;

export const myOrders = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!me) return [];
    const rows = await ctx.db
      .query("merchOrders")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .order("desc")
      .take(100);
    const out = [];
    for (const o of rows) out.push(await orderView(ctx, o));
    return out;
  },
});

export const getMyOrder = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV, orderId: v.id("merchOrders") },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!me) return null;
    const o = await ctx.db.get(args.orderId);
    if (!o || o.userId !== me._id) return null;
    return await orderView(ctx, o);
  },
});

/** Small, non-sensitive state for the payment return pages (no buyer details). */
export const getOrderPaymentState = query({
  args: { orderId: v.id("merchOrders") },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.orderId);
    if (!o) return null;
    return { orderId: o._id, orderCode: o.orderCode, status: o.status, paidAt: o.paidAt ?? null, totalCents: o.totalCents };
  },
});

/** Cancel an order that isn't paid yet (pay at pickup, or an abandoned online payment). */
export const cancelMyOrder = mutation({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV, orderId: v.id("merchOrders") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken, args.userId);
    const o = await ctx.db.get(args.orderId);
    if (!o || o.userId !== me._id) throw new ConvexError("Order not found");
    if (o.paidAt) throw new ConvexError("This order is paid. Contact the shop to return it.");
    if (o.status !== "reserved" && o.status !== "pending_payment" && o.status !== "ready") {
      throw new ConvexError("This order can't be cancelled any more");
    }
    await cancelOrder(ctx, o, "Cancelled by the buyer");
  },
});

// ─── Order creation (called by merchPayments.checkout) ───

const cartItemV = v.object({ productId: v.id("merchProducts"), variantId: v.string(), quantity: v.number() });

function orderCode() {
  // Random (see codes.ts), not from the clock.
  return randomCode("MER");
}

function cleanAddress(a: Doc<"merchOrders">["shippingAddress"]) {
  if (!a) throw new ConvexError("Enter a delivery address");
  const t = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max);
  const out = {
    name: t(a.name, 80),
    line1: t(a.line1, 120),
    line2: t(a.line2, 120) || undefined,
    city: t(a.city, 80),
    postalCode: t(a.postalCode, 20),
    country: t(a.country, 2).toUpperCase(),
    phone: t(a.phone, 30) || undefined,
  };
  if (!out.name || !out.line1 || !out.city || !out.postalCode) throw new ConvexError("Fill in the whole delivery address");
  if (!SHIP_COUNTRIES.includes(out.country)) throw new ConvexError("We can't ship to this country yet");
  return out;
}

export const createOrder = internalMutation({
  args: {
    userId: v.id("users"),
    items: v.array(cartItemV),
    delivery: merchDeliveryV,
    payment: merchPaymentV,
    bookingId: v.optional(v.id("bookings")),
    shippingAddress: v.optional(merchAddressV),
    buyerNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("Please sign in to order");
    if (args.items.length === 0) throw new ConvexError("Your cart is empty");
    if (args.items.length > MAX_ITEMS_PER_ORDER) throw new ConvexError("Too many items in one order");
    const isPremium = isPremiumUser(user);
    const now = Date.now();

    // Load and check every line.
    const lines: { product: Product; variantIdx: number; quantity: number }[] = [];
    for (const it of args.items) {
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QTY_PER_LINE) {
        throw new ConvexError(`Choose between 1 and ${MAX_QTY_PER_LINE} of each item`);
      }
      const product = await ctx.db.get(it.productId);
      if (!product || !isListed(product)) throw new ConvexError("An item in your cart is no longer for sale");
      const variantIdx = product.variants.findIndex((x) => x.id === it.variantId);
      if (variantIdx < 0) throw new ConvexError(`Choose a size or option for ${product.title}`);
      if (product.premiumOnly && !isPremium) throw new ConvexError(`${product.title} is for Premium members only`);
      if (releaseState(product.releaseAt, isPremium, now) === "upcoming") {
        throw new ConvexError(`${product.title} isn't on sale yet`);
      }
      if (!(await meetsUnlock(ctx, user._id, product))) {
        throw new ConvexError(`${product.title} unlocks after you play the room`);
      }
      const existing = lines.find((l) => l.product._id === product._id && l.variantIdx === variantIdx);
      if (existing) existing.quantity += it.quantity;
      else lines.push({ product, variantIdx, quantity: it.quantity });
    }

    // One seller per order.
    const first = lines[0].product;
    if (lines.some((l) => l.product.seller !== first.seller || l.product.companyId !== first.companyId)) {
      throw new ConvexError("One order can only hold items from one shop");
    }
    const seller = first.seller;
    const company = first.companyId ? await ctx.db.get(first.companyId) : null;
    if (seller === "company" && !companyIsLive(company)) throw new ConvexError("This shop isn't open right now");

    // Delivery and payment.
    let shippingAddress: ReturnType<typeof cleanAddress> | undefined;
    let bookingId: Id<"bookings"> | undefined;
    if (args.delivery === "pickup") {
      if (seller !== "company") throw new ConvexError("UNLOCKED Official items are shipped");
      const bad = lines.find((l) => !l.product.pickup);
      if (bad) throw new ConvexError(`${bad.product.title} can't be picked up at the venue`);
      if (args.bookingId) {
        const b = await ctx.db.get(args.bookingId);
        const room = b ? await ctx.db.get(b.roomId) : null;
        if (!b || b.userId !== user._id || !room || room.companyId !== first.companyId) {
          throw new ConvexError("Pick a game of yours at this escape room");
        }
        if (b.status === "cancelled" || b.status === "completed") throw new ConvexError("That game is no longer upcoming");
        bookingId = b._id;
      }
    } else {
      const bad = lines.find((l) => !l.product.shipping);
      if (bad) throw new ConvexError(`${bad.product.title} can't be shipped. Choose pickup at the venue.`);
      shippingAddress = cleanAddress(args.shippingAddress);
    }
    if (args.payment === "at_pickup" && args.delivery !== "pickup") {
      throw new ConvexError("Pay at pickup is only for orders you collect at the venue");
    }

    // Unpaid "pay at pickup" orders hold stock, so cap how many one person can have open.
    await rateLimit(ctx, `merchOrder:${user._id}`, 10, HOUR);
    let reservedUntil: number | undefined;
    if (args.payment === "at_pickup") {
      const mine = await ctx.db
        .query("merchOrders")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      const open = mine.filter((o) => isOpenUnpaidPickup(o)).length;
      if (open >= MAX_OPEN_PICKUP_ORDERS) {
        throw new ConvexError(
          `You already have ${MAX_OPEN_PICKUP_ORDERS} orders waiting for pickup. Collect or cancel one first.`
        );
      }
      // Kept until 2 days after the game it's picked up at, or 14 days.
      if (bookingId) {
        const b = (await ctx.db.get(bookingId))!;
        reservedUntil = slotStartMs(b.date, b.time) + 2 * DAY;
      } else {
        reservedUntil = now + RESERVE_DAYS_NO_GAME * DAY;
      }
    }
    if (args.payment === "online") {
      const online = seller === "platform" ? platformTakesOnline() : companyTakesOnline(company);
      if (!online) {
        throw new ConvexError(
          seller === "platform"
            ? "The UNLOCKED shop can't take payments right now. Please try again later."
            : "This escape room doesn't take online payments. Choose pay at pickup."
        );
      }
    }

    // Stock.
    for (const l of lines) {
      const stock = l.product.variants[l.variantIdx].stock;
      if (stock !== undefined && stock < l.quantity) {
        throw new ConvexError(
          stock <= 0
            ? `${l.product.title} (${l.product.variants[l.variantIdx].label}) is sold out`
            : `Only ${stock} left of ${l.product.title} (${l.product.variants[l.variantIdx].label})`
        );
      }
    }

    // Prices.
    const pct = premiumDiscountPercent(seller, company?.merchPremiumDiscountPercent, isPremium);
    const items: Order["items"] = lines.map((l) => ({
      productId: l.product._id,
      title: l.product.title,
      variantId: l.product.variants[l.variantIdx].id,
      variantLabel: l.product.variants[l.variantIdx].label,
      quantity: l.quantity,
      listPriceCents: l.product.priceCents,
      unitPriceCents: discounted(l.product.priceCents, pct),
      image: l.product.images[0],
    }));
    const subtotalCents = items.reduce((s, i) => s + i.listPriceCents * i.quantity, 0);
    const discountCents = items.reduce((s, i) => s + (i.listPriceCents - i.unitPriceCents) * i.quantity, 0);
    let shippingCents = 0;
    if (args.delivery === "shipping") {
      shippingCents =
        seller === "platform"
          ? platformShippingCents(shippingAddress!.country, isPremium)
          : Math.max(...lines.map((l) => l.product.shippingCents));
    }
    const totalCents = subtotalCents - discountCents + shippingCents;
    if (args.payment === "online" && totalCents < 50) throw new ConvexError("The amount is too small to pay online");

    // Yearly Premium welcome gift, once, with the first Official order.
    let welcomeGift = false;
    if (seller === "platform" && (await welcomeGiftEligible(ctx, user))) {
      welcomeGift = true;
      items.push({
        title: WELCOME_GIFT.title,
        variantId: "gift",
        variantLabel: WELCOME_GIFT.variantLabel,
        quantity: 1,
        listPriceCents: 0,
        unitPriceCents: 0,
      });
    }

    // Reserve stock.
    for (const l of lines) {
      const v0 = l.product.variants[l.variantIdx];
      if (v0.stock === undefined) continue;
      const fresh = await ctx.db.get(l.product._id);
      if (!fresh) continue;
      await ctx.db.patch(fresh._id, {
        variants: fresh.variants.map((x) => (x.id === v0.id ? { ...x, stock: Math.max(0, (x.stock ?? 0) - l.quantity) } : x)),
      });
    }

    const orderId = await ctx.db.insert("merchOrders", {
      orderCode: orderCode(),
      userId: user._id,
      seller,
      companyId: company?._id,
      items,
      subtotalCents,
      discountCents,
      shippingCents,
      totalCents,
      premiumApplied: pct > 0,
      welcomeGift: welcomeGift || undefined,
      delivery: args.delivery,
      bookingId,
      shippingAddress,
      buyerNote: args.buyerNote?.trim().slice(0, 500) || undefined,
      payment: args.payment,
      paymentProvider:
        args.payment === "online" ? (seller === "platform" ? "stripe" : company!.paymentProvider) : undefined,
      paymentMode:
        args.payment === "online"
          ? seller === "platform"
            ? process.env.STRIPE_SECRET_KEY?.startsWith("sk_test") ? "test" : "live"
            : company!.paymentMode
          : undefined,
      status: args.payment === "online" ? "pending_payment" : "reserved",
      reservedUntil,
      createdAt: now,
      updatedAt: now,
    });
    if (welcomeGift) await ctx.db.patch(user._id, { merchWelcomeGiftOrderId: orderId });

    const order = (await ctx.db.get(orderId))!;
    if (order.status === "reserved") await announceOrder(ctx, order);

    return {
      orderId,
      orderCode: order.orderCode,
      seller,
      companyId: company?._id ?? null,
      provider: order.paymentProvider ?? null,
      totalCents,
      status: order.status,
    };
  },
});

// ─── Notifications ───

async function notifyBuyer(ctx: MutationCtx, o: Order, title: string, message: string) {
  await notifyUser(ctx, {
    userId: o.userId,
    type: "system",
    title,
    message,
    read: false,
    createdAt: Date.now(),
    data: { merchOrderId: o._id, orderCode: o.orderCode },
  });
}

/** New order confirmed (paid online, or reserved for pay at pickup): tell both sides. */
async function announceOrder(ctx: MutationCtx, o: Order) {
  const user = await ctx.db.get(o.userId);
  const company = o.companyId ? await ctx.db.get(o.companyId) : null;
  const sellerName = o.seller === "platform" ? PLATFORM_SELLER.name : company?.name ?? "Escape room";
  const lang = ((user as any)?.language as string) || "en";
  const el = lang === "el";
  await notifyBuyer(
    ctx,
    o,
    el ? `Η παραγγελία ${o.orderCode} καταχωρήθηκε` : `Order ${o.orderCode} confirmed`,
    o.delivery === "pickup"
      ? el
        ? `Παραλαβή από ${sellerName}.${o.payment === "at_pickup" ? " Πληρώνεις κατά την παραλαβή." : ""}`
        : `Pick it up at ${sellerName}.${o.payment === "at_pickup" ? " You pay when you collect it." : ""}`
      : el
      ? `Το ${sellerName} θα σου τη στείλει σύντομα.`
      : `${sellerName} will ship it soon.`
  );
  if (!user) return;
  const booking = o.bookingId ? await ctx.db.get(o.bookingId) : null;
  await ctx.scheduler.runAfter(0, internal.email.sendMerchOrderEmails, {
    orderCode: o.orderCode,
    buyerName: user.name,
    buyerEmail: user.email,
    buyerPhone: (user as any).phone || "",
    sellerName,
    sellerEmail: o.seller === "platform" ? process.env.MERCH_ORDERS_EMAIL || "" : company?.email ?? "",
    items: o.items.map((i) => ({
      title: i.title,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
    })),
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    shippingCents: o.shippingCents,
    totalCents: o.totalCents,
    delivery: o.delivery,
    payment: o.payment,
    paid: !!o.paidAt,
    pickupNote: company?.merchPickupNote ?? "",
    pickupAddress: company ? [company.address, company.city].filter(Boolean).join(", ") : "",
    bookingWhen: booking ? `${booking.date} ${booking.time}` : "",
    address: o.shippingAddress
      ? [o.shippingAddress.name, o.shippingAddress.line1, o.shippingAddress.line2, `${o.shippingAddress.postalCode} ${o.shippingAddress.city}`, o.shippingAddress.country]
          .filter(Boolean)
          .join(", ")
      : "",
    lang,
  });
}

const STATUS_TEXT: Partial<Record<MerchStatus, { en: string; el: string }>> = {
  ready: { en: "is ready to collect", el: "είναι έτοιμη για παραλαβή" },
  shipped: { en: "has been shipped", el: "στάλθηκε" },
  collected: { en: "was collected. Enjoy!", el: "παραλήφθηκε. Καλή απόλαυση!" },
  cancelled: { en: "was cancelled", el: "ακυρώθηκε" },
  refunded: { en: "was refunded", el: "επιστράφηκαν τα χρήματα" },
};

/** Collector badge, on the first paid or collected merch order. */
async function awardCollector(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("badges")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (existing.some((b) => b.badgeKey === "collector")) return;
  await ctx.db.insert("badges", {
    userId,
    badgeKey: "collector",
    title: "Collector",
    icon: "🛍️",
    earned: true,
    date: new Date().toISOString().split("T")[0],
    earnedAt: Date.now(),
  });
}

async function releaseStock(ctx: MutationCtx, o: Order) {
  if (o.stockReleased) return;
  for (const it of o.items) {
    if (!it.productId) continue;
    const p = await ctx.db.get(it.productId);
    if (!p) continue;
    await ctx.db.patch(p._id, {
      variants: p.variants.map((x) => (x.id === it.variantId && x.stock !== undefined ? { ...x, stock: x.stock + it.quantity } : x)),
    });
  }
  await ctx.db.patch(o._id, { stockReleased: true });
}

async function cancelOrder(ctx: MutationCtx, o: Order, note?: string) {
  await releaseStock(ctx, o);
  await ctx.db.patch(o._id, {
    status: "cancelled",
    cancelledAt: Date.now(),
    updatedAt: Date.now(),
    sellerNote: note ? [o.sellerNote, note].filter(Boolean).join("\n") : o.sellerNote,
  });
  if (o.welcomeGift) {
    const user = await ctx.db.get(o.userId);
    if (user?.merchWelcomeGiftOrderId === o._id) await ctx.db.patch(user._id, { merchWelcomeGiftOrderId: undefined });
  }
}

/** Shared by the company portal and the admin (Official orders). */
async function changeStatus(
  ctx: MutationCtx,
  o: Order,
  next: MerchStatus,
  extra: { trackingCode?: string; trackingUrl?: string; sellerNote?: string }
) {
  if (next !== o.status && !allowedNextStatuses(o.status, o.delivery, o.payment).includes(next)) {
    throw new ConvexError("This order can't move to that status");
  }
  const now = Date.now();
  const patch: Partial<Order> = { updatedAt: now };
  if (extra.trackingCode !== undefined) patch.trackingCode = extra.trackingCode.trim().slice(0, 80) || undefined;
  if (extra.trackingUrl !== undefined) {
    const u = extra.trackingUrl.trim();
    if (u && !/^https:\/\//i.test(u)) throw new ConvexError("The tracking link must start with https://");
    patch.trackingUrl = u.slice(0, 300) || undefined;
  }
  if (extra.sellerNote !== undefined) patch.sellerNote = extra.sellerNote.trim().slice(0, 500) || undefined;

  if (next !== o.status) {
    if (next === "cancelled") {
      await cancelOrder(ctx, o);
    } else {
      patch.status = next;
      if (next === "shipped") patch.shippedAt = now;
      if (next === "collected") {
        patch.collectedAt = now;
        if (!o.paidAt) patch.paidAt = now; // paid at pickup
        await awardCollector(ctx, o.userId);
      }
      if (next === "refunded") await releaseStock(ctx, o);
    }
  }
  await ctx.db.patch(o._id, patch);

  if (next !== o.status && STATUS_TEXT[next]) {
    const user = await ctx.db.get(o.userId);
    const el = (user as any)?.language === "el";
    const txt = STATUS_TEXT[next]!;
    await notifyBuyer(
      ctx,
      o,
      el ? `Παραγγελία ${o.orderCode}` : `Order ${o.orderCode}`,
      el ? `Η παραγγελία σου ${txt.el}.` : `Your order ${txt.en}.`
    );
  }
}

// ─── Payment plumbing (merchPayments.ts) ───

export const getOrderForPayment = internalQuery({
  args: { orderId: v.id("merchOrders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    const user = await ctx.db.get(order.userId);
    const company = order.companyId ? await ctx.db.get(order.companyId) : null;
    return {
      order,
      sellerName: order.seller === "platform" ? PLATFORM_SELLER.name : company?.name ?? "Escape room",
      buyerName: user?.name ?? "",
      buyerEmail: user?.email ?? "",
      lang: ((user as any)?.language as string) || "en",
    };
  },
});

export const findOrderByVivaOrder = internalQuery({
  args: { orderCode: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("merchOrders")
      .withIndex("by_vivaOrderCode", (q) => q.eq("vivaOrderCode", args.orderCode))
      .first(),
});

export const attachCheckout = internalMutation({
  args: { orderId: v.id("merchOrders"), stripeSessionId: v.optional(v.string()), vivaOrderCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      stripeSessionId: args.stripeSessionId,
      vivaOrderCode: args.vivaOrderCode,
      updatedAt: Date.now(),
    });
  },
});

/** Only call after the provider confirmed the payment. Idempotent. */
export const markOrderPaid = internalMutation({
  args: { orderId: v.id("merchOrders"), reference: v.optional(v.string()), amountCents: v.number() },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.orderId);
    if (!o) return { ok: false as const, reason: "not_found" };
    if (o.paidAt) return { ok: true as const, already: true };
    if (args.amountCents + 1 < o.totalCents) {
      console.error(`[merch] ${o.orderCode}: paid ${args.amountCents}c, expected ${o.totalCents}c`);
      return { ok: false as const, reason: "amount_mismatch" };
    }
    let sellerNote = o.sellerNote;
    if (o.status === "cancelled" && o.stockReleased) {
      // Paid after the window closed: take the stock again and flag it.
      for (const it of o.items) {
        if (!it.productId) continue;
        const p = await ctx.db.get(it.productId);
        if (!p) continue;
        await ctx.db.patch(p._id, {
          variants: p.variants.map((x) =>
            x.id === it.variantId && x.stock !== undefined ? { ...x, stock: Math.max(0, x.stock - it.quantity) } : x
          ),
        });
      }
      sellerNote = [sellerNote, "Paid after the payment window closed. Check the stock before you send it."]
        .filter(Boolean)
        .join("\n");
    }
    await ctx.db.patch(o._id, {
      status: "paid",
      paidAt: Date.now(),
      paymentReference: args.reference,
      stockReleased: false,
      cancelledAt: undefined,
      sellerNote,
      updatedAt: Date.now(),
    });
    await announceOrder(ctx, (await ctx.db.get(o._id))!);
    await awardCollector(ctx, o.userId);
    return { ok: true as const };
  },
});

// ─── Pay at pickup: limits and expiry (checklist item 19) ───

const DAY = 24 * HOUR;
const MAX_OPEN_PICKUP_ORDERS = 3;
const RESERVE_DAYS_NO_GAME = 14;
const RESERVE_DAYS_LEGACY = 30; // orders made before reservedUntil existed

function isOpenUnpaidPickup(o: Order): boolean {
  return o.payment === "at_pickup" && !o.paidAt && (o.status === "reserved" || o.status === "ready");
}

/** Daily (crons.ts): cancel unpaid pickup orders that were never collected, and free the stock. */
export const expireReservations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const status of ["reserved", "ready"] as const) {
      const orders = await ctx.db
        .query("merchOrders")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(500);
      for (const o of orders) {
        if (!isOpenUnpaidPickup(o)) continue;
        const until = o.reservedUntil ?? o.createdAt + RESERVE_DAYS_LEGACY * DAY;
        if (until > now) continue;
        await cancelOrder(ctx, o, "Not collected in time: cancelled automatically.");
        await notifyBuyer(
          ctx,
          o,
          "Order cancelled",
          `Your order ${o.orderCode} wasn't collected in time, so it was cancelled.`
        );
      }
    }
  },
});

/** The payment window passed without a payment: release the stock. */
export const expireOrder = internalMutation({
  args: { orderId: v.id("merchOrders") },
  handler: async (ctx, args) => {
    const o = await ctx.db.get(args.orderId);
    if (!o || o.paidAt || o.status !== "pending_payment") return;
    await cancelOrder(ctx, o);
  },
});

// ─── Company portal ───

const productInputV = {
  title: v.string(),
  description: v.string(),
  category: merchCategoryV,
  images: v.array(v.string()),
  priceCents: v.number(),
  variants: v.array(merchVariantV),
  pickup: v.boolean(),
  shipping: v.boolean(),
  shippingCents: v.number(),
  roomIds: v.optional(v.array(v.id("rooms"))),
  premiumOnly: v.optional(v.boolean()),
  releaseAt: v.optional(v.number()),
  unlockRoomId: v.optional(v.id("rooms")),
  unlockRule: v.optional(merchUnlockRuleV),
  status: merchProductStatusV,
  sortOrder: v.optional(v.number()),
};

type ProductInput = {
  title: string;
  description: string;
  category: Product["category"];
  images: string[];
  priceCents: number;
  variants: Product["variants"];
  pickup: boolean;
  shipping: boolean;
  shippingCents: number;
  roomIds?: Id<"rooms">[];
  premiumOnly?: boolean;
  releaseAt?: number;
  unlockRoomId?: Id<"rooms">;
  unlockRule?: "played" | "escaped";
  status: Product["status"];
  sortOrder?: number;
};

function cleanProduct(input: ProductInput, seller: "platform" | "company") {
  const title = input.title.trim().slice(0, 80);
  if (!title) throw new ConvexError("Give the item a name");
  const description = input.description.trim().slice(0, 2000);
  const images = input.images.map((u) => u.trim()).filter(Boolean);
  if (images.length > 6) throw new ConvexError("Up to 6 photos per item");
  // Only files uploaded to our own Convex storage (checklist item 22).
  if (images.some((u) => !isOwnStorageUrl(u))) throw new ConvexError("Photos must be uploaded images");
  if (!Number.isInteger(input.priceCents) || input.priceCents < 50 || input.priceCents > MAX_PRICE_CENTS) {
    throw new ConvexError("The price must be between €0.50 and €1000");
  }
  if (input.variants.length < 1 || input.variants.length > 20) throw new ConvexError("Add between 1 and 20 sizes or options");
  const seen = new Set<string>();
  const variants = input.variants.map((x, i) => {
    const label = x.label.trim().slice(0, 40);
    if (!label) throw new ConvexError("Every size or option needs a name");
    let id = x.id.trim().slice(0, 40) || `v${i}-${Math.random().toString(36).slice(2, 7)}`;
    if (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    let stock = x.stock;
    if (stock !== undefined) {
      if (!Number.isFinite(stock) || stock < 0) throw new ConvexError("Stock can't be negative");
      stock = Math.min(100_000, Math.floor(stock));
    }
    return { id, label, stock };
  });
  const pickup = seller === "company" && input.pickup;
  const shipping = seller === "platform" ? true : input.shipping;
  if (!pickup && !shipping) throw new ConvexError("Offer pickup at the venue, shipping, or both");
  let shippingCents = 0;
  if (shipping && seller === "company") {
    if (!Number.isInteger(input.shippingCents) || input.shippingCents < 0 || input.shippingCents > MAX_SHIPPING_CENTS) {
      throw new ConvexError("Shipping must be between €0 and €50");
    }
    shippingCents = input.shippingCents;
  }
  if (input.releaseAt !== undefined && (!Number.isFinite(input.releaseAt) || input.releaseAt < 0)) {
    throw new ConvexError("Invalid release date");
  }
  return {
    title,
    description,
    category: input.category,
    images,
    priceCents: input.priceCents,
    variants,
    pickup,
    shipping,
    shippingCents,
    roomIds: input.roomIds && input.roomIds.length ? [...new Set(input.roomIds)] : undefined,
    premiumOnly: input.premiumOnly || undefined,
    releaseAt: input.releaseAt || undefined,
    unlockRoomId: input.unlockRoomId,
    unlockRule: input.unlockRoomId ? input.unlockRule ?? "played" : undefined,
    status: input.status,
    sortOrder: input.sortOrder,
  };
}

async function soldCounts(ctx: Ctx, orders: Order[]) {
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (o.status === "cancelled" || o.status === "refunded") continue;
    for (const i of o.items) if (i.productId) sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.quantity);
  }
  void ctx;
  return sold;
}

export const companyProducts = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "merch:companyProducts");
    const rows = await ctx.db
      .query("merchProducts")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .collect();
    const orders = await ctx.db
      .query("merchOrders")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .collect();
    const sold = await soldCounts(ctx, orders);
    return sortProducts(rows).map((p) => ({ ...p, sold: sold.get(p._id) ?? 0 }));
  },
});

async function assertCompanyRooms(ctx: Ctx, companyId: Id<"companies">, ids: (Id<"rooms"> | undefined)[]) {
  for (const id of ids) {
    if (!id) continue;
    const room = await ctx.db.get(id);
    if (!room || room.companyId !== companyId) throw new ConvexError("Pick one of your own rooms");
  }
}

export const saveProduct = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    productId: v.optional(v.id("merchProducts")),
    ...productInputV,
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "merch:saveProduct");
    const { companyId: _c, sessionToken: _s, productId, ...input } = args;
    const clean = cleanProduct(input, "company");
    await assertCompanyRooms(ctx, company._id, [...(clean.roomIds ?? []), clean.unlockRoomId]);
    const now = Date.now();
    if (productId) {
      const p = await ctx.db.get(productId);
      if (!p || p.companyId !== company._id) throw new ConvexError("Item not found");
      await ctx.db.patch(productId, { ...clean, updatedAt: now });
      return productId;
    }
    return await ctx.db.insert("merchProducts", {
      ...clean,
      seller: "company",
      companyId: company._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setProductStatus = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    productId: v.id("merchProducts"),
    status: merchProductStatusV,
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "merch:setProductStatus");
    const p = await ctx.db.get(args.productId);
    if (!p || p.companyId !== company._id) throw new ConvexError("Item not found");
    await ctx.db.patch(p._id, { status: args.status, updatedAt: Date.now() });
  },
});

/** Deletes an item that was never ordered; otherwise archives it so old orders keep their history. */
export const deleteProduct = mutation({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV, productId: v.id("merchProducts") },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "merch:deleteProduct");
    const p = await ctx.db.get(args.productId);
    if (!p || p.companyId !== company._id) throw new ConvexError("Item not found");
    const orders = await ctx.db
      .query("merchOrders")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .collect();
    if (orders.some((o) => o.items.some((i) => i.productId === p._id))) {
      await ctx.db.patch(p._id, { status: "archived", updatedAt: Date.now() });
      return { archived: true };
    }
    await ctx.db.delete(p._id);
    return { archived: false };
  },
});

async function sellerOrderView(ctx: Ctx, o: Order) {
  const base = await orderView(ctx, o);
  const user = await ctx.db.get(o.userId);
  return {
    ...base,
    buyer: { name: user?.name ?? "", email: user?.email ?? "", phone: (user as any)?.phone ?? "" },
    nextStatuses: allowedNextStatuses(o.status, o.delivery, o.payment),
  };
}

export type SellerOrderView = Awaited<ReturnType<typeof sellerOrderView>>;

export const companyOrders = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "merch:companyOrders");
    const rows = await ctx.db
      .query("merchOrders")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .order("desc")
      .take(300);
    const out = [];
    // Unpaid online orders are noise for the company until they are paid.
    for (const o of rows) if (o.status !== "pending_payment") out.push(await sellerOrderView(ctx, o));
    return out;
  },
});

/** Merch to hand over at one game, for the booking details. */
export const bookingMerch = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV, bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "merch:bookingMerch");
    const rows = await ctx.db
      .query("merchOrders")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    return rows
      .filter((o) => o.companyId === company._id && o.status !== "pending_payment" && o.status !== "cancelled")
      .map((o) => ({
        _id: o._id,
        orderCode: o.orderCode,
        status: o.status,
        payment: o.payment,
        paid: !!o.paidAt,
        totalCents: o.totalCents,
        items: o.items.map((i) => ({ title: i.title, variantLabel: i.variantLabel, quantity: i.quantity })),
      }));
  },
});

export const companyUpdateOrder = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    orderId: v.id("merchOrders"),
    status: merchOrderStatusV,
    trackingCode: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    sellerNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "merch:companyUpdateOrder");
    const o = await ctx.db.get(args.orderId);
    if (!o || o.companyId !== company._id) throw new ConvexError("Order not found");
    await changeStatus(ctx, o, args.status, args);
  },
});

export const companyMerchSettings = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const c = await requireCompany(ctx, args, "merch:companyMerchSettings");
    return {
      premiumDiscountPercent: clampPremiumDiscount(c.merchPremiumDiscountPercent),
      pickupNote: c.merchPickupNote ?? "",
      onlinePayment: companyTakesOnline(c),
      // No merch fee on Unlimited or on the free listing
      plan: c.platformPlan === "unlimited" || c.platformPlan === "listing" ? ("unlimited" as const) : ("payg" as const),
    };
  },
});

export const saveCompanyMerchSettings = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    premiumDiscountPercent: v.number(),
    pickupNote: v.string(),
  },
  handler: async (ctx, args) => {
    const c = await requireCompany(ctx, args, "merch:saveCompanyMerchSettings");
    await ctx.db.patch(c._id, {
      merchPremiumDiscountPercent: clampPremiumDiscount(args.premiumDiscountPercent),
      merchPickupNote: args.pickupNote.trim().slice(0, 200) || undefined,
    });
  },
});

// ─── Pay-as-you-go merch fee (billing.ts) ───

function monthOf(ts: number) {
  return dateAthens(ts).slice(0, 7);
}

/** Paid company merch in `month` (Athens time), counted from the day the company moved to pay-as-you-go. */
export async function merchSalesForMonth(ctx: Ctx, company: Doc<"companies">, month: string) {
  const since = company.paygSince ?? 0;
  const rows = await ctx.db
    .query("merchOrders")
    .withIndex("by_company", (q) => q.eq("companyId", company._id))
    .collect();
  let salesCents = 0;
  let orders = 0;
  for (const o of rows) {
    if (!o.paidAt || !isPaidStatus(o.status) || o.paidAt < since) continue;
    if (monthOf(o.paidAt) !== month) continue;
    salesCents += o.totalCents - o.shippingCents;
    orders++;
  }
  return { salesCents, orders, feeCents: merchFeeCents(salesCents) };
}

export const companyMerchSummary = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const c = await requireCompany(ctx, args, "merch:companyMerchSummary");
    const rows = await ctx.db
      .query("merchOrders")
      .withIndex("by_company", (q) => q.eq("companyId", c._id))
      .collect();
    const today = dateAthens(Date.now());
    let pickupsToday = 0;
    for (const o of rows) {
      if (!o.bookingId || !isOpenStatus(o.status)) continue;
      const b = await ctx.db.get(o.bookingId);
      if (b?.date === today) pickupsToday++;
    }
    const month = monthOf(Date.now());
    const sales = await merchSalesForMonth(ctx, c, month);
    const products = await ctx.db
      .query("merchProducts")
      .withIndex("by_company", (q) => q.eq("companyId", c._id))
      .collect();
    return {
      openOrders: rows.filter((o) => isOpenStatus(o.status)).length,
      pickupsToday,
      month,
      monthSalesCents: sales.salesCents,
      monthOrders: sales.orders,
      monthFeeCents: c.platformPlan === "unlimited" || c.platformPlan === "listing" ? 0 : sales.feeCents,
      activeProducts: products.filter((p) => p.status === "active").length,
    };
  },
});

// ─── Admin ───

export const adminProducts = query({
  args: { sessionToken: v.string(), seller: v.union(v.literal("platform"), v.literal("company")) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);    const rows = (await ctx.db.query("merchProducts").collect()).filter((p) => p.seller === args.seller);
    const orders = await ctx.db.query("merchOrders").collect();
    const sold = await soldCounts(ctx, orders);
    const out = [];
    for (const p of sortProducts(rows)) {
      const c = p.companyId ? await ctx.db.get(p.companyId) : null;
      out.push({ ...p, sold: sold.get(p._id) ?? 0, companyName: c?.name ?? null });
    }
    return out;
  },
});

export const adminSaveProduct = mutation({
  args: { sessionToken: v.string(), productId: v.optional(v.id("merchProducts")), ...productInputV },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const { sessionToken: _a, productId, ...input } = args;
    const clean = cleanProduct({ ...input, unlockRoomId: undefined, roomIds: undefined }, "platform");
    const now = Date.now();
    if (productId) {
      const p = await ctx.db.get(productId);
      if (!p || p.seller !== "platform") throw new ConvexError("Item not found");
      await ctx.db.patch(productId, { ...clean, updatedAt: now });
      return productId;
    }
    return await ctx.db.insert("merchProducts", { ...clean, seller: "platform", createdAt: now, updatedAt: now });
  },
});

export const adminSetProductStatus = mutation({
  args: { sessionToken: v.string(), productId: v.id("merchProducts"), status: merchProductStatusV },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const p = await ctx.db.get(args.productId);
    if (!p || p.seller !== "platform") throw new ConvexError("Item not found");
    await ctx.db.patch(p._id, { status: args.status, updatedAt: Date.now() });
  },
});

/** Hide (or show again) a company's item from the shop. */
export const adminModerateProduct = mutation({
  args: { sessionToken: v.string(), productId: v.id("merchProducts"), hidden: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const p = await ctx.db.get(args.productId);
    if (!p) throw new ConvexError("Item not found");
    await ctx.db.patch(p._id, {
      hiddenByAdmin: args.hidden || undefined,
      adminNote: args.note?.trim().slice(0, 500) || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const adminOrders = query({
  args: { sessionToken: v.string(), seller: v.union(v.literal("platform"), v.literal("company")) },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("merchOrders")
      .withIndex("by_seller", (q) => q.eq("seller", args.seller))
      .order("desc")
      .take(300);
    const out = [];
    for (const o of rows) if (o.status !== "pending_payment") out.push(await sellerOrderView(ctx, o));
    return out;
  },
});

export const adminUpdateOrder = mutation({
  args: {
    sessionToken: v.string(),
    orderId: v.id("merchOrders"),
    status: merchOrderStatusV,
    trackingCode: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    sellerNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const o = await ctx.db.get(args.orderId);
    if (!o || o.seller !== "platform") throw new ConvexError("Order not found");
    await changeStatus(ctx, o, args.status, args);
  },
});

export const adminMerchStats = query({
  args: { sessionToken: v.string()},
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const orders = await ctx.db.query("merchOrders").collect();
    const paid = orders.filter((o) => isPaidStatus(o.status));
    const month = monthOf(Date.now());
    const sum = (list: Order[]) => list.reduce((s, o) => s + o.totalCents, 0);
    const products = await ctx.db.query("merchProducts").collect();
    return {
      officialSalesCents: sum(paid.filter((o) => o.seller === "platform")),
      companySalesCents: sum(paid.filter((o) => o.seller === "company")),
      monthSalesCents: sum(paid.filter((o) => o.paidAt && monthOf(o.paidAt) === month)),
      openOfficialOrders: orders.filter((o) => o.seller === "platform" && isOpenStatus(o.status)).length,
      officialProducts: products.filter((p) => p.seller === "platform" && p.status === "active").length,
      companyProducts: products.filter((p) => p.seller === "company" && p.status === "active").length,
      hiddenProducts: products.filter((p) => p.hiddenByAdmin).length,
      shops: new Set(products.filter((p) => p.seller === "company" && p.status === "active").map((p) => p.companyId)).size,
    };
  },
});

/** Collector badge: number of merch orders the player received or paid. */
export async function merchOrderCount(ctx: Ctx, userId: Id<"users">): Promise<number> {
  const rows = await ctx.db
    .query("merchOrders")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.filter((o) => isPaidStatus(o.status)).length;
}
