"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import Stripe from "stripe";
import { startCheckoutImpl, retryCheckoutImpl } from "./companyPayments";
import { UNLIMITED_PRICE_CENTS } from "./plans";

// The only subscription plan is Unlimited (plans.ts); pay-as-you-go needs no
// checkout and is invoiced monthly by billingStripe.ts.
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  unlimited: UNLIMITED_PRICE_CENTS, // €198/mo, €1980/yr
};

const PLAN_NAMES: Record<string, string> = {
  unlimited: "UNLOCKED Unlimited",
};

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

// stripe-node 23's types target API 2026-09-30, which renamed this param to
// allowed_payment_method_types. We're pinned to 2025-02-24.acacia above, where
// Checkout still expects payment_method_types, so keep sending the old name.
const CARD_ONLY = { payment_method_types: ["card"] } as {};

/**
 * Create a Stripe Checkout Session for a company's plan subscription.
 * Returns the checkout URL to redirect the user to.
 */
export const createCheckoutSession = action({
  args: {
    companyId: v.id("companies"),
    sessionToken: v.optional(v.string()),
    // Legacy values are still accepted so old app builds get a clear error.
    plan: v.union(v.literal("unlimited"), v.literal("starter"), v.literal("pro"), v.literal("enterprise")),
    period: v.union(v.literal("monthly"), v.literal("yearly")),
    successUrl: v.string(),
    cancelUrl: v.string(),
    // Ignored: the free period comes from the discount code, checked below.
    // Old clients still send it.
    trialDays: v.optional(v.number()),
    discountCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const stripe = getStripe();

    // Get company details
    // Throws unless the caller holds a session for this company (see companySession.ts)
    const companyId = await ctx.runQuery(internal.companySession.resolveForAction, {
      companyId: args.companyId,
      sessionToken: args.sessionToken,
      fn: "stripe:createCheckoutSession",
    });
    const company = await ctx.runQuery(internal.companies.getByIdInternal, { id: companyId });
    if (!company) throw new Error("Company not found");

    const priceConfig = PLAN_PRICES[args.plan];
    if (!priceConfig) {
      throw new Error("This plan is no longer offered. Please update the app and choose Unlimited or Pay as you go.");
    }
    if (company.platformPlan === "unlimited" && company.stripePaymentStatus === "active") {
      throw new Error("You're already on the Unlimited plan.");
    }

    // Free period from a discount code, validated here rather than trusted from the client.
    let trialDays: number | undefined;
    if (args.discountCode) {
      const discount = await ctx.runQuery(api.companies.validateDiscountCode, { code: args.discountCode });
      if (!discount.valid) throw new Error("This discount code isn't valid.");
      trialDays = (discount.durationMonths || 12) * 30;
    }

    const unitAmount = args.period === "monthly" ? priceConfig.monthly : priceConfig.yearly;

    // Create or reuse Stripe customer
    let customerId = (company as any).stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: company.email,
        name: company.name,
        metadata: {
          companyId: args.companyId,
        },
      });
      customerId = customer.id;

      // Save Stripe customer ID
      await ctx.runMutation(internal.companies.updateStripeCustomer, {
        companyId: args.companyId,
        stripeCustomerId: customerId,
      });
    }

    // Build subscription_data with optional trial
    const subscriptionData: any = {
      metadata: {
        companyId: args.companyId,
        plan: args.plan,
        period: args.period,
      },
    };
    if (trialDays) {
      subscriptionData.trial_period_days = trialDays;
    }

    // Build metadata with optional discount code
    const sessionMetadata: Record<string, string> = {
      companyId: args.companyId,
      plan: args.plan,
      period: args.period,
    };
    if (args.discountCode) {
      sessionMetadata.discountCode = args.discountCode;
    }

    // Create checkout session with a subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      ...CARD_ONLY,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: PLAN_NAMES[args.plan],
              description: `${args.plan.charAt(0).toUpperCase() + args.plan.slice(1)} plan — ${args.period === "monthly" ? "Monthly" : "Yearly"} subscription`,
            },
            unit_amount: unitAmount,
            recurring: {
              interval: args.period === "monthly" ? "month" : "year",
            },
          },
          quantity: 1,
        },
      ],
      metadata: sessionMetadata,
      subscription_data: subscriptionData,
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });

    if (!session.url) throw new Error("Failed to create checkout session");

    // Mark payment as pending. The plan itself only changes once Stripe confirms
    // the checkout (webhook), so an abandoned checkout can't take a
    // pay-as-you-go company off monthly billing.
    await ctx.runMutation(internal.companies.updateStripePaymentStatus, {
      companyId: args.companyId,
      status: "pending",
    });

    return session.url;
  },
});

