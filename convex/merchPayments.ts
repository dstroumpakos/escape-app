"use node";

/**
 * Merch payments (Node runtime).
 *
 *  - UNLOCKED Official orders are paid into the UNLOCKED Stripe account
 *    (STRIPE_SECRET_KEY, same as stripe.ts).
 *  - Company orders are paid into the company's own Stripe / Viva account,
 *    with the keys and helpers bookings already use (companyPayments.ts).
 *
 * Like bookings, an order is marked paid only after the provider's API says
 * it is paid for the right amount: on return, and from scheduled checks in
 * case the player closed the tab. No webhook is needed.
 */
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import Stripe from "stripe";
import { getStripe } from "./stripe";
import {
  VIVA,
  checkUrl,
  loadCreds,
  stripeFor,
  vivaCancelOrder,
  vivaCreateOrder,
  vivaOrderState,
  vivaTransaction,
  type Creds,
  type Mode,
} from "./companyPayments";
import { MERCH_PAYMENT_WINDOW_MS, merchAddressV, merchDeliveryV, merchPaymentV } from "./merchRules";

type VerifyResult = "paid" | "pending" | "unknown";

/** Platform orders use the UNLOCKED key; company orders the company's own. */
async function credsFor(
  ctx: ActionCtx,
  seller: "platform" | "company",
  companyId: Id<"companies"> | undefined
): Promise<{ creds: Creds; mode: Mode; stripe?: Stripe }> {
  if (seller === "platform") {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new ConvexError("The UNLOCKED shop can't take payments right now. Please try again later.");
    return { creds: { provider: "stripe", secretKey: key }, mode: key.startsWith("sk_test") ? "test" : "live", stripe: getStripe() };
  }
  if (!companyId) throw new ConvexError("This order has no shop");
  const { creds, mode } = await loadCreds(ctx, companyId);
  return { creds, mode, stripe: creds.provider === "stripe" ? stripeFor(creds.secretKey) : undefined };
}

async function openCheckout(
  ctx: ActionCtx,
  orderId: Id<"merchOrders">,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const info = await ctx.runQuery(internal.merch.getOrderForPayment, { orderId });
  if (!info) throw new ConvexError("Order not found");
  const o = info.order;
  const { creds, mode, stripe } = await credsFor(ctx, o.seller, o.companyId);
  if (creds.provider !== o.paymentProvider) {
    throw new ConvexError("The shop changed its payment account. Please start the order again.");
  }
  const fill = (u: string) => checkUrl(u).split("{ORDER_ID}").join(orderId);

  let url: string;
  if (creds.provider === "stripe" && stripe) {
    if (o.stripeSessionId) {
      try {
        const old = await stripe.checkout.sessions.retrieve(o.stripeSessionId);
        if (old.status === "open") await stripe.checkout.sessions.expire(o.stripeSessionId);
      } catch {}
    }
    const lineItems: any[] = o.items
      .filter((i) => i.unitPriceCents > 0)
      .map((i) => ({
        price_data: {
          currency: "eur",
          product_data: { name: `${i.title} (${i.variantLabel})` },
          unit_amount: i.unitPriceCents,
        },
        quantity: i.quantity,
      }));
    if (o.shippingCents > 0) {
      lineItems.push({
        price_data: { currency: "eur", product_data: { name: "Shipping" }, unit_amount: o.shippingCents },
        quantity: 1,
      });
    }
    const meta = { source: "unlocked_merch", merchOrderId: orderId, orderCode: o.orderCode };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: info.buyerEmail || undefined,
      client_reference_id: orderId,
      line_items: lineItems,
      metadata: meta,
      payment_intent_data: { description: `UNLOCKED ${o.orderCode} · ${info.sellerName}`, metadata: meta },
      expires_at: Math.floor((Date.now() + MERCH_PAYMENT_WINDOW_MS + 60_000) / 1000),
      success_url: fill(successUrl),
      cancel_url: fill(cancelUrl),
    });
    if (!session.url) throw new ConvexError("Stripe did not return a checkout page");
    await ctx.runMutation(internal.merch.attachCheckout, { orderId, stripeSessionId: session.id });
    url = session.url;
  } else if (creds.provider === "viva") {
    if (o.vivaOrderCode) await vivaCancelOrder(creds, mode, o.vivaOrderCode);
    const what = o.items.map((i) => `${i.quantity}× ${i.title}`).join(", ");
    const orderCode = await vivaCreateOrder(creds, mode, {
      amountCents: o.totalCents,
      customerTrns: `${info.sellerName} · ${what}`,
      merchantTrns: `UNLOCKED ${o.orderCode}`,
      email: info.buyerEmail,
      fullName: info.buyerName,
      lang: info.lang,
    });
    await ctx.runMutation(internal.merch.attachCheckout, { orderId, vivaOrderCode: orderCode });
    // Viva returns to the Success URL on the company's payment source
    // (/booking/viva-return), which also handles merch orders.
    url = `${VIVA[mode].www}/web/checkout?ref=${orderCode}`;
  } else {
    throw new ConvexError("No payment account");
  }

  const ref = await currentRef(ctx, orderId);
  for (const min of [2, 5, 10, 20]) {
    await ctx.scheduler.runAfter(min * 60 * 1000, internal.merchPayments.reconcile, { orderId, ref, final: false });
  }
  await ctx.scheduler.runAfter(MERCH_PAYMENT_WINDOW_MS + 5 * 60 * 1000, internal.merchPayments.reconcile, {
    orderId,
    ref,
    final: true,
  });
  return url;
}

