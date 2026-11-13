"use node";

/**
 * Player payments into each company's OWN Stripe or Viva account (Node runtime).
 *
 * Keys: companies paste their keys in the portal. They are encrypted with
 * AES-256-GCM using the server key PAYMENT_CREDENTIALS_KEY (32 random bytes,
 * base64) before they are stored, and are only decrypted inside these actions.
 *
 * Confirmation: we never trust a redirect or an unsigned webhook. A booking is
 * marked paid only after we ask the provider's API (with the company's own
 * keys) and it says the order/session is paid for the right amount. That check
 * runs when the player comes back, and again from scheduled jobs in case the
 * player closed the tab.
 */
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import Stripe from "stripe";
import crypto from "node:crypto";

/** Same window as companyPaymentsData.PAYMENT_WINDOW_MS. */
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

// ─── Credentials ───

type StripeCreds = { provider: "stripe"; secretKey: string };
type VivaCreds = {
  provider: "viva";
  clientId: string;
  clientSecret: string;
  sourceCode: string;
  merchantId: string;
  apiKey: string;
};
type Creds = StripeCreds | VivaCreds;
type Mode = "live" | "test";

function serverKey(): Buffer {
  const raw = process.env.PAYMENT_CREDENTIALS_KEY;
  if (!raw) throw new ConvexError("Online payments aren't switched on for UNLOCKED yet. Please contact support.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new ConvexError("PAYMENT_CREDENTIALS_KEY must be 32 bytes, base64 encoded");
  return key;
}

function encrypt(creds: Creds): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", serverKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(creds), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

function decrypt(blob: string): Creds {
  const [ver, iv, tag, data] = blob.split(":");
  if (ver !== "v1") throw new ConvexError("Unknown credentials format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", serverKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const json = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(json);
}

async function loadCreds(ctx: ActionCtx, companyId: Id<"companies">) {
  const row = await ctx.runQuery(internal.companyPaymentsData.getCredentialRow, { companyId });
  if (!row) throw new ConvexError("This escape room hasn't connected a payment account");
  return { creds: decrypt(row.encrypted), mode: row.mode as Mode };
}

async function requirePassword(
  ctx: ActionCtx,
  args: { companyId: Id<"companies">; password: string; sessionToken?: string },
  fn: string
) {
  const companyId = await ctx.runQuery(internal.companySession.resolveForAction, {
    companyId: args.companyId,
    sessionToken: args.sessionToken,
    fn,
  });
  const password = args.password;
  const ok = await ctx.runQuery(internal.companyPaymentsData.checkPassword, { companyId, password });
  if (!ok) throw new ConvexError("Incorrect password");
}

// ─── Stripe (company's own account) ───

function stripeFor(secretKey: string) {
  // Same API version as the platform integration in stripe.ts.
  return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" as any, maxNetworkRetries: 2 });
}

// ─── Viva Smart Checkout ───

const VIVA = {
  live: {
    accounts: "https://accounts.vivapayments.com",
    api: "https://api.vivapayments.com",
    www: "https://www.vivapayments.com",
  },
  test: {
    accounts: "https://demo-accounts.vivapayments.com",
    api: "https://demo-api.vivapayments.com",
    www: "https://demo.vivapayments.com",
  },
} as const;

const basic = (user: string, pass: string) =>
  "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

async function vivaToken(c: VivaCreds, mode: Mode): Promise<string> {
  const res = await fetch(`${VIVA[mode].accounts}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: basic(c.clientId, c.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new ConvexError("Viva rejected the Client ID / Client Secret");
  const json: any = await res.json();
  if (!json.access_token) throw new ConvexError("Viva did not return an access token");
  return json.access_token;
}

/** orderCode is 16 digits: read it from the raw text so it never passes through a JS number. */
function pickDigits(text: string, field: string): string | null {
  const m = text.match(new RegExp(`"${field}"\\s*:\\s*"?(\\d{6,20})"?`, "i"));
  return m ? m[1] : null;
}

async function vivaCreateOrder(
  c: VivaCreds,
  mode: Mode,
  o: { amountCents: number; customerTrns: string; merchantTrns: string; email: string; fullName: string; lang: string }
): Promise<string> {
  const token = await vivaToken(c, mode);
  const res = await fetch(`${VIVA[mode].api}/checkout/v2/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: o.amountCents,
      customerTrns: o.customerTrns.slice(0, 2048),
      merchantTrns: o.merchantTrns,
      customer: {
        email: o.email || undefined,
        fullName: o.fullName || undefined,
        requestLang: o.lang === "el" ? "el-GR" : o.lang === "nl" ? "nl-NL" : "en-GB",
        countryCode: "GR",
      },
      paymentTimeout: Math.round(PAYMENT_WINDOW_MS / 1000),
      sourceCode: c.sourceCode,
      tags: ["unlocked"],
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[viva] create order ${res.status}: ${text.slice(0, 300)}`);
    throw new ConvexError("Viva couldn't create the payment. Please try again or pay at the venue.");
  }
  const orderCode = pickDigits(text, "orderCode");
  if (!orderCode) throw new ConvexError("Viva did not return an order code");
  return orderCode;
}

/** Retrieve Order (Basic auth with Merchant ID + API Key). StateId 3 = paid. */
async function vivaOrderState(c: VivaCreds, mode: Mode, orderCode: string) {
  const res = await fetch(`${VIVA[mode].www}/api/orders/${orderCode}`, {
    headers: { Authorization: basic(c.merchantId, c.apiKey) },
  });
  if (!res.ok) throw new ConvexError(`Viva order lookup failed (${res.status})`);
  const json: any = await res.json();
  return { stateId: Number(json.StateId), requestAmount: Number(json.RequestAmount) };
}

async function vivaCancelOrder(c: VivaCreds, mode: Mode, orderCode: string) {
  try {
    await fetch(`${VIVA[mode].www}/api/orders/${orderCode}`, {
      method: "DELETE",
      headers: { Authorization: basic(c.merchantId, c.apiKey) },
    });
  } catch (e) {
    console.error("[viva] cancel order failed", e);
  }
}

/** Retrieve Transaction (OAuth). statusId "F" = finished (paid). */
async function vivaTransaction(c: VivaCreds, mode: Mode, transactionId: string) {
  const token = await vivaToken(c, mode);
  const res = await fetch(`${VIVA[mode].api}/checkout/v2/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const text = await res.text();
  const json: any = JSON.parse(text);
  return {
    statusId: String(json.statusId ?? ""),
    orderCode: pickDigits(text, "orderCode"),
    amountCents: Math.round(Number(json.amount) * 100),
  };
}

// ─── Connect / disconnect (company portal) ───

export const connectStripe = action({
  args: { companyId: v.id("companies"), sessionToken: v.optional(v.string()), password: v.string(), secretKey: v.string() },
  handler: async (ctx, args) => {
    await requirePassword(ctx, args, "companyPayments:connectStripe");
    const secretKey = args.secretKey.trim();
    const m = secretKey.match(/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/);
    if (!m) throw new ConvexError("That doesn't look like a Stripe secret key (it starts with sk_live_ or sk_test_)");
    const mode: Mode = m[2] === "live" ? "live" : "test";

    const stripe = stripeFor(secretKey);
    try {
      await stripe.checkout.sessions.list({ limit: 1 });
    } catch (e: any) {
      throw new ConvexError(
        e?.type === "StripeAuthenticationError"
          ? "Stripe rejected this key. Copy it again from Developers → API keys."
          : "This key can't create Checkout payments. Use the secret key, or give the restricted key Checkout Sessions write access."
      );
    }
    let name = "";
    try {
      const acct: any = await stripe.accounts.retrieveCurrent();
      name = acct?.settings?.dashboard?.display_name || acct?.business_profile?.name || acct?.id || "";
    } catch {
      // Restricted keys may not read the account; the label just stays shorter.
    }

    await ctx.runMutation(internal.companyPaymentsData.storeCredentials, {
      companyId: args.companyId,
      provider: "stripe",
      mode,
      encrypted: encrypt({ provider: "stripe", secretKey }),
      accountLabel: `${name || "Stripe account"} · …${secretKey.slice(-4)}`,
    });
    return { mode };
  },
});

export const connectViva = action({
  args: {
    companyId: v.id("companies"),
    sessionToken: v.optional(v.string()),
    password: v.string(),
    mode: v.union(v.literal("live"), v.literal("test")),
    clientId: v.string(),
    clientSecret: v.string(),
    sourceCode: v.string(),
    merchantId: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePassword(ctx, args, "companyPayments:connectViva");
    const creds: VivaCreds = {
      provider: "viva",
      clientId: args.clientId.trim(),
      clientSecret: args.clientSecret.trim(),
      sourceCode: args.sourceCode.trim(),
      merchantId: args.merchantId.trim(),
      apiKey: args.apiKey.trim(),
    };
    if (Object.values(creds).some((x) => !x)) throw new ConvexError("Fill in all the Viva fields");
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(creds.sourceCode)) throw new ConvexError("The payment source code should look like 1234");

    // 1) Smart Checkout credentials
    await vivaToken(creds, args.mode);
    // 2) Merchant ID + API Key (needed to check orders if the player closes the tab)
    const res = await fetch(`${VIVA[args.mode].www}/api/messages/config/token`, {
      headers: { Authorization: basic(creds.merchantId, creds.apiKey) },
    });
    if (!res.ok) throw new ConvexError("Viva rejected the Merchant ID / API Key");

    await ctx.runMutation(internal.companyPaymentsData.storeCredentials, {
      companyId: args.companyId,
      provider: "viva",
      mode: args.mode,
      encrypted: encrypt(creds),
      accountLabel: `Viva · merchant …${creds.merchantId.slice(-6)} · source ${creds.sourceCode}`,
    });
    return { mode: args.mode };
  },
});

export const disconnect = action({
  args: { companyId: v.id("companies"), sessionToken: v.optional(v.string()), password: v.string() },
  handler: async (ctx, args) => {
    await requirePassword(ctx, args, "companyPayments:disconnect");
    await ctx.runMutation(internal.companyPaymentsData.removeCredentials, { companyId: args.companyId });
  },
});

// ─── Checkout ───

function checkUrl(url: string) {
  if (!/^(https?:\/\/|[a-z][a-z0-9+.-]*:\/\/)/i.test(url)) throw new ConvexError("Invalid return URL");
  return url;
}

/**
 * Opens a checkout for an existing pending booking and stores the provider
 * reference on it. `{BOOKING_ID}` in the URLs is replaced with the booking id.
 */
async function openCheckout(
  ctx: ActionCtx,
  bookingId: Id<"bookings">,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const info = await ctx.runQuery(internal.companyPaymentsData.getBookingForPayment, { bookingId });
  if (!info) throw new ConvexError("Booking not found");
  const b = info.booking;
  if (!b.companyId) throw new ConvexError("This room isn't linked to a company");
  const { creds, mode } = await loadCreds(ctx, b.companyId);
  if (creds.provider !== b.paymentProvider) {
    throw new ConvexError("The escape room changed its payment account. Please start the booking again.");
  }

  const fill = (u: string) => checkUrl(u).split("{BOOKING_ID}").join(bookingId);
  const isDeposit = b.paymentTerms === "deposit_20";
  const what = isDeposit
    ? `${b.depositPercent}% deposit · ${b.date} ${b.time} · ${b.players} players`
    : `${b.date} ${b.time} · ${b.players} players`;

  let url: string;
  if (creds.provider === "stripe") {
    const stripe = stripeFor(creds.secretKey);
    // Close the previous session (retry) so the player can't pay twice.
    if (b.stripeSessionId) {
      try {
        const old = await stripe.checkout.sessions.retrieve(b.stripeSessionId);
        if (old.status === "open") await stripe.checkout.sessions.expire(b.stripeSessionId);
      } catch {}
    }
    const lineItems: any[] = [
      {
        price_data: {
          currency: "eur",
          product_data: { name: `${info.roomTitle}${isDeposit ? " (deposit)" : ""}`, description: what },
          unit_amount: info.partCents,
        },
        quantity: 1,
      },
    ];
    if (info.feeCents > 0) {
      lineItems.push({
        price_data: { currency: "eur", product_data: { name: "Booking fee" }, unit_amount: info.feeCents },
        quantity: 1,
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: info.playerEmail || undefined,
      client_reference_id: bookingId,
      line_items: lineItems,
      metadata: { source: "unlocked", bookingId, bookingCode: b.bookingCode },
      payment_intent_data: {
        description: `UNLOCKED ${b.bookingCode} · ${info.roomTitle}`,
        metadata: { source: "unlocked", bookingId, bookingCode: b.bookingCode },
      },
      expires_at: Math.floor((Date.now() + PAYMENT_WINDOW_MS + 60_000) / 1000),
      success_url: fill(successUrl).replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}"),
      cancel_url: fill(cancelUrl),
    });
    if (!session.url) throw new ConvexError("Stripe did not return a checkout page");
    await ctx.runMutation(internal.companyPaymentsData.attachCheckout, { bookingId, stripeSessionId: session.id });
    url = session.url;
  } else {
    if (b.vivaOrderCode) await vivaCancelOrder(creds, mode, b.vivaOrderCode);
    const orderCode = await vivaCreateOrder(creds, mode, {
      amountCents: info.dueCents,
      customerTrns: `${info.roomTitle} · ${what}`,
      merchantTrns: `UNLOCKED ${b.bookingCode}`,
      email: info.playerEmail,
      fullName: info.playerName,
      lang: info.lang,
    });
    await ctx.runMutation(internal.companyPaymentsData.attachCheckout, { bookingId, vivaOrderCode: orderCode });
    // Viva sends the player to the Success/Failure URL set on the payment
    // source (our /payments/viva/return page), not to per-order URLs.
    url = `${VIVA[mode].www}/web/checkout?ref=${orderCode}`;
  }

  // Checks during the window (the mobile app has no return page to trigger
  // one), then a final check that releases the slot if still unpaid.
  const ref = await currentRef(ctx, bookingId);
  for (const min of [2, 5, 10, 20]) {
    await ctx.scheduler.runAfter(min * 60 * 1000, internal.companyPayments.reconcile, { bookingId, ref, final: false });
  }
  await ctx.scheduler.runAfter(PAYMENT_WINDOW_MS + 5 * 60 * 1000, internal.companyPayments.reconcile, {
    bookingId,
    ref,
    final: true,
  });
  return url;
}

async function currentRef(ctx: ActionCtx, bookingId: Id<"bookings">) {
  const info = await ctx.runQuery(internal.companyPaymentsData.getBookingForPayment, { bookingId });
  return info?.booking.stripeSessionId || info?.booking.vivaOrderCode || "";
}

export type CheckoutArgs = {
  userId: Id<"users">;
  roomId: Id<"rooms">;
  date: string;
  time: string;
  players: number;
  paymentTerms: "full" | "deposit_20";
  successUrl: string;
  cancelUrl: string;
};

/** Shared by startCheckout and the older stripe.createBookingCheckout entry point. */
export async function startCheckoutImpl(ctx: ActionCtx, args: CheckoutArgs) {
  const created = await ctx.runMutation(internal.companyPaymentsData.createPendingBooking, {
    userId: args.userId,
    roomId: args.roomId,
    date: args.date,
    time: args.time,
    players: args.players,
    paymentTerms: args.paymentTerms,
  });
  try {
    const url = await openCheckout(ctx, created.bookingId, args.successUrl, args.cancelUrl);
    return { url, bookingId: created.bookingId as string, provider: created.provider };
  } catch (e) {
    // Don't hold the slot if we couldn't even open the payment page.
    await ctx.runMutation(internal.companyPaymentsData.expirePendingBooking, { bookingId: created.bookingId });
    throw e;
  }
}

export const startCheckout = action({
  args: {
    userId: v.id("users"),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    paymentTerms: v.union(v.literal("full"), v.literal("deposit_20")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string; bookingId: string; provider: string }> => {
    return await startCheckoutImpl(ctx, args);
  },
});

/** "Pay now" again for a booking that is still waiting for payment. */
export async function retryCheckoutImpl(
  ctx: ActionCtx,
  args: { bookingId: Id<"bookings">; successUrl: string; cancelUrl: string }
) {
  const info = await ctx.runQuery(internal.companyPaymentsData.getBookingForPayment, { bookingId: args.bookingId });
  if (!info) throw new ConvexError("Booking not found");
  if (info.booking.status !== "pending_payment" || info.booking.paidAt) {
    throw new ConvexError("Booking is not pending payment");
  }
  // Maybe they already paid and only the confirmation is missing.
  const state = await verifyBooking(ctx, args.bookingId);
  if (state === "paid") throw new ConvexError("This booking is already paid");
  return { url: await openCheckout(ctx, args.bookingId, args.successUrl, args.cancelUrl) };
}

export const retryCheckout = action({
  args: { bookingId: v.id("bookings"), successUrl: v.string(), cancelUrl: v.string() },
  handler: async (ctx, args): Promise<{ url: string }> => retryCheckoutImpl(ctx, args),
});

// ─── Verification ───

type VerifyResult = "paid" | "pending" | "unknown";

/** Ask the provider whether this booking is paid; mark it paid if so. */
async function verifyBooking(
  ctx: ActionCtx,
  bookingId: Id<"bookings">,
  vivaTransactionId?: string
): Promise<VerifyResult> {
  const info = await ctx.runQuery(internal.companyPaymentsData.getBookingForPayment, { bookingId });
  if (!info) return "unknown";
  const b = info.booking;
  if (b.paidAt) return "paid";
  if (!b.companyId || !b.paymentProvider) return "unknown";

  let creds: Creds, mode: Mode;
  try {
    ({ creds, mode } = await loadCreds(ctx, b.companyId));
  } catch {
    return "unknown"; // company disconnected; nothing we can check
  }

  if (creds.provider === "stripe" && b.stripeSessionId) {
    const s = await stripeFor(creds.secretKey).checkout.sessions.retrieve(b.stripeSessionId);
    if (s.payment_status === "paid" && s.metadata?.bookingId === bookingId) {
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      const r = await ctx.runMutation(internal.companyPaymentsData.markPaid, {
        bookingId,
        reference: pi || s.id,
        amountCents: s.amount_total ?? 0,
      });
      return r.ok ? "paid" : "unknown";
    }
    return "pending";
  }

  if (creds.provider === "viva" && b.vivaOrderCode) {
    if (vivaTransactionId) {
      const tx = await vivaTransaction(creds, mode, vivaTransactionId);
      if (tx && tx.statusId === "F" && tx.orderCode === b.vivaOrderCode) {
        const r = await ctx.runMutation(internal.companyPaymentsData.markPaid, {
          bookingId,
          reference: vivaTransactionId,
          amountCents: tx.amountCents,
        });
        if (r.ok) return "paid";
      }
    }
    const order = await vivaOrderState(creds, mode, b.vivaOrderCode);
    if (order.stateId === 3) {
      // The order was created by us for exactly amountDueNow; paid means paid in full.
      const r = await ctx.runMutation(internal.companyPaymentsData.markPaid, {
        bookingId,
        reference: vivaTransactionId || `order:${b.vivaOrderCode}`,
        amountCents: info.dueCents,
      });
      return r.ok ? "paid" : "unknown";
    }
    return "pending";
  }
  return "pending";
}

/** Called by the confirmation page after Stripe sends the player back. */
export const confirmReturn = action({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args): Promise<{ state: VerifyResult }> => {
    try {
      return { state: await verifyBooking(ctx, args.bookingId) };
    } catch (e) {
      console.error("[payments] confirmReturn", e);
      return { state: "unknown" };
    }
  },
});

/** Called by /payments/viva/return with Viva's ?s=<orderCode>&t=<transactionId>. */
export const confirmVivaReturn = action({
  args: { orderCode: v.string(), transactionId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ bookingId: string | null; state: VerifyResult }> => {
    if (!/^\d{6,20}$/.test(args.orderCode)) return { bookingId: null, state: "unknown" };
    const booking = await ctx.runQuery(internal.companyPaymentsData.findBookingByVivaOrder, {
      orderCode: args.orderCode,
    });
    if (!booking) return { bookingId: null, state: "unknown" };
    try {
      return { bookingId: booking._id, state: await verifyBooking(ctx, booking._id, args.transactionId) };
    } catch (e) {
      console.error("[payments] confirmVivaReturn", e);
      return { bookingId: booking._id, state: "unknown" };
    }
  },
});

/**
 * Scheduled check. Confirms bookings whose player closed the tab after paying;
 * on the final run, closes the checkout and releases the slot if still unpaid.
 * `ref` ties the job to one checkout so an older job can't cancel a retry.
 */
export const reconcile = internalAction({
  args: { bookingId: v.id("bookings"), ref: v.string(), final: v.boolean() },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.companyPaymentsData.getBookingForPayment, { bookingId: args.bookingId });
    if (!info || info.booking.paidAt || info.booking.status !== "pending_payment") return;
    const ref = info.booking.stripeSessionId || info.booking.vivaOrderCode || "";
    if (ref !== args.ref) return; // superseded by a retry

    let state: VerifyResult = "unknown";
    try {
      state = await verifyBooking(ctx, args.bookingId);
    } catch (e) {
      console.error("[payments] reconcile check failed", e);
    }
    if (state === "paid" || !args.final) return;

    // Final: close the checkout so it can't be paid later, check once more, release.
    try {
      const { creds, mode } = await loadCreds(ctx, info.booking.companyId!);
      if (creds.provider === "stripe" && info.booking.stripeSessionId) {
        const stripe = stripeFor(creds.secretKey);
        const s = await stripe.checkout.sessions.retrieve(info.booking.stripeSessionId);
        if (s.status === "open") await stripe.checkout.sessions.expire(s.id);
      } else if (creds.provider === "viva" && info.booking.vivaOrderCode) {
        await vivaCancelOrder(creds, mode, info.booking.vivaOrderCode);
      }
      if ((await verifyBooking(ctx, args.bookingId)) === "paid") return;
    } catch (e) {
      console.error("[payments] reconcile close failed", e);
    }
    await ctx.runMutation(internal.companyPaymentsData.expirePendingBooking, { bookingId: args.bookingId });
  },
});
