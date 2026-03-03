"use node";

/**
 * ═══════════════════════════════════════════════════════════════
 * Email Service — Comprehensive transactional emails via Resend
 * ═══════════════════════════════════════════════════════════════
 *
 * All emails are fired via ctx.scheduler.runAfter(0, internal.email.*)
 * from mutations. Each email is an internalAction (requires Node.js).
 *
 * Email types:
 *  1. sendBookingEmails       – booking confirm to player + notify company
 *  2. sendPlayerWelcome       – welcome email on player signup
 *  3. sendCompanyWelcome      – welcome email on company registration
 *  4. sendCompanyApproved     – after admin approves a company
 *  5. sendStripeReceipt       – payment receipt to player after Stripe
 *  6. sendSubscriptionReceipt – subscription receipt to company
 */

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";

// ══════════════════════════════════════════════════════════════
// Shared helpers
// ══════════════════════════════════════════════════════════════

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[Email] RESEND_API_KEY not set — skipping");
    return null;
  }
  return new Resend(apiKey);
}

function fromAddr(senderName?: string): string {
  const addr = process.env.EMAIL_FROM || "noreply@unlockedescapes.com";
  const name = senderName || process.env.EMAIL_FROM_NAME || "UNLOCKED";
  return `${name} <${addr}>`;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fmtDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function paymentLabel(status: string): string {
  switch (status) {
    case "paid": return "Paid in Full";
    case "deposit": return "Deposit Paid";
    case "unpaid": return "Pay on Arrival";
    default: return status;
  }
}

function planLabel(plan: string): string {
  switch (plan) {
    case "starter": return "Starter";
    case "pro": return "Pro";
    case "enterprise": return "Enterprise";
    default: return plan;
  }
}

// ══════════════════════════════════════════════════════════════
// Shared email styles (inline CSS for email clients)
// ══════════════════════════════════════════════════════════════

const S = {
  body: "margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
  container: "max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);",
  header: "background:#1a1a2e;color:#ffffff;padding:32px 24px;text-align:center;",
  headerTitle: "margin:0;font-size:24px;font-weight:700;color:#ffffff;",
  headerSub: "margin:8px 0 0;font-size:14px;color:#a0a0b8;",
  content: "padding:32px 24px;",
  badge: "display:inline-block;background:#FF6B35;color:#fff;font-size:18px;font-weight:700;padding:8px 20px;border-radius:6px;letter-spacing:1px;",
  table: "width:100%;border-collapse:collapse;margin:24px 0;",
  th: "text-align:left;padding:12px 16px;background:#f8f9fa;color:#666;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #eee;width:40%;",
  td: "padding:12px 16px;font-size:15px;color:#1a1a2e;border-bottom:1px solid #eee;",
  footer: "padding:24px;background:#f8f9fa;text-align:center;font-size:12px;color:#999;",
  btn: "display:inline-block;background:#FF6B35;color:#ffffff;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:600;text-decoration:none;",
  btnGreen: "display:inline-block;background:#28a745;color:#ffffff;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:600;text-decoration:none;",
  statusColor: (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      paid: { bg: "#28a745", color: "#fff" },
      deposit: { bg: "#ffc107", color: "#333" },
      unpaid: { bg: "#6c757d", color: "#fff" },
    };
    const c = map[status] || { bg: "#6c757d", color: "#fff" };
    return `display:inline-block;background:${c.bg};color:${c.color};padding:4px 12px;border-radius:4px;font-size:13px;font-weight:600;`;
  },
};

