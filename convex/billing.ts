// Pay-as-you-go platform fees: usage, monthly invoice records, and the
// one-off move of legacy plans onto the new ones. The Stripe calls live in
// billingStripe.ts ("use node"); this file only touches the database.

import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCompany, sessionTokenV } from "./companySession";
import {
  PAYG_CAP_CENTS,
  PAYG_FEE_CENTS,
  bookingEarnsFee,
  currentMonthAthens,
  dateAthens,
  normalizePlan,
  paygAmountCents,
} from "./plans";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// A claim stuck in "creating" this long (action crashed mid-way) may be retried.
const STALE_CLAIM_MS = 60 * 60 * 1000;

/** Bookings in `month` that earn a fee, played on or after `paygSince`. */
async function countFeeBookings(
  ctx: QueryCtx,
  company: Doc<"companies">,
  month: string
): Promise<number> {
  const since = company.paygSince ? dateAthens(company.paygSince) : "";
  const rooms = await ctx.db
    .query("rooms")
    .withIndex("by_company", (q) => q.eq("companyId", company._id))
    .collect();
  let count = 0;
  for (const room of rooms) {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_room_date", (q) =>
        q.eq("roomId", room._id).gte("date", `${month}-01`).lte("date", `${month}-31`)
      )
      .collect();
    for (const b of bookings) {
      if (b.date >= since && bookingEarnsFee(b)) count++;
    }
  }
  return count;
}

// ── Company-facing ─────────────────────────────────────────────────────

/** This month's running pay-as-you-go fee plus recent invoices, for the billing pages. */
export const getPaygUsage = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "billing:getPaygUsage");
    const plan = normalizePlan(company.platformPlan);
    const month = currentMonthAthens();
    const bookingCount = plan === "payg" ? await countFeeBookings(ctx, company, month) : 0;
    const invoices = await ctx.db
      .query("platformFeeInvoices")
      .withIndex("by_company_month", (q) => q.eq("companyId", company._id))
      .order("desc")
      .take(12);
    return {
      plan,
      month,
      bookingCount,
      amountCents: paygAmountCents(bookingCount),
      feeCents: PAYG_FEE_CENTS,
      capCents: PAYG_CAP_CENTS,
      invoices: invoices
        .filter((i) => i.status !== "creating" && i.status !== "failed")
        .map((i) => ({
          month: i.month,
          bookingCount: i.bookingCount,
          amountCents: i.amountCents,
          status: i.status,
          hostedInvoiceUrl: i.hostedInvoiceUrl ?? null,
        })),
    };
  },
});

// ── Monthly invoicing (driven by billingStripe.billPreviousMonth) ─────────

/** Companies on pay-as-you-go that can be billed. Legacy plans are excluded on purpose. */
export const paygCompanyIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<"companies">[]> => {
    const companies = await ctx.db.query("companies").collect();
    return companies
      .filter((c) => c.platformPlan === "payg" && c.onboardingStatus === "approved")
      .map((c) => c._id);
  },
});

/**
 * Reserve the invoice for (company, month). Returns null when there is
 * nothing to bill or it was already billed; otherwise what the action needs.
 */
export const claimInvoice = internalMutation({
  args: { companyId: v.id("companies"), month: v.string() },
  handler: async (ctx, { companyId, month }) => {
    if (!MONTH_RE.test(month)) throw new Error(`Bad month ${month}`);
    if (month >= currentMonthAthens()) throw new Error(`Month ${month} hasn't ended yet`);
    const company = await ctx.db.get(companyId);
    if (!company || company.platformPlan !== "payg") return null;

    const existing = await ctx.db
      .query("platformFeeInvoices")
      .withIndex("by_company_month", (q) => q.eq("companyId", companyId).eq("month", month))
      .first();
    const now = Date.now();
    if (existing) {
      const retryable =
        existing.status === "failed" ||
        (existing.status === "creating" && now - existing.updatedAt > STALE_CLAIM_MS);
      if (!retryable) return null;
      await ctx.db.patch(existing._id, { status: "creating", error: undefined, updatedAt: now });
      return {
        invoiceDocId: existing._id,
        bookingCount: existing.bookingCount,
        amountCents: existing.amountCents,
        stripeInvoiceId: existing.stripeInvoiceId ?? null,
        stripeCustomerId: company.stripeCustomerId ?? null,
        companyName: company.name,
        companyEmail: company.email,
      };
    }

    const bookingCount = await countFeeBookings(ctx, company, month);
    const amountCents = paygAmountCents(bookingCount);
    if (amountCents <= 0) return null;

    const invoiceDocId = await ctx.db.insert("platformFeeInvoices", {
      companyId,
      month,
      bookingCount,
      amountCents,
      status: "creating",
      createdAt: now,
      updatedAt: now,
    });
    return {
      invoiceDocId,
      bookingCount,
      amountCents,
      stripeInvoiceId: null,
      stripeCustomerId: company.stripeCustomerId ?? null,
      companyName: company.name,
      companyEmail: company.email,
    };
  },
});

export const recordInvoice = internalMutation({
  args: {
    invoiceDocId: v.id("platformFeeInvoices"),
    status: v.optional(
      v.union(v.literal("creating"), v.literal("open"), v.literal("paid"), v.literal("void"), v.literal("failed"))
    ),
    stripeInvoiceId: v.optional(v.string()),
    hostedInvoiceUrl: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { invoiceDocId, ...fields }) => {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) updates[k] = val;
    await ctx.db.patch(invoiceDocId, updates);
  },
});

/** Webhook: invoice.paid / invoice.voided for a pay-as-you-go invoice. */
export const setInvoiceStatusByStripeId = internalMutation({
  args: {
    stripeInvoiceId: v.string(),
    status: v.union(v.literal("open"), v.literal("paid"), v.literal("void")),
  },
  handler: async (ctx, { stripeInvoiceId, status }) => {
    const doc = await ctx.db
      .query("platformFeeInvoices")
      .withIndex("by_stripeInvoiceId", (q) => q.eq("stripeInvoiceId", stripeInvoiceId))
      .first();
    if (doc) await ctx.db.patch(doc._id, { status, updatedAt: Date.now() });
  },
});

// ── Moving legacy plans (free/starter/pro/enterprise) to the new ones ────

/**
 * Companies still on a legacy plan. billingStripe.migrateLegacyPlans asks
 * Stripe whether each one's subscription is still running: those are switched
 * when Stripe ends it (customer.subscription.deleted -> pay-as-you-go), so
 * they're never billed twice; the rest move now.
 */
export const legacyPlanCompanies = internalQuery({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").collect();
    return companies
      .filter((c) => c.platformPlan !== "unlimited" && c.platformPlan !== "payg")
      .map((c) => ({
        companyId: c._id,
        name: c.name,
        plan: c.platformPlan ?? null,
        stripeSubscriptionId: c.stripeSubscriptionId ?? null,
      }));
  },
});

export const moveToPayg = internalMutation({
  args: { companyIds: v.array(v.id("companies")) },
  handler: async (ctx, { companyIds }) => {
    const now = Date.now();
    for (const id of companyIds) {
      const c = await ctx.db.get(id);
      if (!c || c.platformPlan === "payg" || c.platformPlan === "unlimited") continue;
      await ctx.db.patch(id, { platformPlan: "payg", paygSince: now });
    }
  },
});
