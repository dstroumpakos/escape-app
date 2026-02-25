/**
 * ═══════════════════════════════════════════════════════════════
 * Email Actions — Sends booking confirmation emails via Resend
 * ═══════════════════════════════════════════════════════════════
 *
 * Uses Convex actions (not mutations) because we call an external API.
 * Called from createGuestBooking after a booking is inserted.
 */

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";

// ─── Types ────────────────────────────────────────────────────

interface BookingEmailData {
  bookingCode: string;
  playerName: string;
  playerContact: string; // email
  playerPhone: string;   // phone number
  roomTitle: string;
  date: string;
  time: string;
  players: number;
  total: number;
  paymentStatus: string;
  depositPaid?: number;
  notes?: string;
  companyName: string;
  companyPhone: string;
}

// ─── Internal Action: Send Booking Emails ─────────────────────

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
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.log("[Email] RESEND_API_KEY not set — skipping emails");
      return;
    }

    const resend = new Resend(apiKey);
    const fromAddress = process.env.EMAIL_FROM || "bookings@escapebooking.com";
    const fromName = process.env.EMAIL_FROM_NAME || args.companyName;

    const data: BookingEmailData = {
      bookingCode: args.bookingCode,
      playerName: args.playerName,
      playerContact: args.playerContact,
      playerPhone: args.playerPhone,
      roomTitle: args.roomTitle,
      date: args.date,
      time: args.time,
      players: args.players,
      total: args.total,
      paymentStatus: args.paymentStatus,
      depositPaid: args.depositPaid,
      notes: args.notes,
      companyName: args.companyName,
      companyPhone: args.companyPhone,
    };

    // Determine if playerContact is an email
    const playerEmail = isEmail(args.playerContact) ? args.playerContact : null;

    const promises: Promise<any>[] = [];

    // 1. Send confirmation to player (only if they provided an email)
    if (playerEmail) {
      promises.push(
        resend.emails
          .send({
            from: `${fromName} <${fromAddress}>`,
            to: playerEmail,
            subject: `Booking Confirmation — ${args.bookingCode}`,
            html: buildPlayerEmailHtml(data),
          })
          .then((r) => console.log("[Email] Player confirmation sent:", r))
          .catch((e) => console.error("[Email] Player email failed:", e))
      );
    } else {
      console.log("[Email] Player contact is not an email, skipping player email");
    }

    // 2. Send notification to company
    if (args.companyEmail) {
      promises.push(
        resend.emails
          .send({
            from: `${fromName} <${fromAddress}>`,
            to: args.companyEmail,
            subject: `New Booking — ${args.bookingCode} | ${args.roomTitle}`,
            html: buildCompanyEmailHtml(data),
          })
          .then((r) => console.log("[Email] Company notification sent:", r))
          .catch((e) => console.error("[Email] Company email failed:", e))
      );
    } else {
      console.log("[Email] No company email configured, skipping");
    }

    await Promise.allSettled(promises);
  },
});

// ─── Helpers ──────────────────────────────────────────────────

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatDate(dateStr: string): string {
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
    case "paid":
      return "Paid in Full";
    case "deposit":
      return "Deposit Paid";
    case "unpaid":
      return "Pay on Arrival";
    default:
      return status;
  }
}

// ─── Shared Styles ────────────────────────────────────────────

const S = {
  body: "margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
  container:
    "max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);",
  header:
    "background:#1a1a2e;color:#ffffff;padding:32px 24px;text-align:center;",
  headerTitle: "margin:0;font-size:24px;font-weight:700;color:#ffffff;",
  headerSub: "margin:8px 0 0;font-size:14px;color:#a0a0b8;",
  content: "padding:32px 24px;",
  badge:
    "display:inline-block;background:#FF6B35;color:#fff;font-size:18px;font-weight:700;padding:8px 20px;border-radius:6px;letter-spacing:1px;",
  table: "width:100%;border-collapse:collapse;margin:24px 0;",
  th: "text-align:left;padding:12px 16px;background:#f8f9fa;color:#666;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #eee;width:40%;",
  td: "padding:12px 16px;font-size:15px;color:#1a1a2e;border-bottom:1px solid #eee;",
  footer:
    "padding:24px;background:#f8f9fa;text-align:center;font-size:12px;color:#999;",
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

// ─── Player Confirmation Email ────────────────────────────────

function buildPlayerEmailHtml(d: BookingEmailData): string {
  const fDate = formatDate(d.date);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${S.body}">
<div style="padding:24px;">
<div style="${S.container}">

<div style="${S.header}">
  <h1 style="${S.headerTitle}">Booking Confirmed! 🎉</h1>
  <p style="${S.headerSub}">Your escape room adventure awaits</p>
</div>

<div style="${S.content}">
  <p style="font-size:16px;color:#333;margin:0 0 8px;">Hi <strong>${d.playerName}</strong>,</p>
  <p style="font-size:15px;color:#555;margin:0 0 24px;">Thank you for your booking! Here are your details:</p>

  <div style="text-align:center;margin:0 0 24px;">
    <span style="${S.badge}">${d.bookingCode}</span>
  </div>

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
    Please keep your booking code <strong>${d.bookingCode}</strong> handy — you'll need it when you arrive.
    If you need to make changes, call us at <strong>${d.companyPhone}</strong>.
  </p>
</div>

<div style="${S.footer}">
  <p style="margin:0;">${d.companyName} — Automated booking confirmation</p>
</div>

</div>
</div>
</body></html>`;
}

// ─── Company Notification Email ───────────────────────────────

function buildCompanyEmailHtml(d: BookingEmailData): string {
  const fDate = formatDate(d.date);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="${S.body}">
<div style="padding:24px;">
<div style="${S.container}">

<div style="${S.header}">
  <h1 style="${S.headerTitle}">New Booking Received 📋</h1>
  <p style="${S.headerSub}">${d.bookingCode}</p>
</div>

<div style="${S.content}">
  <p style="font-size:16px;color:#333;margin:0 0 24px;">A new booking has been placed via the website widget.</p>

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
  </table>
</div>

<div style="${S.footer}">
  <p style="margin:0;">${d.companyName} — Automated booking notification</p>
</div>

</div>
</div>
</body></html>`;
}