function shell(title: string, subtitle: string, body: string, footerText: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${S.body}">
<div style="padding:24px;">
<div style="${S.container}">
<div style="${S.header}">
  <h1 style="${S.headerTitle}">${title}</h1>
  <p style="${S.headerSub}">${subtitle}</p>
</div>
<div style="${S.content}">
${body}
</div>
<div style="${S.footer}">
  <p style="margin:0;">${footerText}</p>
</div>
</div>
</div>
</body></html>`;
}

// ══════════════════════════════════════════════════════════════
// 1. BOOKING EMAILS (player confirm + company notify)
// ══════════════════════════════════════════════════════════════

export const sendBookingEmails = internalAction({
  args: {
    bookingCode: v.string(),
    playerName: v.string(),
    playerContact: v.string(),
    playerPhone: v.string(),
    roomTitle: v.string(),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    total: v.number(),
    paymentStatus: v.string(),
    depositPaid: v.optional(v.number()),
    notes: v.optional(v.string()),
    companyName: v.string(),
    companyPhone: v.string(),
    companyEmail: v.string(),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const d = args;
    const fDate = fmtDate(d.date);
    const playerEmail = isEmail(d.playerContact) ? d.playerContact : null;
    const promises: Promise<any>[] = [];

    // ── Player confirmation ──
    if (playerEmail) {
      const playerHtml = shell(
        "Booking Confirmed! 🎉",
        "Your escape room adventure awaits",
        `<p style="font-size:16px;color:#333;margin:0 0 8px;">Hi <strong>${d.playerName}</strong>,</p>
<p style="font-size:15px;color:#555;margin:0 0 24px;">Thank you for your booking! Here are your details:</p>
<div style="text-align:center;margin:0 0 24px;"><span style="${S.badge}">${d.bookingCode}</span></div>
<table style="${S.table}">
  <tr><th style="${S.th}">Room</th><td style="${S.td}"><strong>${d.roomTitle}</strong></td></tr>
  <tr><th style="${S.th}">Date</th><td style="${S.td}">${fDate}</td></tr>
  <tr><th style="${S.th}">Time</th><td style="${S.td}">${d.time}</td></tr>
  <tr><th style="${S.th}">Players</th><td style="${S.td}">${d.players}</td></tr>
  <tr><th style="${S.th}">Total</th><td style="${S.td}"><strong>€${d.total.toFixed(2)}</strong></td></tr>
  <tr><th style="${S.th}">Payment</th><td style="${S.td}"><span style="${S.statusColor(d.paymentStatus)}">${paymentLabel(d.paymentStatus)}</span></td></tr>
  ${d.depositPaid ? `<tr><th style="${S.th}">Deposit</th><td style="${S.td}">€${d.depositPaid.toFixed(2)}</td></tr>` : ""}
  ${d.notes ? `<tr><th style="${S.th}">Notes</th><td style="${S.td}">${d.notes}</td></tr>` : ""}
</table>
<p style="font-size:14px;color:#666;margin:24px 0 0;line-height:1.6;">
  Keep your booking code <strong>${d.bookingCode}</strong> handy — you'll need it when you arrive.
  Need changes? Call <strong>${d.companyPhone}</strong>.
</p>`,
        `${d.companyName} — Automated booking confirmation`
      );

      promises.push(
        resend.emails.send({
          from: fromAddr(d.companyName),
          to: playerEmail,
          subject: `Booking Confirmation — ${d.bookingCode}`,
          html: playerHtml,
        }).then(r => console.log("[Email] Player booking confirm sent:", r))
          .catch(e => console.error("[Email] Player booking email failed:", e))
      );
    }

    // ── Company notification ──
    if (d.companyEmail) {
      const companyHtml = shell(
        "New Booking Received 📋",
        d.bookingCode,
        `<p style="font-size:16px;color:#333;margin:0 0 24px;">A new booking has been placed.</p>
<table style="${S.table}">
  <tr><th style="${S.th}">Booking Code</th><td style="${S.td}"><strong>${d.bookingCode}</strong></td></tr>
  <tr><th style="${S.th}">Room</th><td style="${S.td}"><strong>${d.roomTitle}</strong></td></tr>
  <tr><th style="${S.th}">Date</th><td style="${S.td}">${fDate}</td></tr>
  <tr><th style="${S.th}">Time</th><td style="${S.td}">${d.time}</td></tr>
  <tr><th style="${S.th}">Players</th><td style="${S.td}">${d.players}</td></tr>
  <tr><th style="${S.th}">Total</th><td style="${S.td}"><strong>€${d.total.toFixed(2)}</strong></td></tr>
  <tr><th style="${S.th}">Payment</th><td style="${S.td}"><span style="${S.statusColor(d.paymentStatus)}">${paymentLabel(d.paymentStatus)}</span></td></tr>
  ${d.depositPaid ? `<tr><th style="${S.th}">Deposit</th><td style="${S.td}">€${d.depositPaid.toFixed(2)}</td></tr>` : ""}
</table>
<h3 style="font-size:16px;color:#1a1a2e;margin:32px 0 12px;border-bottom:2px solid #eee;padding-bottom:8px;">Customer Details</h3>
<table style="${S.table}">
  <tr><th style="${S.th}">Name</th><td style="${S.td}">${d.playerName}</td></tr>
  <tr><th style="${S.th}">Email</th><td style="${S.td}"><a href="mailto:${d.playerContact}" style="color:#FF6B35;">${d.playerContact}</a></td></tr>
  <tr><th style="${S.th}">Phone</th><td style="${S.td}"><a href="tel:${d.playerPhone}" style="color:#FF6B35;">${d.playerPhone}</a></td></tr>
  ${d.notes ? `<tr><th style="${S.th}">Notes</th><td style="${S.td}">${d.notes}</td></tr>` : ""}
</table>`,
        `${d.companyName} — Automated booking notification`
      );

      promises.push(
        resend.emails.send({
          from: fromAddr(d.companyName),
          to: d.companyEmail,
          subject: `New Booking — ${d.bookingCode} | ${d.roomTitle}`,
          html: companyHtml,
        }).then(r => console.log("[Email] Company booking notify sent:", r))
          .catch(e => console.error("[Email] Company booking email failed:", e))
      );
    }

    await Promise.allSettled(promises);
  },
});

// ══════════════════════════════════════════════════════════════
// 2. PLAYER WELCOME EMAIL
// ══════════════════════════════════════════════════════════════

export const sendPlayerWelcome = internalAction({
  args: {
    playerName: v.string(),
    playerEmail: v.string(),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const html = shell(
      "Welcome to UNLOCKED! 🔓",
      "Your escape room journey starts here",
      `<p style="font-size:16px;color:#333;margin:0 0 8px;">Hi <strong>${args.playerName}</strong>,</p>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">
  Welcome to <strong>UNLOCKED</strong> — Greece's escape room platform!
  You're now part of a community of escape room enthusiasts.
</p>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">Here's what you can do:</p>
<table style="${S.table}">
  <tr><th style="${S.th}">🔍 Discover</th><td style="${S.td}">Browse escape rooms near you</td></tr>
  <tr><th style="${S.th}">📅 Book</th><td style="${S.td}">Reserve your spot in seconds</td></tr>
  <tr><th style="${S.th}">👥 Connect</th><td style="${S.td}">Add friends and invite them to play</td></tr>
  <tr><th style="${S.th}">🏆 Compete</th><td style="${S.td}">Climb the leaderboard and earn badges</td></tr>
  <tr><th style="${S.th}">📸 Share</th><td style="${S.td}">Save and share your escape room photos</td></tr>
</table>
<div style="text-align:center;margin:32px 0;">
  <a href="https://unlockedescapes.com/discover" style="${S.btn}">Start Exploring →</a>
</div>
<p style="font-size:14px;color:#666;line-height:1.6;">
  Your rank: <strong>Escape Rookie 🌟</strong><br/>
  Play more rooms to level up and unlock new titles!
</p>`,
      "UNLOCKED — Escape Room Platform"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.playerEmail,
      subject: "Welcome to UNLOCKED! 🔓 Your escape room adventure starts now",
      html,
    }).then(r => console.log("[Email] Player welcome sent:", r))
      .catch(e => console.error("[Email] Player welcome failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// 3. COMPANY WELCOME EMAIL
// ══════════════════════════════════════════════════════════════

export const sendCompanyWelcome = internalAction({
  args: {
    companyName: v.string(),
    companyEmail: v.string(),
    plan: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const planLine = args.plan
      ? `<p style="font-size:15px;color:#555;margin:0 0 8px;">Selected plan: <strong>${planLabel(args.plan)} Plan</strong></p>`
      : "";

    const html = shell(
      "Welcome to UNLOCKED! 🏢",
      "Partner with Greece's escape room platform",
      `<p style="font-size:16px;color:#333;margin:0 0 8px;">Hi <strong>${args.companyName}</strong>,</p>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">
  Thank you for registering on <strong>UNLOCKED</strong>!
  We're excited to have you on board.
</p>
${planLine}
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">Here's what happens next:</p>
<table style="${S.table}">
  <tr><th style="${S.th}">Step 1</th><td style="${S.td}">Complete your payment (if required)</td></tr>
  <tr><th style="${S.th}">Step 2</th><td style="${S.td}">Our team reviews your application</td></tr>
  <tr><th style="${S.th}">Step 3</th><td style="${S.td}">Once approved, you can add rooms and start receiving bookings!</td></tr>
</table>
<p style="font-size:15px;color:#555;margin:0 0 8px;line-height:1.6;">
  You'll receive an email as soon as your account is approved.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="https://unlockedescapes.com/company" style="${S.btn}">Go to Dashboard →</a>
</div>`,
      "UNLOCKED — Escape Room Platform"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.companyEmail,
      subject: "Welcome to UNLOCKED! 🏢 Your registration is being processed",
      html,
    }).then(r => console.log("[Email] Company welcome sent:", r))
      .catch(e => console.error("[Email] Company welcome failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// 4. COMPANY APPROVED EMAIL
// ══════════════════════════════════════════════════════════════

export const sendCompanyApproved = internalAction({
  args: {
    companyName: v.string(),
    companyEmail: v.string(),
    plan: v.string(),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const features: Record<string, string[]> = {
      starter: [
        "Up to 5 rooms",
        "Booking management dashboard",
        "Embeddable booking widget",
        "Email notifications",
      ],
      pro: [
        "Up to 15 rooms",
        "Everything in Starter",
        "Priority support",
        "Advanced analytics",
        "Custom branding",
      ],
      enterprise: [
        "Unlimited rooms",
        "Everything in Pro",
        "Dedicated account manager",
        "API access",
        "Custom integrations",
      ],
    };

    const planFeatures = features[args.plan] || features.starter;
    const featureRows = planFeatures
      .map(f => `<tr><td style="padding:8px 16px;font-size:14px;color:#333;border-bottom:1px solid #f0f0f0;">✅ ${f}</td></tr>`)
      .join("");

    const html = shell(
      "You're Approved! 🎉",
      "Your UNLOCKED account is now active",
      `<p style="font-size:16px;color:#333;margin:0 0 8px;">Hi <strong>${args.companyName}</strong>,</p>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">
  Great news! Your company has been <strong>approved</strong> on UNLOCKED.
  You can now start adding your escape rooms and receiving bookings.
</p>
<div style="text-align:center;margin:0 0 24px;">
  <span style="${S.badge}">${planLabel(args.plan)} Plan</span>
</div>
<p style="font-size:15px;color:#555;margin:0 0 12px;">Your plan includes:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
  ${featureRows}
</table>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">
  Log in to your dashboard to start setting up your rooms.
  Players can discover and book your rooms as soon as you publish them!
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="https://unlockedescapes.com/company" style="${S.btnGreen}">Go to Dashboard →</a>
</div>`,
      "UNLOCKED — Escape Room Platform"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.companyEmail,
      subject: `Your UNLOCKED account is approved! 🎉 ${planLabel(args.plan)} Plan activated`,
      html,
    }).then(r => console.log("[Email] Company approved sent:", r))
      .catch(e => console.error("[Email] Company approved failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// 5. STRIPE PAYMENT RECEIPT TO PLAYER
// ══════════════════════════════════════════════════════════════

export const sendStripeReceipt = internalAction({
  args: {
    playerName: v.string(),
    playerEmail: v.string(),
    bookingCode: v.string(),
    roomTitle: v.string(),
    date: v.string(),
    time: v.string(),
    players: v.number(),
    total: v.number(),
    amountCharged: v.number(),
    paymentTerms: v.string(),
    companyName: v.string(),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const d = args;
    const fDate = fmtDate(d.date);
    const termsLabel = d.paymentTerms === "full"
      ? "Full Payment"
      : d.paymentTerms === "deposit_20"
        ? "20% Deposit + Service Fee"
        : "Payment";

    const html = shell(
      "Payment Receipt 💳",
      `Transaction for booking ${d.bookingCode}`,
      `<p style="font-size:16px;color:#333;margin:0 0 8px;">Hi <strong>${d.playerName}</strong>,</p>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">
  Your payment has been processed successfully. Here is your receipt:
</p>
<div style="text-align:center;margin:0 0 24px;">
  <span style="${S.badge}">${d.bookingCode}</span>
</div>
<table style="${S.table}">
  <tr><th style="${S.th}">Room</th><td style="${S.td}"><strong>${d.roomTitle}</strong></td></tr>
  <tr><th style="${S.th}">Date</th><td style="${S.td}">${fDate}</td></tr>
  <tr><th style="${S.th}">Time</th><td style="${S.td}">${d.time}</td></tr>
  <tr><th style="${S.th}">Players</th><td style="${S.td}">${d.players}</td></tr>
  <tr><th style="${S.th}">Booking Total</th><td style="${S.td}">€${d.total.toFixed(2)}</td></tr>
  <tr><th style="${S.th}">Payment Type</th><td style="${S.td}">${termsLabel}</td></tr>
  <tr><th style="${S.th}">Amount Charged</th><td style="${S.td}"><strong style="color:#28a745;">€${d.amountCharged.toFixed(2)}</strong></td></tr>
</table>
<p style="font-size:13px;color:#999;margin:24px 0 0;line-height:1.6;">
  This is an automated payment receipt from UNLOCKED. The charge will appear on your statement as "UNLOCKED" or "${d.companyName}".
  If you have questions about this charge, please contact us.
</p>`,
      "UNLOCKED — Payment Receipt"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: d.playerEmail,
      subject: `Payment Receipt — €${d.amountCharged.toFixed(2)} | ${d.bookingCode}`,
      html,
    }).then(r => console.log("[Email] Stripe receipt sent:", r))
      .catch(e => console.error("[Email] Stripe receipt failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// 6. SUBSCRIPTION RECEIPT TO COMPANY
// ══════════════════════════════════════════════════════════════

export const sendSubscriptionReceipt = internalAction({
  args: {
    companyName: v.string(),
    companyEmail: v.string(),
    plan: v.string(),
    period: v.string(),
    amount: v.number(),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const d = args;
    const periodLabel = d.period === "yearly" ? "Yearly" : "Monthly";
    const nextBilling = d.period === "yearly" ? "in 12 months" : "in 30 days";

    const html = shell(
      "Subscription Confirmed ✅",
      `${planLabel(d.plan)} Plan — ${periodLabel}`,
      `<p style="font-size:16px;color:#333;margin:0 0 8px;">Hi <strong>${d.companyName}</strong>,</p>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">
  Your subscription payment has been processed successfully. Here are the details:
</p>
<table style="${S.table}">
  <tr><th style="${S.th}">Plan</th><td style="${S.td}"><strong>${planLabel(d.plan)}</strong></td></tr>
  <tr><th style="${S.th}">Billing Period</th><td style="${S.td}">${periodLabel}</td></tr>
  <tr><th style="${S.th}">Amount</th><td style="${S.td}"><strong style="color:#28a745;">€${d.amount.toFixed(2)}</strong></td></tr>
  <tr><th style="${S.th}">Next Billing</th><td style="${S.td}">${nextBilling}</td></tr>
  <tr><th style="${S.th}">Status</th><td style="${S.td}"><span style="display:inline-block;background:#28a745;color:#fff;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:600;">Active</span></td></tr>
</table>
<p style="font-size:15px;color:#555;margin:0 0 24px;line-height:1.6;">
  You can manage your subscription, update your payment method, or download invoices from the
  <strong>Billing</strong> section in your dashboard.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="https://unlockedescapes.com/company/settings" style="${S.btn}">Manage Subscription →</a>
</div>
<p style="font-size:13px;color:#999;margin:0;line-height:1.6;">
  This charge will appear on your statement as "UNLOCKED". If you have questions, contact us at support@unlockedescapes.com.
</p>`,
      "UNLOCKED — Subscription Receipt"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: d.companyEmail,
      subject: `Subscription Receipt — ${planLabel(d.plan)} Plan | €${d.amount.toFixed(2)}`,
      html,
    }).then(r => console.log("[Email] Subscription receipt sent:", r))
      .catch(e => console.error("[Email] Subscription receipt failed:", e));
  },
});
