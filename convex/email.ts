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
  const addr = process.env.EMAIL_FROM || "noreply@unlocked.gr";
  const name = senderName || process.env.EMAIL_FROM_NAME || "UNLOCKED";
  return `${name} <${addr}>`;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fmtDate(dateStr: string, lang = "en"): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(lang === "el" ? "el-GR" : "en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function paymentLabel(status: string, lang = "en"): string {
  if (lang === "el") {
    switch (status) {
      case "paid": return "Εξοφλημένο";
      case "deposit": return "Προκαταβολή";
      case "unpaid": return "Πληρωμή στον χώρο";
      default: return status;
    }
  }
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
// Email i18n — EN / EL translations for player-facing emails
// ══════════════════════════════════════════════════════════════

type Lang = "en" | "el";

const emailI18n: Record<Lang, Record<string, string>> = {
  en: {
    // Booking
    "booking.title": "Booking Confirmed!",
    "booking.subtitle": "Your escape room adventure awaits",
    "booking.greeting": "Hi",
    "booking.thankYou": "Thank you for your booking! Your escape room experience is locked in. Here are your details:",
    "booking.room": "Room",
    "booking.date": "Date",
    "booking.time": "Time",
    "booking.players": "Players",
    "booking.total": "Total",
    "booking.payment": "Payment",
    "booking.deposit": "Deposit",
    "booking.notes": "Notes",
    "booking.keepCode": "Keep your booking code",
    "booking.keepCodeSuffix": "handy — you'll need it when you arrive.",
    "booking.needChanges": "Need changes? Call",
    "booking.viewTickets": "View My Tickets",
    "booking.footer": "Booked via UNLOCKED",
    // Booking company
    "booking.companyTitle": "New Booking Received",
    "booking.companyBody": "A new booking has been placed on your room.",
    "booking.customerDetails": "Customer Details",
    "booking.name": "Name",
    "booking.email": "Email",
    "booking.phone": "Phone",
    "booking.viewDashboard": "View in Dashboard",
    "booking.companyFooter": "UNLOCKED Platform",
    // Welcome
    "welcome.title": "Welcome to UNLOCKED!",
    "welcome.subtitle": "Your escape room journey starts here",
    "welcome.greeting": "Hi",
    "welcome.body": "Welcome to <strong style=\"color:#FF1E1E;\">UNLOCKED</strong> — Greece's escape room platform! You're now part of a community of escape room enthusiasts.",
    "welcome.whatYouCanDo": "Here's what you can do:",
    "welcome.discover": "<strong style=\"color:#FFFFFF;\">Discover</strong> — Browse escape rooms near you",
    "welcome.book": "<strong style=\"color:#FFFFFF;\">Book</strong> — Reserve your spot in seconds",
    "welcome.connect": "<strong style=\"color:#FFFFFF;\">Connect</strong> — Add friends and invite them to play",
    "welcome.compete": "<strong style=\"color:#FFFFFF;\">Compete</strong> — Climb the leaderboard and earn badges",
    "welcome.share": "<strong style=\"color:#FFFFFF;\">Share</strong> — Save and share your escape room photos",
    "welcome.startExploring": "Start Exploring",
    "welcome.rank": "Your rank:",
    "welcome.rankName": "Escape Rookie",
    "welcome.rankSuffix": "— Play more rooms to level up!",
    "welcome.footer": "UNLOCKED — Escape Room Platform",
    "welcome.subject": "Welcome to UNLOCKED! Your escape room adventure starts now",
    // Stripe receipt
    "receipt.title": "Payment Receipt",
    "receipt.subtitle": "Transaction for booking",
    "receipt.greeting": "Hi",
    "receipt.body": "Your payment has been processed successfully. Here is your receipt:",
    "receipt.bookingTotal": "Booking Total",
    "receipt.paymentType": "Payment Type",
    "receipt.amountCharged": "Amount Charged",
    "receipt.fullPayment": "Full Payment",
    "receipt.depositPayment": "20% Deposit + Service Fee",
    "receipt.payment": "Payment",
    "receipt.notice": "This is an automated payment receipt from UNLOCKED. The charge will appear on your statement as \"UNLOCKED\" or",
    "receipt.questions": "If you have questions about this charge, please contact us.",
    "receipt.footer": "UNLOCKED — Payment Receipt",
    // Slot alert
    "slot.title": "A Slot Just Opened Up!",
    "slot.subtitle": "at",
    "slot.greeting": "Hi",
    "slot.body": "Great news! A time slot you were watching just became available:",
    "slot.hurry": "This slot won't last long — book it now before someone else grabs it!",
    "slot.bookBtn": "Book This Slot",
    "slot.notice": "You received this email because you subscribed to notifications for this time slot on UNLOCKED.",
    "slot.footer": "UNLOCKED — Slot Alert",
    "slot.subject": "Slot Available:",
  },
  el: {
    // Booking
    "booking.title": "Η Κράτηση Επιβεβαιώθηκε!",
    "booking.subtitle": "Η escape room περιπέτειά σας σας περιμένει",
    "booking.greeting": "Γεια σου",
    "booking.thankYou": "Ευχαριστούμε για την κράτησή σου! Η εμπειρία escape room είναι κλεισμένη. Δες τις λεπτομέρειες:",
    "booking.room": "Δωμάτιο",
    "booking.date": "Ημερομηνία",
    "booking.time": "Ώρα",
    "booking.players": "Παίκτες",
    "booking.total": "Σύνολο",
    "booking.payment": "Πληρωμή",
    "booking.deposit": "Προκαταβολή",
    "booking.notes": "Σημειώσεις",
    "booking.keepCode": "Κράτα τον κωδικό κράτησης",
    "booking.keepCodeSuffix": "— θα τον χρειαστείς κατά την άφιξή σου.",
    "booking.needChanges": "Χρειάζεσαι αλλαγές; Κάλεσε στο",
    "booking.viewTickets": "Τα Εισιτήριά μου",
    "booking.footer": "Κράτηση μέσω UNLOCKED",
    // Booking company (stays EN for B2B but keys exist)
    "booking.companyTitle": "New Booking Received",
    "booking.companyBody": "A new booking has been placed on your room.",
    "booking.customerDetails": "Customer Details",
    "booking.name": "Name",
    "booking.email": "Email",
    "booking.phone": "Phone",
    "booking.viewDashboard": "View in Dashboard",
    "booking.companyFooter": "UNLOCKED Platform",
    // Welcome
    "welcome.title": "Καλώς ήρθες στο UNLOCKED!",
    "welcome.subtitle": "Η escape room περιπέτειά σου ξεκινά εδώ",
    "welcome.greeting": "Γεια σου",
    "welcome.body": "Καλώς ήρθες στο <strong style=\"color:#FF1E1E;\">UNLOCKED</strong> — την πλατφόρμα escape room της Ελλάδας! Είσαι πλέον μέλος μιας κοινότητας escape room λάτρεων.",
    "welcome.whatYouCanDo": "Τι μπορείς να κάνεις:",
    "welcome.discover": "<strong style=\"color:#FFFFFF;\">Ανακάλυψε</strong> — Βρες escape rooms κοντά σου",
    "welcome.book": "<strong style=\"color:#FFFFFF;\">Κράτησε</strong> — Κλείσε τη θέση σου σε δευτερόλεπτα",
    "welcome.connect": "<strong style=\"color:#FFFFFF;\">Σύνδεσου</strong> — Πρόσθεσε φίλους και κάλεσέ τους να παίξουν",
    "welcome.compete": "<strong style=\"color:#FFFFFF;\">Ανταγωνίσου</strong> — Ανέβα στο leaderboard και κέρδισε badges",
    "welcome.share": "<strong style=\"color:#FFFFFF;\">Μοιράσου</strong> — Αποθήκευσε και μοιράσου τις φωτογραφίες σου",
    "welcome.startExploring": "Ξεκίνα την Εξερεύνηση",
    "welcome.rank": "Η κατάταξή σου:",
    "welcome.rankName": "Escape Αρχάριος",
    "welcome.rankSuffix": "— Παίξε σε περισσότερα δωμάτια για να ανεβείς!",
    "welcome.footer": "UNLOCKED — Πλατφόρμα Escape Room",
    "welcome.subject": "Καλώς ήρθες στο UNLOCKED! Η escape room περιπέτειά σου ξεκινά τώρα",
    // Stripe receipt
    "receipt.title": "Απόδειξη Πληρωμής",
    "receipt.subtitle": "Συναλλαγή για κράτηση",
    "receipt.greeting": "Γεια σου",
    "receipt.body": "Η πληρωμή σου ολοκληρώθηκε επιτυχώς. Δες την απόδειξή σου:",
    "receipt.bookingTotal": "Σύνολο Κράτησης",
    "receipt.paymentType": "Τύπος Πληρωμής",
    "receipt.amountCharged": "Ποσό Χρέωσης",
    "receipt.fullPayment": "Πλήρης Πληρωμή",
    "receipt.depositPayment": "Προκαταβολή 20% + Χρέωση Υπηρεσίας",
    "receipt.payment": "Πληρωμή",
    "receipt.notice": "Αυτή είναι αυτόματη απόδειξη πληρωμής από το UNLOCKED. Η χρέωση θα εμφανιστεί στο statement σου ως \"UNLOCKED\" ή",
    "receipt.questions": "Αν έχεις ερωτήσεις σχετικά με τη χρέωση, επικοινώνησε μαζί μας.",
    "receipt.footer": "UNLOCKED — Απόδειξη Πληρωμής",
    // Slot alert
    "slot.title": "Ένα Slot Μόλις Άνοιξε!",
    "slot.subtitle": "στις",
    "slot.greeting": "Γεια σου",
    "slot.body": "Καλά νέα! Μια ώρα που παρακολουθούσες μόλις έγινε διαθέσιμη:",
    "slot.hurry": "Αυτό το slot δεν θα κρατήσει πολύ — κλείσ' το τώρα πριν το αρπάξει κάποιος άλλος!",
    "slot.bookBtn": "Κλείσε αυτό το Slot",
    "slot.notice": "Λαμβάνεις αυτό το email επειδή εγγράφηκες σε ειδοποιήσεις για αυτή τη χρονοθυρίδα στο UNLOCKED.",
    "slot.footer": "UNLOCKED — Ειδοποίηση Slot",
    "slot.subject": "Διαθέσιμο Slot:",
  },
};

function et(lang: Lang, key: string): string {
  return emailI18n[lang]?.[key] ?? emailI18n.en[key] ?? key;
}

// ══════════════════════════════════════════════════════════════
// Shared email styles — matches UNLOCKED brand (dark red theme)
// ══════════════════════════════════════════════════════════════

// Brand palette
const C = {
  bg: "#ffffff",
  dark: "#f5f5f5",
  card: "#f9f9f9",
  surface: "#f0f0f0",
  border: "#e0e0e0",
  red: "#DC2626",
  redHover: "#B91C1C",
  redLight: "#EF4444",
  gold: "#F59E0B",
  text: "#1a1a1a",
  textSecondary: "#555555",
  textMuted: "#999999",
  white: "#ffffff",
};

const S = {
  body: `margin:0;padding:0;background:${C.dark};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;`,
  wrapper: `padding:16px 8px;background:${C.dark};`,
  container: `max-width:600px;margin:0 auto;background:${C.bg};border-radius:16px;overflow:hidden;border:1px solid ${C.border};`,
  // Header — white bg with red bottom border
  header: `background-color:${C.bg};padding:28px 20px 24px;text-align:center;border-bottom:3px solid ${C.red};`,
  logo: `font-size:24px;font-weight:800;letter-spacing:3px;color:${C.red};margin:0 0 4px;`,
  headerTitle: `margin:10px 0 0;font-size:20px;font-weight:700;color:${C.text};`,
  headerSub: `margin:6px 0 0;font-size:13px;color:${C.textSecondary};word-break:break-word;`,
  content: `padding:20px 16px;`,
  // Booking code badge
  badge: `display:inline-block;background:${C.red};color:${C.white};font-size:18px;font-weight:800;padding:10px 20px;border-radius:10px;letter-spacing:2px;font-family:'Courier New',Courier,monospace;`,
  // Table styles
  table: `width:100%;border-collapse:separate;border-spacing:0;margin:20px 0;border-radius:12px;overflow:hidden;border:1px solid ${C.border};`,
  th: `text-align:left;padding:10px 12px;background-color:${C.surface};color:${C.textSecondary};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid ${C.border};width:35%;`,
  td: `padding:10px 12px;font-size:13px;color:${C.text};border-bottom:1px solid ${C.border};background-color:${C.bg};word-break:break-word;`,
  // Buttons
  btn: `display:inline-block;background-color:${C.red};color:${C.white};padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.5px;`,
  btnGreen: `display:inline-block;background-color:#22c55e;color:${C.white};padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.5px;`,
  // Footer
  footer: `padding:20px 16px;background:${C.dark};text-align:center;font-size:11px;color:${C.textMuted};border-top:1px solid ${C.border};`,
  footerLink: `color:${C.red};text-decoration:none;`,
  // Divider
  divider: `height:1px;background:${C.border};margin:24px 0;`,
  // Section header
  sectionTitle: `font-size:15px;font-weight:700;color:${C.text};margin:28px 0 12px;padding-bottom:8px;border-bottom:1px solid ${C.border};`,
  // Text styles
  greeting: `font-size:16px;color:${C.text};margin:0 0 8px;`,
  bodyText: `font-size:14px;color:${C.textSecondary};margin:0 0 24px;line-height:1.7;`,
  smallText: `font-size:13px;color:${C.textMuted};margin:24px 0 0;line-height:1.6;`,
  highlight: `color:${C.red};font-weight:600;`,
  // Status badge
  statusColor: (status: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      paid: { bg: "#22c55e", color: "#fff" },
      deposit: { bg: C.gold, color: "#1a1a1a" },
      unpaid: { bg: C.surface, color: C.textSecondary },
    };
    const c = map[status] || { bg: C.surface, color: C.textSecondary };
    return `display:inline-block;background:${c.bg};color:${c.color};padding:4px 14px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:0.3px;`;
  },
  // Feature check row
  featureRow: `padding:10px 12px;font-size:13px;color:${C.textSecondary};border-bottom:1px solid ${C.border};background-color:${C.bg};`,
};

