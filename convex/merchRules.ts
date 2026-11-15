import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════════════
// Merch shop rules (pure, safe to import on the client)
// ═══════════════════════════════════════════════════════════════════════
// Two kinds of seller:
//  - "platform": UNLOCKED Official. Paid into the UNLOCKED Stripe account,
//    shipped by UNLOCKED.
//  - "company":  an escape room's own merch. Paid into the company's own
//    Stripe / Viva account (the same connection as bookings) or at pickup.
//    The company is the seller and hands over or ships the goods.
//
// One order = one seller, because the money goes to different accounts.
//
// Premium perks (see premiumPerks below):
//  - 10% off and free shipping on UNLOCKED Official merch
//  - drops open to Premium 48 hours before everyone else
//  - a Premium discount each company may set on its own merch (0 to 30%)
//  - members-only products
//  - a free welcome gift on the first Official order for yearly members
//
// For everyone: "unlock" products that only players who played or escaped a
// given room can buy.

export const PLATFORM_PREMIUM_DISCOUNT_PERCENT = 10;
export const PREMIUM_EARLY_ACCESS_MS = 48 * 60 * 60 * 1000;
export const MAX_COMPANY_PREMIUM_DISCOUNT = 30;
/** Company merch fee on the pay-as-you-go plan, in percent of paid sales. Unlimited pays none. */
export const PAYG_MERCH_FEE_PERCENT = 5;

/** UNLOCKED Official flat shipping, in cents. Premium ships free. */
export const PLATFORM_SHIPPING_EU_CENTS = 500;
export const PLATFORM_SHIPPING_WORLD_CENTS = 1200;

export const MAX_ITEMS_PER_ORDER = 20;
export const MAX_QTY_PER_LINE = 10;
export const MAX_PRICE_CENTS = 100_000; // €1000
export const MAX_SHIPPING_CENTS = 5_000; // €50
/** How long a player has to finish paying online before stock is released. */
export const MERCH_PAYMENT_WINDOW_MS = 30 * 60 * 1000;

export const WELCOME_GIFT = { title: "UNLOCKED sticker pack", variantLabel: "Welcome gift" };

export const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

/** Countries the address form offers (ISO 3166-1 alpha-2). EU first. */
export const SHIP_COUNTRIES = [
  ...EU_COUNTRIES,
  "GB", "CH", "NO", "IS", "AL", "RS", "ME", "MK", "BA", "TR", "UA", "MD", "GE", "AM", "IL",
  "US", "CA", "MX", "BR", "AR", "CL", "CO", "AU", "NZ", "JP", "KR", "SG", "HK", "TW", "IN",
  "AE", "SA", "QA", "ZA", "EG", "MA", "TH", "MY", "PH", "ID", "VN",
];

export const merchSellerV = v.union(v.literal("platform"), v.literal("company"));
export const merchCategoryV = v.union(
  v.literal("apparel"),
  v.literal("accessories"),
  v.literal("games"),
  v.literal("collectibles"),
  v.literal("other")
);
export const merchProductStatusV = v.union(v.literal("draft"), v.literal("active"), v.literal("archived"));
export const merchUnlockRuleV = v.union(v.literal("played"), v.literal("escaped"));
export const merchDeliveryV = v.union(v.literal("pickup"), v.literal("shipping"));
export const merchPaymentV = v.union(v.literal("online"), v.literal("at_pickup"));
export const merchOrderStatusV = v.union(
  v.literal("pending_payment"), // online payment opened, not confirmed yet
  v.literal("reserved"),        // pay at pickup: goods put aside, not paid
  v.literal("paid"),            // paid online, not handed over yet
  v.literal("ready"),           // ready to collect at the venue
  v.literal("shipped"),
  v.literal("collected"),       // handed over at the venue (paid by then)
  v.literal("cancelled"),
  v.literal("refunded")
);
export const merchVariantV = v.object({
  id: v.string(),
  label: v.string(),
  stock: v.optional(v.number()), // undefined = unlimited
});
export const merchAddressV = v.object({
  name: v.string(),
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  postalCode: v.string(),
  country: v.string(), // ISO-2
  phone: v.optional(v.string()),
});

export type MerchStatus =
  | "pending_payment"
  | "reserved"
  | "paid"
  | "ready"
  | "shipped"
  | "collected"
  | "cancelled"
  | "refunded";

/** Orders that count as a sale (money taken or about to be at pickup). */
export function isPaidStatus(s: MerchStatus): boolean {
  return s === "paid" || s === "ready" || s === "shipped" || s === "collected";
}

/** Orders the seller still has to act on. */
export function isOpenStatus(s: MerchStatus): boolean {
  return s === "reserved" || s === "paid" || s === "ready";
}

/** Status changes a company (or the admin for Official orders) may make. */
export function allowedNextStatuses(
  status: MerchStatus,
  delivery: "pickup" | "shipping",
  payment: "online" | "at_pickup"
): MerchStatus[] {
  switch (status) {
    case "reserved":
      return ["ready", "collected", "cancelled"];
    case "paid":
      return delivery === "pickup" ? ["ready", "collected", "refunded"] : ["shipped", "refunded"];
    case "ready":
      return payment === "at_pickup" ? ["collected", "cancelled"] : ["collected", "refunded"];
    case "shipped":
      return ["refunded"];
    case "collected":
      return payment === "online" ? ["refunded"] : [];
    default:
      return [];
  }
}

export function clampPremiumDiscount(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(MAX_COMPANY_PREMIUM_DISCOUNT, Math.max(0, Math.round(n)));
}

/** Premium discount in percent that applies to a product for this buyer. */
export function premiumDiscountPercent(
  seller: "platform" | "company",
  companyDiscount: number | undefined,
  isPremium: boolean
): number {
  if (!isPremium) return 0;
  return seller === "platform" ? PLATFORM_PREMIUM_DISCOUNT_PERCENT : clampPremiumDiscount(companyDiscount);
}

export function discounted(priceCents: number, percent: number): number {
  return Math.round((priceCents * (100 - percent)) / 100);
}

export function platformShippingCents(country: string, isPremium: boolean): number {
  if (isPremium) return 0;
  return EU_COUNTRIES.includes(country.toUpperCase()) ? PLATFORM_SHIPPING_EU_CENTS : PLATFORM_SHIPPING_WORLD_CENTS;
}

/**
 * When a product can be bought. A drop (releaseAt) opens to Premium
 * PREMIUM_EARLY_ACCESS_MS early.
 */
export function releaseState(
  releaseAt: number | undefined,
  isPremium: boolean,
  now: number
): "open" | "early_access" | "upcoming" {
  if (!releaseAt || releaseAt <= now) return "open";
  if (isPremium && releaseAt - PREMIUM_EARLY_ACCESS_MS <= now) return "early_access";
  return "upcoming";
}

/** Fee UNLOCKED charges a pay-as-you-go company on `salesCents` of paid merch. */
export function merchFeeCents(salesCents: number): number {
  return Math.round((Math.max(0, salesCents) * PAYG_MERCH_FEE_PERCENT) / 100);
}

export function formatEuro(cents: number): string {
  const n = cents / 100;
  return `€${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)}`;
}

/** What Premium gives in the shop, for the shop and Premium pages. */
export const premiumPerks = {
  platformDiscountPercent: PLATFORM_PREMIUM_DISCOUNT_PERCENT,
  freeShipping: true,
  earlyAccessHours: PREMIUM_EARLY_ACCESS_MS / 3_600_000,
  welcomeGiftForYearly: WELCOME_GIFT.title,
};