async function currentRef(ctx: ActionCtx, orderId: Id<"merchOrders">) {
  const info = await ctx.runQuery(internal.merch.getOrderForPayment, { orderId });
  return info?.order.stripeSessionId || info?.order.vivaOrderCode || "";
}

/**
 * Place an order. Pay at pickup returns straight away with no URL; online
 * payment returns the provider's checkout page. `{ORDER_ID}` in the return
 * URLs is replaced with the order id.
 */
export const checkout = action({
  args: {
    userId: v.id("users"),
    items: v.array(v.object({ productId: v.id("merchProducts"), variantId: v.string(), quantity: v.number() })),
    delivery: merchDeliveryV,
    payment: merchPaymentV,
    bookingId: v.optional(v.id("bookings")),
    shippingAddress: v.optional(merchAddressV),
    buyerNote: v.optional(v.string()),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ orderId: string; orderCode: string; url: string | null }> => {
    const { successUrl, cancelUrl, ...rest } = args;
    const created = await ctx.runMutation(internal.merch.createOrder, rest);
    if (created.status !== "pending_payment") {
      return { orderId: created.orderId, orderCode: created.orderCode, url: null };
    }
    try {
      const url = await openCheckout(ctx, created.orderId, successUrl, cancelUrl);
      return { orderId: created.orderId, orderCode: created.orderCode, url };
    } catch (e) {
      await ctx.runMutation(internal.merch.expireOrder, { orderId: created.orderId });
      throw e;
    }
  },
});

/** "Pay now" again for an order still waiting for payment. */
export const retryCheckout = action({
  args: { userId: v.id("users"), orderId: v.id("merchOrders"), successUrl: v.string(), cancelUrl: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const info = await ctx.runQuery(internal.merch.getOrderForPayment, { orderId: args.orderId });
    if (!info || info.order.userId !== args.userId) throw new ConvexError("Order not found");
    if (info.order.status !== "pending_payment" || info.order.paidAt) throw new ConvexError("This order isn't waiting for payment");
    if ((await verifyOrder(ctx, args.orderId)) === "paid") throw new ConvexError("This order is already paid");
    return { url: await openCheckout(ctx, args.orderId, args.successUrl, args.cancelUrl) };
  },
});

