// Platform plans (what escape-room companies pay UNLOCKED).
//
//  - unlimited: flat €198/month or €1980/year, paid by Stripe subscription.
//  - payg:      €3 per counted booking, capped at €250 per calendar month,
//               invoiced by email on the 1st for the previous month (billing.ts).
//
// Both plans include every feature and unlimited rooms; they differ only in
// how the company pays. The old free/starter/pro/enterprise values are still
// accepted by the schema so existing documents validate until
// billing:migrateLegacyPlans has run; everything reads them as "payg".

export type PlatformPlan = "unlimited" | "payg";

export const UNLIMITED_PRICE_CENTS = { monthly: 19800, yearly: 198000 } as const;
export const PAYG_FEE_CENTS = 300;
export const PAYG_CAP_CENTS = 25000;

export function normalizePlan(plan: string | null | undefined): PlatformPlan {
  return plan === "unlimited" ? "unlimited" : "payg";
}

export function planLabel(plan: string | null | undefined): string {
  return normalizePlan(plan) === "unlimited" ? "Unlimited" : "Pay as you go";
}

/** Fee for a month with `bookingCount` counted bookings, in cents. */
export function paygAmountCents(bookingCount: number): number {
  return Math.min(Math.max(0, bookingCount) * PAYG_FEE_CENTS, PAYG_CAP_CENTS);
}

type FeeBooking = {
  status: string;
  source?: string;
  externalSource?: string;
  date: string;
};

/**
 * A booking earns a pay-as-you-go fee when a player booked it through
 * UNLOCKED (app, website or the company's embedded widget) and it isn't
 * cancelled or still waiting for payment. Bookings the company typed in
 * itself (phone, walk-in, other platforms, blocked slots) are free.
 */
export function bookingEarnsFee(b: FeeBooking): boolean {
  if (b.status !== "upcoming" && b.status !== "completed") return false;
  if (b.source === "external") return b.externalSource === "Website Widget";
  return true; // "unlocked" or unset (older app bookings)
}

/** "YYYY-MM" of the month before `month` ("YYYY-MM"). */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Current month as "YYYY-MM" in Greek time (bookings store local dates). */
export function currentMonthAthens(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(now));
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** "YYYY-MM-DD" for a timestamp in Greek time. */
export function dateAthens(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}
