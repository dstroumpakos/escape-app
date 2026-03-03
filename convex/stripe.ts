"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import Stripe from "stripe";

// ── Price IDs — these will map plan + period to Stripe prices
// We create prices dynamically via the Stripe API on first use
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 2900, yearly: 29000 },   // in cents: €29/mo, €290/yr
  pro: { monthly: 4900, yearly: 49000 },        // €49/mo, €490/yr
  enterprise: { monthly: 9900, yearly: 99000 }, // €99/mo, €990/yr
};

const PLAN_NAMES: Record<string, string> = {
  starter: "UNLOCKED Starter",
  pro: "UNLOCKED Pro",
  enterprise: "UNLOCKED Enterprise",
};

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

/**
 * Create a Stripe Checkout Session for a company's plan subscription.
 * Returns the checkout URL to redirect the user to.
 */
export const createCheckoutSession = action({
  args: {
    companyId: v.id("companies"),
    plan: v.union(v.literal("starter"), v.literal("pro"), v.literal("enterprise")),
    period: v.union(v.literal("monthly"), v.literal("yearly")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const stripe = getStripe();

    // Get company details
    const company = await ctx.runQuery(api.companies.getById, { id: args.companyId });
    if (!company) throw new Error("Company not found");

    const priceConfig = PLAN_PRICES[args.plan];
    if (!priceConfig) throw new Error("Invalid plan");

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
      await ctx.runMutation(api.companies.updateStripeCustomer, {
        companyId: args.companyId,
        stripeCustomerId: customerId,
      });
    }

    // Create checkout session with a subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
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
      metadata: {
        companyId: args.companyId,
        plan: args.plan,
        period: args.period,
      },
      subscription_data: {
        metadata: {
          companyId: args.companyId,
          plan: args.plan,
          period: args.period,
        },
      },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });

    if (!session.url) throw new Error("Failed to create checkout session");

    // Mark payment as pending
    await ctx.runMutation(api.companies.updateStripePaymentStatus, {
      companyId: args.companyId,
      status: "pending",
      plan: args.plan,
      period: args.period,
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
    returnUrl: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const stripe = getStripe();

    const company = await ctx.runQuery(api.companies.getById, { id: args.companyId });
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

    const company = await ctx.runQuery(api.companies.getById, { id: args.companyId });
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
// Player-side Stripe Checkout for room bookings
// ─────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session for a player booking.
 * The amount depends on the company's payment terms:
 *  - full: charge 100% of booking total + service fee
 *  - deposit_20: charge 20% of booking total + service fee
 *  - pay_on_arrival: charge only the service fee (no Stripe needed, booking created directly)
 *
 * Returns the checkout URL and bookingId.
 */
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
    const stripe = getStripe();

    // Get room + user info
    const room = await ctx.runQuery(api.rooms.getById, { id: args.roomId });
    if (!room) throw new Error("Room not found");

    const user = await ctx.runQuery(api.users.getById, { userId: args.userId });
    if (!user) throw new Error("User not found");

    // Calculate charge amount
    const serviceFee = 399; // €3.99 in cents
    let chargeAmount: number; // in cents
    let description: string;

    if (args.paymentTerms === "full") {
      chargeAmount = Math.round(args.total * 100) + serviceFee;
      description = `Full payment for ${room.title}`;
    } else {
      // deposit_20
      const deposit = Math.round(args.total * 0.2 * 100);
      chargeAmount = deposit + serviceFee;
      description = `20% deposit for ${room.title}`;
    }

    // Create the booking in "pending" state first
    const { id: bookingId, bookingCode } = await ctx.runMutation(api.bookings.create, {
      userId: args.userId,
      roomId: args.roomId,
      date: args.date,
      time: args.time,
      players: args.players,
      total: args.total,
      paymentTerms: args.paymentTerms,
    }) as { id: string; bookingCode: string };

    // Create Stripe checkout session (one-time payment)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: room.title,
              description,
            },
            unit_amount: chargeAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "booking",
        bookingId,
        bookingCode,
        paymentTerms: args.paymentTerms,
        userId: args.userId,
        roomId: args.roomId,
      },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });

    if (!session.url) throw new Error("Failed to create checkout session");

    // Store session ID on the booking
    await ctx.runMutation(api.bookings.updateStripeSession, {
      bookingId: bookingId as any,
      stripeSessionId: session.id,
    });

    return { url: session.url, bookingId };
  },
});