/**
 * Create a Stripe Customer Portal session so the company can
 * manage their subscription (update payment method, cancel, etc.).
 */
export const createPortalSession = action({
  args: {
    companyId: v.id("companies"),
    sessionToken: v.optional(v.string()),
    returnUrl: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const stripe = getStripe();

    // Throws unless the caller holds a session for this company (see companySession.ts)
    const companyId = await ctx.runQuery(internal.companySession.resolveForAction, {
      companyId: args.companyId,
      sessionToken: args.sessionToken,
      fn: "stripe:createPortalSession",
    });
    const company = await ctx.runQuery(internal.companies.getByIdInternal, { id: companyId });
    if (!company) throw new Error("Company not found");

    const customerId = (company as any).stripeCustomerId;
    if (!customerId) throw new Error("No Stripe customer found for this company");

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: args.returnUrl,
    });

    return session.url;
  },
});

/**
 * Retrieve the current subscription details from Stripe
 * so the billing page can show next billing date, amount, etc.
 */
export const getSubscriptionDetails = action({
  args: {
    companyId: v.id("companies"),
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    id: string;
    status: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
    cancelAt: number | null;
    amount: number;
    currency: string;
    interval: string;
    created: number;
    defaultPaymentMethod: { brand: string | null; last4: string | null } | null;
  } | null> => {
    const stripe = getStripe();

    // Throws unless the caller holds a session for this company (see companySession.ts)
    const companyId = await ctx.runQuery(internal.companySession.resolveForAction, {
      companyId: args.companyId,
      sessionToken: args.sessionToken,
      fn: "stripe:getSubscriptionDetails",
    });
    const company = await ctx.runQuery(internal.companies.getByIdInternal, { id: companyId });
    if (!company) throw new Error("Company not found");

    const subscriptionId = (company as any).stripeSubscriptionId;
    if (!subscriptionId) return null;

    try {
      const sub: any = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method'],
      });

      const item = sub.items?.data?.[0];
      const amount = item?.price?.unit_amount ?? 0;
      const currency = item?.price?.currency ?? "eur";
      const interval = item?.price?.recurring?.interval ?? "month";

      return {
        id: sub.id,
        status: sub.status,
        currentPeriodStart: sub.current_period_start,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        cancelAt: sub.cancel_at,
        amount: amount / 100,
        currency,
        interval,
        created: sub.created,
        defaultPaymentMethod: sub.default_payment_method
          ? typeof sub.default_payment_method === 'string'
            ? null
            : {
                brand: sub.default_payment_method?.card?.brand ?? null,
                last4: sub.default_payment_method?.card?.last4 ?? null,
              }
          : null,
      };
    } catch {
      return null;
    }
  },
});

// ─────────────────────────────────────────────────
// Player-side booking payments
// ─────────────────────────────────────────────────
//
// Player payments now go to each company's OWN Stripe or Viva account
// (see companyPayments.ts). These two entry points stay because the mobile
// app calls them; they forward to the new flow. `total` from the client is
// ignored, the price is computed on the server.

export const createBookingCheckout = action({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    total: v.number(),
    paymentTerms: v.union(
      v.literal("full"),
      v.literal("deposit_20"),
    ),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string; bookingId: string }> => {
    const { url, bookingId } = await startCheckoutImpl(ctx, {
      userId: args.userId,
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players,
      paymentTerms: args.paymentTerms,
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
    });
    return { url, bookingId };
  },
});

export const retryBookingPayment = action({
  args: {
    bookingId: v.id("bookings"),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    return await retryCheckoutImpl(ctx, args);
  },
});


/**
 * Admin: decline a company and cancel their Stripe subscription if one exists.
 */
export const declineCompanyWithCancel = action({
  args: {
    companyId: v.id("companies"),
    notes: v.string(),
    adminEmail: v.string(),
  },
  handler: async (ctx, args) => {
    // Get company to check for subscription
    const company: any = await ctx.runQuery(internal.companies.getByIdInternal, { id: args.companyId });
    if (!company) throw new Error("Company not found");

    // Cancel Stripe subscription if exists
    if (company.stripeSubscriptionId) {
      try {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(company.stripeSubscriptionId);
      } catch (e: any) {
        console.error("[DeclineCompany] Failed to cancel Stripe subscription:", e.message);
      }
    }

    // Run the existing decline mutation
    await ctx.runMutation(api.companies.declineCompany, {
      companyId: args.companyId,
      notes: args.notes,
      adminEmail: args.adminEmail,
    });
  },
});
