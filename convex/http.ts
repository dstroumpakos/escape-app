import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { verifyStripeSignature } from "./stripeSignature";
import { decodeJwsPayload, bundleId } from "./appStore";

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
    const { sessionToken, language } = await request.json();
    if (typeof sessionToken !== "string" || typeof language !== "string" || !sessionToken || !language) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    await ctx.runMutation(api.users.updateLanguage, {
      sessionToken,
      language,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch {
    // Don't echo internal error text to the caller.
    return new Response(JSON.stringify({ error: "Could not update language" }), {
      status: 400,
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

// ── App Store Server Notifications V2 (renewals, expiry, refunds) ──
// URL to set in App Store Connect: https://<deployment>.convex.site/appstore-notifications
// The payload is only a hint (which subscription changed); premium.refreshFromApple
// reads the real state from Apple's API, so fake posts can't grant Premium.
const appStoreNotifications = httpAction(async (ctx, request) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const payload = decodeJwsPayload(body?.signedPayload ?? "");
  const data = payload?.data;
  if (!data || (data.bundleId && data.bundleId !== bundleId())) return new Response("Ignored", { status: 200 });
  const tx = decodeJwsPayload(data.signedTransactionInfo ?? "");
  const originalTransactionId = tx?.originalTransactionId ? String(tx.originalTransactionId) : "";
  if (!/^[0-9]{1,30}$/.test(originalTransactionId)) return new Response("Ignored", { status: 200 });
  try {
    await ctx.runMutation(internal.premium.notificationRateLimit, {});
    await ctx.runAction(internal.premium.refreshFromApple, { originalTransactionId });
  } catch (e) {
    console.error("[appstore-notifications]", e);
    // 500 so Apple retries later.
    return new Response("Retry later", { status: 500 });
  }
  return new Response("OK", { status: 200 });
});

http.route({ path: "/appstore-notifications", method: "POST", handler: appStoreNotifications });

// ── Rooms Played: forwarded booking emails, Postmark inbound (plays.ingestEmail) ──
// Postmark → Servers → Inbound → Webhook URL:
//   https://inbound:<INBOUND_EMAIL_SECRET>@<deployment>.convex.site/inbound-email
// Postmark sends the user:password as HTTP Basic auth. Off (404) until
// INBOUND_EMAIL_SECRET is set. Players forward to their personal address
// (INBOUND_EMAIL_ADDRESS with "+<code>", see plays.inboundAddressFor), which
// arrives as MailboxHash; the sender address is the fallback.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function basicAuthPassword(header: string | null): string {
  if (!header?.startsWith("Basic ")) return "";
  try {
    const decoded = atob(header.slice(6).trim());
    const i = decoded.indexOf(":");
    return i >= 0 ? decoded.slice(i + 1) : "";
  } catch {
    return "";
  }
}

const inboundEmail = httpAction(async (ctx, request) => {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });
  const given = basicAuthPassword(request.headers.get("authorization")) || new URL(request.url).searchParams.get("secret") || "";
  if (!sameSecret(given, secret)) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 5_000_000) return new Response("Too large", { status: 413 });

  let m: Record<string, any>;
  try {
    m = (await request.json()) as Record<string, any>;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const from = String(m?.FromFull?.Email ?? m?.From ?? "");
  const subject = String(m?.Subject ?? "");
  // The plus part of the address it was sent to ("…+<code>@…").
  const hashes = [m?.MailboxHash, ...(Array.isArray(m?.ToFull) ? m.ToFull.map((t: any) => t?.MailboxHash) : [])];
  const mailboxHash = String(hashes.find((h) => typeof h === "string" && h) ?? "");
  let text = String(m?.TextBody || "");
  if (!text && m?.HtmlBody) {
    // HTML only: keep the words.
    text = String(m.HtmlBody).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  }
  text = text.replace(/\s+/g, " ").slice(0, 20000);
  // Always 200 once authenticated: Postmark retries anything else.
  if (!from && !mailboxHash) return new Response("OK", { status: 200 });
  await ctx.runMutation(internal.plays.ingestEmail, {
    from: from.slice(0, 300),
    mailboxHash: mailboxHash.slice(0, 100),
    subject: subject.slice(0, 300),
    text,
  });
  return new Response("OK", { status: 200 });
});

http.route({ path: "/inbound-email", method: "POST", handler: inboundEmail });

export default http;