// Helper to generate <th> with bgcolor for mobile email client compatibility
function TH(label: string): string {
  return `<th style="${S.th}" bgcolor="${C.surface}">${label}</th>`;
}
// Helper to generate <td> with bgcolor
function TD(content: string): string {
  return `<td style="${S.td}" bgcolor="${C.bg}">${content}</td>`;
}
// Helper for table wrapper with bgcolor
function TABLE(rows: string): string {
  return `<table style="${S.table}" bgcolor="${C.bg}">${rows}</table>`;
}
// Helper for feature row
function FR(content: string): string {
  return `<tr><td style="${S.featureRow}" bgcolor="${C.bg}">${content}</td></tr>`;
}

function shell(title: string, subtitle: string, body: string, footerText: string): string {
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${title}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="${S.body}" bgcolor="${C.dark}">
<div style="${S.wrapper}" bgcolor="${C.dark}">
<div style="${S.container}" bgcolor="${C.bg}">
<!-- Header -->
<div style="${S.header}" bgcolor="${C.bg}">
  <div style="${S.logo}">UNLOCKED</div>
  <h1 style="${S.headerTitle}">${title}</h1>
  <p style="${S.headerSub}">${subtitle}</p>
</div>
<!-- Content -->
<div style="${S.content}" bgcolor="${C.bg}">
${body}
</div>
<!-- Footer -->
<div style="${S.footer}" bgcolor="${C.dark}">
  <p style="margin:0 0 8px;color:${C.textMuted};">${footerText}</p>
  <p style="margin:0;color:${C.textMuted};">
    <a href="https://unlocked.gr" style="${S.footerLink}">unlocked.gr</a>
    &nbsp;·&nbsp;
    <a href="https://unlocked.gr/privacy" style="${S.footerLink}">Privacy</a>
    &nbsp;·&nbsp;
    <a href="https://unlocked.gr/terms" style="${S.footerLink}">Terms</a>
  </p>
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
    lang: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const d = args;
    const lang = (d.lang === "el" ? "el" : "en") as Lang;
    const fDate = fmtDate(d.date, lang);
    const playerEmail = isEmail(d.playerContact) ? d.playerContact : null;
    const promises: Promise<any>[] = [];

    // ── Player confirmation ──
    if (playerEmail) {
      const playerHtml = shell(
        et(lang, "booking.title"),
        et(lang, "booking.subtitle"),
        `<p style="${S.greeting}">${et(lang, "booking.greeting")} <strong>${d.playerName}</strong>,</p>
<p style="${S.bodyText}">
  ${et(lang, "booking.thankYou")}
</p>
<div style="text-align:center;margin:0 0 28px;"><span style="${S.badge}">${d.bookingCode}</span></div>
${TABLE(`
  <tr>${TH(et(lang, "booking.room"))}${TD(`<strong style="color:${C.red};">${d.roomTitle}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.date"))}${TD(fDate)}</tr>
  <tr>${TH(et(lang, "booking.time"))}${TD(d.time)}</tr>
  <tr>${TH(et(lang, "booking.players"))}${TD(String(d.players))}</tr>
  <tr>${TH(et(lang, "booking.total"))}${TD(`<strong>€${d.total.toFixed(2)}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.payment"))}${TD(`<span style="${S.statusColor(d.paymentStatus)}">${paymentLabel(d.paymentStatus, lang)}</span>`)}</tr>
  ${d.depositPaid ? `<tr>${TH(et(lang, "booking.deposit"))}${TD(`€${d.depositPaid.toFixed(2)}`)}</tr>` : ""}
  ${d.notes ? `<tr>${TH(et(lang, "booking.notes"))}${TD(d.notes)}</tr>` : ""}
`)}
<div style="${S.divider}"></div>
<p style="${S.bodyText}">
  ${et(lang, "booking.keepCode")} <strong style="color:${C.red};">${d.bookingCode}</strong> ${et(lang, "booking.keepCodeSuffix")}
  ${d.companyPhone ? `${et(lang, "booking.needChanges")} <strong>${d.companyPhone}</strong>.` : ""}
</p>
<div style="text-align:center;margin:24px 0;">
  <a href="https://unlocked.gr/tickets" style="${S.btn}">${et(lang, "booking.viewTickets")}</a>
</div>`,
        `${d.companyName} · ${et(lang, "booking.footer")}`
      );

      promises.push(
        resend.emails.send({
          from: fromAddr(d.companyName),
          to: playerEmail,
          subject: `${lang === "el" ? "Επιβεβαίωση Κράτησης" : "Booking Confirmation"} — ${d.bookingCode}`,
          html: playerHtml,
        }).then(r => console.log("[Email] Player booking confirm sent:", r))
          .catch(e => console.error("[Email] Player booking email failed:", e))
      );
    }

    // ── Company notification (always EN for B2B) ──
    if (d.companyEmail) {
      const companyHtml = shell(
        "New Booking Received",
        d.bookingCode,
        `<p style="${S.bodyText}">A new booking has been placed on your room.</p>
${TABLE(`
  <tr>${TH("Booking Code")}${TD(`<strong style="color:${C.red};">${d.bookingCode}</strong>`)}</tr>
  <tr>${TH("Room")}${TD(`<strong>${d.roomTitle}</strong>`)}</tr>
  <tr>${TH("Date")}${TD(fmtDate(d.date))}</tr>
  <tr>${TH("Time")}${TD(d.time)}</tr>
  <tr>${TH("Players")}${TD(String(d.players))}</tr>
  <tr>${TH("Total")}${TD(`<strong>€${d.total.toFixed(2)}</strong>`)}</tr>
  <tr>${TH("Payment")}${TD(`<span style="${S.statusColor(d.paymentStatus)}">${paymentLabel(d.paymentStatus)}</span>`)}</tr>
  ${d.depositPaid ? `<tr>${TH("Deposit")}${TD(`€${d.depositPaid.toFixed(2)}`)}</tr>` : ""}
`)}
<h3 style="${S.sectionTitle}">Customer Details</h3>
${TABLE(`
  <tr>${TH("Name")}${TD(d.playerName)}</tr>
  <tr>${TH("Email")}${TD(`<a href="mailto:${d.playerContact}" style="color:${C.red};">${d.playerContact}</a>`)}</tr>
  <tr>${TH("Phone")}${TD(`<a href="tel:${d.playerPhone}" style="color:${C.red};">${d.playerPhone || "—"}</a>`)}</tr>
  ${d.notes ? `<tr>${TH("Notes")}${TD(d.notes)}</tr>` : ""}
`)}
<div style="text-align:center;margin:24px 0;">
  <a href="https://business.unlocked.gr/bookings" style="${S.btn}">View in Dashboard</a>
</div>`,
        `${d.companyName} · UNLOCKED Platform`
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
    lang: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const lang = (args.lang === "el" ? "el" : "en") as Lang;

    const html = shell(
      et(lang, "welcome.title"),
      et(lang, "welcome.subtitle"),
      `<p style="${S.greeting}">${et(lang, "welcome.greeting")} <strong>${args.playerName}</strong>,</p>
<p style="${S.bodyText}">
  ${et(lang, "welcome.body")}
</p>
<p style="${S.bodyText}">${et(lang, "welcome.whatYouCanDo")}</p>
${TABLE(`
  ${FR(et(lang, "welcome.discover"))}
  ${FR(et(lang, "welcome.book"))}
  ${FR(et(lang, "welcome.connect"))}
  ${FR(et(lang, "welcome.compete"))}
  ${FR(et(lang, "welcome.share"))}
`)}
<div style="text-align:center;margin:32px 0;">
  <a href="https://unlocked.gr/discover" style="${S.btn}">${et(lang, "welcome.startExploring")}</a>
</div>
<div style="${S.divider}"></div>
<p style="font-size:13px;color:${C.textMuted};text-align:center;margin:0;">
  ${et(lang, "welcome.rank")} <strong style="color:${C.gold};">${et(lang, "welcome.rankName")}</strong> ${et(lang, "welcome.rankSuffix")}
</p>`,
      et(lang, "welcome.footer")
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.playerEmail,
      subject: et(lang, "welcome.subject"),
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
      "Welcome to UNLOCKED!",
      "Partner with Greece's escape room platform",
      `<p style="${S.greeting}">Hi <strong>${args.companyName}</strong>,</p>
<p style="${S.bodyText}">
  Thank you for registering on <strong style="color:${C.red};">UNLOCKED</strong>!
  We're excited to have you on board.
</p>
${planLine}
<p style="${S.bodyText}">Here's what happens next:</p>
${TABLE(`
  ${FR(`<strong style="color:${C.white};">Step 1</strong> — Complete your payment (if required)`)}
  ${FR(`<strong style="color:${C.white};">Step 2</strong> — Our team reviews your application`)}
  ${FR(`<strong style="color:${C.white};">Step 3</strong> — Once approved, add rooms and start receiving bookings!`)}
`)}
<p style="${S.bodyText}">
  You'll receive an email as soon as your account is approved.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="https://business.unlocked.gr" style="${S.btn}">Go to Dashboard</a>
</div>`,
      "UNLOCKED — Escape Room Platform"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.companyEmail,
      subject: "Welcome to UNLOCKED! Your registration is being processed",
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
      .map(f => FR(`<span style="color:#22c55e;margin-right:8px;">✓</span> ${f}`))
      .join("");

    const html = shell(
      "You're Approved!",
      "Your UNLOCKED account is now active",
      `<p style="${S.greeting}">Hi <strong>${args.companyName}</strong>,</p>
<p style="${S.bodyText}">
  Great news! Your company has been <strong style="color:#22c55e;">approved</strong> on UNLOCKED.
  You can now start adding your escape rooms and receiving bookings.
</p>
<div style="text-align:center;margin:0 0 28px;">
  <span style="${S.badge}">${planLabel(args.plan)} Plan</span>
</div>
<p style="${S.bodyText}">Your plan includes:</p>
${TABLE(featureRows)}
<p style="${S.bodyText}">
  Log in to your dashboard to start setting up your rooms.
  Players can discover and book your rooms as soon as you publish them!
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="https://business.unlocked.gr" style="${S.btnGreen}">Go to Dashboard</a>
</div>`,
      "UNLOCKED — Escape Room Platform"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.companyEmail,
      subject: `Your UNLOCKED account is approved! ${planLabel(args.plan)} Plan activated`,
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
    lang: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const d = args;
    const lang = (d.lang === "el" ? "el" : "en") as Lang;
    const fDate = fmtDate(d.date, lang);
    const termsLabel = d.paymentTerms === "full"
      ? et(lang, "receipt.fullPayment")
      : d.paymentTerms === "deposit_20"
        ? et(lang, "receipt.depositPayment")
        : et(lang, "receipt.payment");

    const html = shell(
      et(lang, "receipt.title"),
      `${et(lang, "receipt.subtitle")} ${d.bookingCode}`,
      `<p style="${S.greeting}">${et(lang, "receipt.greeting")} <strong>${d.playerName}</strong>,</p>
<p style="${S.bodyText}">
  ${et(lang, "receipt.body")}
</p>
<div style="text-align:center;margin:0 0 28px;">
  <span style="${S.badge}">${d.bookingCode}</span>
</div>
${TABLE(`
  <tr>${TH(et(lang, "booking.room"))}${TD(`<strong style="color:${C.red};">${d.roomTitle}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.date"))}${TD(fDate)}</tr>
  <tr>${TH(et(lang, "booking.time"))}${TD(d.time)}</tr>
  <tr>${TH(et(lang, "booking.players"))}${TD(String(d.players))}</tr>
  <tr>${TH(et(lang, "receipt.bookingTotal"))}${TD(`€${d.total.toFixed(2)}`)}</tr>
  <tr>${TH(et(lang, "receipt.paymentType"))}${TD(termsLabel)}</tr>
  <tr>${TH(et(lang, "receipt.amountCharged"))}${TD(`<strong style="color:#22c55e;">€${d.amountCharged.toFixed(2)}</strong>`)}</tr>
`)}
<div style="${S.divider}"></div>
<p style="${S.smallText}">
  ${et(lang, "receipt.notice")} "${d.companyName}".
  ${et(lang, "receipt.questions")}
</p>`,
      et(lang, "receipt.footer")
    );

    await resend.emails.send({
      from: fromAddr(),
      to: d.playerEmail,
      subject: `${lang === "el" ? "Απόδειξη Πληρωμής" : "Payment Receipt"} — €${d.amountCharged.toFixed(2)} | ${d.bookingCode}`,
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
      "Subscription Confirmed",
      `${planLabel(d.plan)} Plan — ${periodLabel}`,
      `<p style="${S.greeting}">Hi <strong>${d.companyName}</strong>,</p>
<p style="${S.bodyText}">
  Your subscription payment has been processed successfully. Here are the details:
</p>
${TABLE(`
  <tr>${TH("Plan")}${TD(`<strong style="color:${C.red};">${planLabel(d.plan)}</strong>`)}</tr>
  <tr>${TH("Billing Period")}${TD(periodLabel)}</tr>
  <tr>${TH("Amount")}${TD(`<strong style="color:#22c55e;">€${d.amount.toFixed(2)}</strong>`)}</tr>
  <tr>${TH("Next Billing")}${TD(nextBilling)}</tr>
  <tr>${TH("Status")}${TD(`<span style="display:inline-block;background:#22c55e;color:#fff;padding:4px 14px;border-radius:6px;font-size:12px;font-weight:700;">Active</span>`)}</tr>
`)}
<p style="${S.bodyText}">
  You can manage your subscription, update your payment method, or download invoices from the
  <strong>Billing</strong> section in your dashboard.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="https://business.unlocked.gr/billing" style="${S.btn}">Manage Subscription</a>
</div>
<div style="${S.divider}"></div>
<p style="${S.smallText}">
  This charge will appear on your statement as "UNLOCKED". If you have questions, contact us at hello@unlocked.gr.
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

// ══════════════════════════════════════════════════════════════
// 7. PHOTO DELIVERY EMAIL (photos.unlocked.gr)
// ══════════════════════════════════════════════════════════════

export const sendPhotoEmail = internalAction({
  args: {
    recipientEmail: v.string(),
    photoUrl: v.string(),
    photoPageUrl: v.string(),
    companyName: v.string(),
    companyLogo: v.optional(v.string()),
    roomTitle: v.optional(v.string()),
    teamName: v.optional(v.string()),
    escaped: v.optional(v.boolean()),
    escapeTime: v.optional(v.string()),
    lang: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return { messageId: null };

    const d = args;
    const escapeBadge = d.escaped !== undefined
      ? d.escaped
        ? `<span style="display:inline-block;background:#22c55e;color:#fff;padding:6px 16px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.5px;">✓ ESCAPED${d.escapeTime ? ` — ${d.escapeTime}` : ""}</span>`
        : `<span style="display:inline-block;background:${C.red};color:#fff;padding:6px 16px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.5px;">✗ LOCKED IN</span>`
      : "";

    const html = shell(
      d.teamName ? `${d.teamName}'s Escape Photo` : "Your Escape Room Photo",
      d.roomTitle ? `${d.roomTitle} — ${d.companyName}` : d.companyName,
      `<p style="${S.bodyText}">
  Your escape room photo from <strong style="color:${C.red};">${d.companyName}</strong> is ready!
</p>
${d.teamName ? `<p style="text-align:center;font-size:18px;font-weight:700;color:${C.text};margin:0 0 8px;">Team: ${d.teamName}</p>` : ""}
${escapeBadge ? `<div style="text-align:center;margin:0 0 20px;">${escapeBadge}</div>` : ""}
<!-- Photo -->
<div style="text-align:center;margin:20px 0;">
  <img src="${d.photoUrl}" alt="Escape Room Photo" style="max-width:100%;border-radius:12px;border:2px solid ${C.border};" />
</div>
<div style="text-align:center;margin:28px 0;">
  <a href="${d.photoPageUrl}" style="${S.btn}">View & Download Photo</a>
</div>
<div style="${S.divider}"></div>
<p style="${S.smallText};text-align:center;">
  Share your achievement with friends! This photo was created with ❤️ by ${d.companyName}.
</p>`,
      `${d.companyName} · Powered by UNLOCKED Photos`
    );

    const subjectLine = d.teamName
      ? `${d.teamName}'s Escape Photo — ${d.companyName}`
      : `Your Escape Room Photo — ${d.companyName}`;

    try {
      const result = await resend.emails.send({
        from: fromAddr(d.companyName),
        to: d.recipientEmail,
        subject: subjectLine,
        html,
      });
      console.log("[Email] Photo email sent:", result);
      return { messageId: (result as any)?.data?.id || null };
    } catch (e) {
      console.error("[Email] Photo email failed:", e);
      return { messageId: null };
    }
  },
});

// ══════════════════════════════════════════════════════════════
// 7. SLOT AVAILABLE EMAIL (sent when a booked slot opens up)
// ══════════════════════════════════════════════════════════════

export const sendSlotAvailableEmail = internalAction({
  args: {
    playerName: v.string(),
    playerEmail: v.string(),
    roomTitle: v.string(),
    date: v.string(),
    time: v.string(),
    roomId: v.string(),
    lang: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;

    const d = args;
    const lang = (d.lang === "el" ? "el" : "en") as Lang;

    const bookUrl = `https://unlocked.gr/rooms/${d.roomId}/book`;

    const html = shell(
      `${et(lang, "slot.title")} 🔔`,
      `${d.roomTitle} — ${fmtDate(d.date, lang)} ${et(lang, "slot.subtitle")} ${d.time}`,
      `<p style="${S.greeting}">${et(lang, "slot.greeting")} <strong>${d.playerName}</strong>,</p>
<p style="${S.bodyText}">
  ${et(lang, "slot.body")}
</p>
${TABLE(`
  <tr>${TH(et(lang, "booking.room"))}${TD(`<strong style="color:${C.red};">${d.roomTitle}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.date"))}${TD(fmtDate(d.date, lang))}</tr>
  <tr>${TH(et(lang, "booking.time"))}${TD(`<strong>${d.time}</strong>`)}</tr>
`)}
<p style="${S.bodyText}">
  ${et(lang, "slot.hurry")}
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="${bookUrl}" style="${S.btnGreen}">${et(lang, "slot.bookBtn")}</a>
</div>
<div style="${S.divider}"></div>
<p style="${S.smallText}">
  ${et(lang, "slot.notice")}
</p>`,
      et(lang, "slot.footer")
    );

    await resend.emails.send({
      from: fromAddr(),
      to: d.playerEmail,
      subject: `🔔 ${et(lang, "slot.subject")} ${d.roomTitle} — ${fmtDate(d.date, lang)} ${et(lang, "slot.subtitle")} ${d.time}`,
      html,
    }).then(r => console.log("[Email] Slot available email sent:", r))
      .catch(e => console.error("[Email] Slot available email failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// Admin: new company application notification
// ══════════════════════════════════════════════════════════════

export const sendNewApplicationNotification = internalAction({
  args: {
    companyName: v.string(),
    companyEmail: v.string(),
    plan: v.string(),
  },
  handler: async (_ctx, d) => {
    const resend = getResend();
    if (!resend) return;

    const html = shell(
      "New Company Application",
      "A new company is waiting for your review",
      `<h2 style="color:#E53E3E; margin:0 0 16px">New Application Submitted</h2>
<p style="color:#ccc; font-size:15px; margin:0 0 8px">
  <strong>${d.companyName}</strong> has submitted a new application and is waiting for review.
</p>
<p style="color:#999; font-size:14px; margin:0 0 4px">Email: ${d.companyEmail}</p>
<p style="color:#999; font-size:14px; margin:0 0 20px">Plan: ${d.plan}</p>
<a href="https://business.unlocked.gr/admin" style="display:inline-block; background:#E53E3E; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">
  Review Application
</a>`,
      "You received this email because a new company registered on UNLOCKED."
    );

    await resend.emails.send({
      from: fromAddr(),
      to: "dstroumpakos@planeraai.app",
      subject: `🏢 New Application: ${d.companyName} — Review Required`,
      html,
    }).then(r => console.log("[Email] Admin notification sent:", r))
      .catch(e => console.error("[Email] Admin notification failed:", e));
  },
});