async function verifyOrder(ctx: ActionCtx, orderId: Id<"merchOrders">, vivaTransactionId?: string): Promise<VerifyResult> {
  const info = await ctx.runQuery(internal.merch.getOrderForPayment, { orderId });
  if (!info) return "unknown";
  const o = info.order;
  if (o.paidAt) return "paid";
  if (o.payment !== "online" || !o.paymentProvider) return "unknown";

  let c: Awaited<ReturnType<typeof credsFor>>;
  try {
    c = await credsFor(ctx, o.seller, o.companyId);
  } catch {
    return "unknown";
  }

  if (c.creds.provider === "stripe" && c.stripe && o.stripeSessionId) {
    const s = await c.stripe.checkout.sessions.retrieve(o.stripeSessionId);
    if (s.payment_status === "paid" && s.metadata?.merchOrderId === orderId) {
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      const r = await ctx.runMutation(internal.merch.markOrderPaid, {
        orderId,
        reference: pi || s.id,
        amountCents: s.amount_total ?? 0,
      });
      return r.ok ? "paid" : "unknown";
    }
    return "pending";
  }

  if (c.creds.provider === "viva" && o.vivaOrderCode) {
    if (vivaTransactionId) {
      const tx = await vivaTransaction(c.creds, c.mode, vivaTransactionId);
      if (tx && tx.statusId === "F" && tx.orderCode === o.vivaOrderCode) {
        const r = await ctx.runMutation(internal.merch.markOrderPaid, {
          orderId,
          reference: vivaTransactionId,
          amountCents: tx.amountCents,
        });
        if (r.ok) return "paid";
      }
    }
    const state = await vivaOrderState(c.creds, c.mode, o.vivaOrderCode);
    if (state.stateId === 3) {
      const r = await ctx.runMutation(internal.merch.markOrderPaid, {
        orderId,
        reference: vivaTransactionId || `order:${o.vivaOrderCode}`,
        amountCents: o.totalCents,
      });
      return r.ok ? "paid" : "unknown";
    }
    return "pending";
  }
  return "pending";
}

/** Called by the order page when the player comes back from Stripe. */
export const confirmReturn = action({
  args: { orderId: v.id("merchOrders") },
  handler: async (ctx, args): Promise<{ state: VerifyResult }> => {
    try {
      return { state: await verifyOrder(ctx, args.orderId) };
    } catch (e) {
      console.error("[merch] confirmReturn", e);
      return { state: "unknown" };
    }
  },
});

/** Called by /booking/viva-return when the Viva order isn't a booking. */
export const confirmVivaReturn = action({
  args: { orderCode: v.string(), transactionId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ orderId: string | null; state: VerifyResult }> => {
    if (!/^\d{6,20}$/.test(args.orderCode)) return { orderId: null, state: "unknown" };
    const order = await ctx.runQuery(internal.merch.findOrderByVivaOrder, { orderCode: args.orderCode });
    if (!order) return { orderId: null, state: "unknown" };
    try {
      return { orderId: order._id, state: await verifyOrder(ctx, order._id, args.transactionId) };
    } catch (e) {
      console.error("[merch] confirmVivaReturn", e);
      return { orderId: order._id, state: "unknown" };
    }
  },
});

/**
 * Scheduled check. Confirms orders whose buyer closed the tab after paying;
 * on the final run, closes the checkout and releases the stock if unpaid.
 */
export const reconcile = internalAction({
  args: { orderId: v.id("merchOrders"), ref: v.string(), final: v.boolean() },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.merch.getOrderForPayment, { orderId: args.orderId });
    if (!info || info.order.paidAt || info.order.status !== "pending_payment") return;
    const ref = info.order.stripeSessionId || info.order.vivaOrderCode || "";
    if (ref !== args.ref) return; // superseded by a retry

    let state: VerifyResult = "unknown";
    try {
      state = await verifyOrder(ctx, args.orderId);
    } catch (e) {
      console.error("[merch] reconcile check failed", e);
    }
    if (state === "paid" || !args.final) return;

    try {
      const c = await credsFor(ctx, info.order.seller, info.order.companyId);
      if (c.creds.provider === "stripe" && c.stripe && info.order.stripeSessionId) {
        const s = await c.stripe.checkout.sessions.retrieve(info.order.stripeSessionId);
        if (s.status === "open") await c.stripe.checkout.sessions.expire(s.id);
      } else if (c.creds.provider === "viva" && info.order.vivaOrderCode) {
        await vivaCancelOrder(c.creds, c.mode, info.order.vivaOrderCode);
      }
      if ((await verifyOrder(ctx, args.orderId)) === "paid") return;
    } catch (e) {
      console.error("[merch] reconcile close failed", e);
    }
    await ctx.runMutation(internal.merch.expireOrder, { orderId: args.orderId });
  },
});
