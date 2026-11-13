import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { verifyStripeSignature } from "./stripeSignature";

const http = httpRouter();

// ── Widget JS Handler ──
const widgetHandler = httpAction(async (ctx) => {
  const bundle = await ctx.runQuery(api.widget.getBundle);

  if (!bundle) {
    return new Response("// Widget bundle not uploaded yet", {
      status: 404,
      headers: {
        "Content-Type": "application/javascript",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response(bundle.content, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
});

const corsHandler = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
});

// ── Stripe Webhook Handler ──
const stripeWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();

  // Only act on events Stripe actually signed. Without this anyone could POST
  // a fake checkout.session.completed and activate a paid plan.
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // 500 (not 400) so Stripe keeps retrying until the secret is configured.
    console.error("[Webhook] STRIPE_WEBHOOK_SECRET is not set; refusing event");
    return new Response("Webhook secret not configured", { status: 500 });
  }
  const valid = await verifyStripeSignature(body, request.headers.get("stripe-signature"), secret);
  if (!valid) {
    console.warn("[Webhook] Rejected event with missing or invalid Stripe-Signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = event.type;

  if (eventType === "checkout.session.completed") {
    const session = event.data.object;

    // ── Booking payment checkout ──
    // Player payments now go to each company's own Stripe/Viva account and are
    // confirmed by asking the provider (companyPayments.ts), never by this
    // webhook, which only handles UNLOCKED's own platform billing.
    if (session.metadata?.type === "booking") {
      console.warn("[Webhook] Ignoring booking checkout event", session.id);
    } else {
      // ── Company subscription checkout ──
      const companyId = session.metadata?.companyId;
      const plan = session.metadata?.plan;
      const period = session.metadata?.period;
      const subscriptionId = session.subscription;
      const amountTotal = session.amount_total; // in cents

      if (companyId && plan && period && subscriptionId) {
        // Every subscription checkout is the Unlimited plan.
        await ctx.runMutation(internal.companies.completeStripePayment, {
          companyId,
          stripeSubscriptionId: subscriptionId,
          period,
        });

        // If a discount code was used, increment its usage
        const discountCode = session.metadata?.discountCode;
        if (discountCode) {
          try {
            await ctx.runMutation(internal.companies.redeemDiscountCode, {
              code: discountCode,
            });
          } catch (e) {
            console.error("[Webhook] Failed to redeem discount code:", e);
          }
        }

        // Send subscription receipt to company
        try {
          const company = await ctx.runQuery(internal.companies.getByIdInternal, { id: companyId as any });
          if (company) {
            await ctx.runAction(internal.email.sendSubscriptionReceipt, {
              companyName: company.name,
              companyEmail: company.email,
              plan: "unlimited",
              period,
              amount: amountTotal ? amountTotal / 100 : 0,
            });
          }
        } catch (e) {
          console.error("[Webhook] Failed to send subscription receipt:", e);
        }
      }
    }
  } else if (eventType === "customer.subscription.updated") {
    // Handles: billing period changes, cancel_at_period_end, reactivation from portal
    const subscription = event.data.object;
    const customerId = subscription.customer;
    if (customerId) {
      const company = await ctx.runQuery(internal.companies.findCompanyByStripeCustomer, {
        stripeCustomerId: customerId,
      });
      if (company) {
        // Detect plan + period from the subscription items
        const item = subscription.items?.data?.[0];
        const interval = item?.price?.recurring?.interval; // "month" or "year"
        const period = interval === "year" ? "yearly" : "monthly";

        await ctx.runMutation(internal.companies.handleSubscriptionUpdated, {
          companyId: company._id,
          status: subscription.status === "active" ? "active"
            : subscription.status === "past_due" ? "past_due"
            : "active",
          cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
          period,
        });
      }
    }
  } else if (eventType === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    if (customerId) {
      const company = await ctx.runQuery(internal.companies.findCompanyByStripeCustomer, {
        stripeCustomerId: customerId,
      });
      if (company) {
        // Subscription over: the company continues on pay-as-you-go.
        await ctx.runMutation(internal.companies.handleSubscriptionEnded, {
          companyId: company._id,
          stripeSubscriptionId: subscription.id,
        });
      }
    }
  } else if (eventType === "invoice.paid" || eventType === "invoice.voided") {
    // Pay-as-you-go fee invoices (billingStripe.ts) carry metadata.type "payg_fee".
    const invoice = event.data.object;
    if (invoice.metadata?.type === "payg_fee" && invoice.id) {
      await ctx.runMutation(internal.billing.setInvoiceStatusByStripeId, {
        stripeInvoiceId: invoice.id,
        status: eventType === "invoice.paid" ? "paid" : "void",
      });
    }
  } else if (eventType === "invoice.payment_failed") {
    const invoice = event.data.object;
    // Only subscription invoices make the subscription past due; a failed
    // card attempt on a pay-as-you-go invoice doesn't.
    const subscriptionId =
      invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null;
    const customerId = invoice.customer;
    if (customerId && subscriptionId) {
      const company = await ctx.runQuery(internal.companies.findCompanyByStripeCustomer, {
        stripeCustomerId: customerId,
      });
      if (company) {
        await ctx.runMutation(internal.companies.updateStripePaymentStatus, {
          companyId: company._id,
          status: "past_due",
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// Widget routes
http.route({ path: "/widget.js", method: "GET", handler: widgetHandler });
http.route({ path: "/widget.js", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/booking-widget.js", method: "GET", handler: widgetHandler });
http.route({ path: "/booking-widget.js", method: "OPTIONS", handler: corsHandler });

// Stripe webhook
http.route({ path: "/stripe-webhook", method: "POST", handler: stripeWebhook });

// ── Update Language Preference ──
const updateLanguageHandler = httpAction(async (ctx, request) => {
  try {
    const { userId, language } = await request.json();
    if (!userId || !language) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    await ctx.runMutation(api.users.updateLanguage, {
      userId,
      language,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

const updateLanguageCors = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
});

http.route({ path: "/updateLanguage", method: "POST", handler: updateLanguageHandler });
http.route({ path: "/updateLanguage", method: "OPTIONS", handler: updateLanguageCors });

export default http;
