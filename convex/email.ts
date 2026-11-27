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
import { normalizePlan, planLabel } from "./plans";

/** "Free listing", or "Unlimited Plan" / "Pay as you go Plan". */
function planName(plan: string): string {
  return plan === "listing" ? planLabel(plan) : `${planLabel(plan)} Plan`;
}

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
  // The display name can come from a company: strip anything that could
  // break out of the header or pretend to be an address.
  const name = (senderName || process.env.EMAIL_FROM_NAME || "UNLOCKED")
    .replace(/[<>"\r\n,;@]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "UNLOCKED";
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
    "welcome.tagline": "ESCAPE ROOMS · GREECE",
    "welcome.title": "The door is open, {name}.",
    "welcome.subtitle": "Welcome to UNLOCKED — your adventure starts now.",
    "welcome.intro": "You’re now part of Greece’s escape room community. Before you walk out of your first room, we found <strong style=\"color:#ff2a36;\">5 clues</strong> for you:",
    "welcome.clue": "CLUE",
    "welcome.c1.title": "Discover rooms",
    "welcome.c1.text": "Find escape rooms near you by theme, difficulty and fear level.",
    "welcome.c2.title": "Collect stamps",
    "welcome.c2.text": "Every room you solve goes into your passport.",
    "welcome.c3.title": "Follow your team",
    "welcome.c3.text": "See where your friends play and invite them to the next mission.",
    "welcome.c4.title": "Climb the leaderboard",
    "welcome.c4.text": "Earn badges and take your place among the best.",
    "welcome.c5.title": "Share the moment",
    "welcome.c5.text": "Put your team photo in your Instagram story with one tap.",
    "welcome.cta": "Enter your first room",
    "welcome.rank": "YOUR RANK",
    "welcome.rankName": "Escape Rookie",
    "welcome.rankHint": "Play more rooms to level up.",
    "welcome.quote": "“Every lock has its key.”",
    "welcome.footer": "UNLOCKED — Escape Room Platform",
    "welcome.preheader": "The door is open — your account is ready.",
    "welcome.subject": "The door is open — welcome to UNLOCKED",
    // Stripe receipt
    "receipt.title": "Payment Receipt",
    "receipt.subtitle": "Transaction for booking",
    "receipt.greeting": "Hi",
    "receipt.body": "Your payment has been processed successfully. Here is your receipt:",
    "receipt.bookingTotal": "Booking Total",
    "receipt.paymentType": "Payment Type",
    "receipt.amountCharged": "Amount Charged",
    "receipt.fullPayment": "Full Payment",
    "receipt.depositPayment": "Deposit",
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
    "welcome.tagline": "ESCAPE ROOMS · ΕΛΛΑΔΑ",
    "welcome.title": "Η πόρτα άνοιξε, {name}.",
    "welcome.subtitle": "Καλώς ήρθες στο UNLOCKED — η περιπέτειά σου ξεκινά τώρα.",
    "welcome.intro": "Είσαι πλέον μέλος της κοινότητας escape room της Ελλάδας. Πριν βγεις από το πρώτο σου δωμάτιο, βρήκαμε για σένα <strong style=\"color:#ff2a36;\">5 στοιχεία</strong>:",
    "welcome.clue": "ΣΤΟΙΧΕΙΟ",
    "welcome.c1.title": "Ανακάλυψε δωμάτια",
    "welcome.c1.text": "Βρες escape rooms κοντά σου, ανά θέμα, δυσκολία και επίπεδο τρόμου.",
    "welcome.c2.title": "Μάζεψε σφραγίδες",
    "welcome.c2.text": "Κάθε δωμάτιο που λύνεις μπαίνει στο διαβατήριό σου.",
    "welcome.c3.title": "Ακολούθησε την ομάδα σου",
    "welcome.c3.text": "Δες πού παίζουν οι φίλοι σου και κάλεσέ τους στην επόμενη αποστολή.",
    "welcome.c4.title": "Ανέβα στην κατάταξη",
    "welcome.c4.text": "Κέρδισε badges και πάρε τη θέση σου ανάμεσα στους καλύτερους.",
    "welcome.c5.title": "Μοιράσου τη στιγμή",
    "welcome.c5.text": "Βάλε τη φωτογραφία της ομάδας σου στο Instagram story με ένα πάτημα.",
    "welcome.cta": "Μπες στο πρώτο σου δωμάτιο",
    "welcome.rank": "Η ΚΑΤΑΤΑΞΗ ΣΟΥ",
    "welcome.rankName": "Escape Αρχάριος",
    "welcome.rankHint": "Παίξε σε περισσότερα δωμάτια για να ανεβείς.",
    "welcome.quote": "«Κάθε κλειδαριά έχει το κλειδί της.»",
    "welcome.footer": "UNLOCKED — Πλατφόρμα Escape Room",
    "welcome.preheader": "Η πόρτα άνοιξε — ο λογαριασμός σου είναι έτοιμος.",
    "welcome.subject": "Η πόρτα άνοιξε — καλώς ήρθες στο UNLOCKED",
    // Stripe receipt
    "receipt.title": "Απόδειξη Πληρωμής",
    "receipt.subtitle": "Συναλλαγή για κράτηση",
    "receipt.greeting": "Γεια σου",
    "receipt.body": "Η πληρωμή σου ολοκληρώθηκε επιτυχώς. Δες την απόδειξή σου:",
    "receipt.bookingTotal": "Σύνολο Κράτησης",
    "receipt.paymentType": "Τύπος Πληρωμής",
    "receipt.amountCharged": "Ποσό Χρέωσης",
    "receipt.fullPayment": "Πλήρης Πληρωμή",
    "receipt.depositPayment": "Προκαταβολή",
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
        `<p style="${S.greeting}">${et(lang, "booking.greeting")} <strong>${escHtml(d.playerName)}</strong>,</p>
<p style="${S.bodyText}">
  ${et(lang, "booking.thankYou")}
</p>
<div style="text-align:center;margin:0 0 28px;"><span style="${S.badge}">${escHtml(d.bookingCode)}</span></div>
${TABLE(`
  <tr>${TH(et(lang, "booking.room"))}${TD(`<strong style="color:${C.red};">${escHtml(d.roomTitle)}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.date"))}${TD(fDate)}</tr>
  <tr>${TH(et(lang, "booking.time"))}${TD(escHtml(d.time))}</tr>
  <tr>${TH(et(lang, "booking.players"))}${TD(String(d.players))}</tr>
  <tr>${TH(et(lang, "booking.total"))}${TD(`<strong>€${d.total.toFixed(2)}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.payment"))}${TD(`<span style="${S.statusColor(d.paymentStatus)}">${paymentLabel(d.paymentStatus, lang)}</span>`)}</tr>
  ${d.depositPaid ? `<tr>${TH(et(lang, "booking.deposit"))}${TD(`€${d.depositPaid.toFixed(2)}`)}</tr>` : ""}
  ${d.notes ? `<tr>${TH(et(lang, "booking.notes"))}${TD(escHtml(d.notes))}</tr>` : ""}
`)}
<div style="${S.divider}"></div>
<p style="${S.bodyText}">
  ${et(lang, "booking.keepCode")} <strong style="color:${C.red};">${escHtml(d.bookingCode)}</strong> ${et(lang, "booking.keepCodeSuffix")}
  ${d.companyPhone ? `${et(lang, "booking.needChanges")} <strong>${escHtml(d.companyPhone)}</strong>.` : ""}
</p>
<div style="text-align:center;margin:24px 0;">
  <a href="https://unlocked.gr/tickets" style="${S.btn}">${et(lang, "booking.viewTickets")}</a>
</div>`,
        `${escHtml(d.companyName)} · ${et(lang, "booking.footer")}`
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
  <tr>${TH("Booking Code")}${TD(`<strong style="color:${C.red};">${escHtml(d.bookingCode)}</strong>`)}</tr>
  <tr>${TH("Room")}${TD(`<strong>${escHtml(d.roomTitle)}</strong>`)}</tr>
  <tr>${TH("Date")}${TD(fmtDate(d.date))}</tr>
  <tr>${TH("Time")}${TD(escHtml(d.time))}</tr>
  <tr>${TH("Players")}${TD(String(d.players))}</tr>
  <tr>${TH("Total")}${TD(`<strong>€${d.total.toFixed(2)}</strong>`)}</tr>
  <tr>${TH("Payment")}${TD(`<span style="${S.statusColor(d.paymentStatus)}">${paymentLabel(d.paymentStatus)}</span>`)}</tr>
  ${d.depositPaid ? `<tr>${TH("Deposit")}${TD(`€${d.depositPaid.toFixed(2)}`)}</tr>` : ""}
`)}
<h3 style="${S.sectionTitle}">Customer Details</h3>
${TABLE(`
  <tr>${TH("Name")}${TD(escHtml(d.playerName))}</tr>
  <tr>${TH("Email")}${TD(`<a href="mailto:${escHtml(d.playerContact)}" style="color:${C.red};">${escHtml(d.playerContact)}</a>`)}</tr>
  <tr>${TH("Phone")}${TD(`<a href="tel:${escHtml(d.playerPhone)}" style="color:${C.red};">${d.playerPhone ? escHtml(d.playerPhone) : "—"}</a>`)}</tr>
  ${d.notes ? `<tr>${TH("Notes")}${TD(escHtml(d.notes))}</tr>` : ""}
`)}
<div style="text-align:center;margin:24px 0;">
  <a href="https://business.unlocked.gr/bookings" style="${S.btn}">View in Dashboard</a>
</div>`,
        `${escHtml(d.companyName)} · UNLOCKED Platform`
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

// Player welcome email: its own dark, escape-room themed layout (not shell()).
// Tables + inline styles so it holds up in Gmail / Outlook / Apple Mail.
export function welcomeHtml(lang: Lang, playerName: string): string {
  const w = (k: string) => et(lang, "welcome." + k);
  const font = "Inter,Arial,Helvetica,sans-serif";
  const serif = "'Noto Serif Display',Georgia,'Times New Roman',serif";
  const clues: [string, string][] = [["🔍", "c1"], ["🎟️", "c2"], ["👥", "c3"], ["🏆", "c4"], ["📸", "c5"]];
  const clueRows = clues
    .map(
      ([icon, k], i) => `<tr><td style="padding:0 0 10px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#160c0c" style="background-color:#160c0c;border:1px solid #2a1414;border-left:3px solid #c8101b;border-radius:10px;">
    <tr>
      <td width="56" align="center" valign="middle" style="padding:14px 0 14px 8px;font-size:26px;line-height:1;">${icon}</td>
      <td style="padding:14px 16px 14px 6px;font-family:${font};">
        <div style="font-size:10px;letter-spacing:2px;color:#ff2a36;font-weight:700;">${w("clue")} ${i + 1}/5</div>
        <div style="font-size:15px;font-weight:700;color:#ffffff;margin-top:2px;">${w(k + ".title")}</div>
        <div style="font-size:13px;line-height:1.5;color:#a8968a;margin-top:2px;">${w(k + ".text")}</div>
      </td>
    </tr>
  </table>
</td></tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${w("subject")}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Display:wght@700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#050303;" bgcolor="#050303">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#050303;">${w("preheader")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050303" style="background-color:#050303;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#0e0808" style="width:100%;max-width:600px;background-color:#0e0808;border:1px solid #2a1414;border-radius:18px;overflow:hidden;">

  <tr><td align="center" bgcolor="#120606" style="background-color:#120606;background-image:radial-gradient(ellipse at 50% 0%,#5a0a10 0%,#120606 70%);padding:38px 24px 32px;border-bottom:2px solid #c8101b;">
    <div style="font-family:${serif};font-size:30px;font-weight:800;letter-spacing:6px;color:#e8dcc8;">UN<span style="color:#ff2a36;">LOCKED</span></div>
    <div style="font-family:${font};font-size:11px;letter-spacing:4px;color:#8a7468;margin-top:6px;">${w("tagline")}</div>
    <h1 style="font-family:${serif};font-size:30px;line-height:1.2;font-weight:800;color:#ffffff;margin:28px 0 8px;">${w("title").replace("{name}", escHtml(playerName))}</h1>
    <p style="font-family:${font};font-size:15px;line-height:1.5;color:#c9b8a6;margin:0;">${w("subtitle")}</p>
  </td></tr>

  <tr><td style="padding:30px 32px 6px;font-family:${font};font-size:15px;line-height:1.65;color:#d8cbbb;">${w("intro")}</td></tr>

  <tr><td style="padding:16px 24px 8px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${clueRows}
    </table>
  </td></tr>

  <tr><td align="center" style="padding:20px 24px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" bgcolor="#c8101b" style="background-color:#c8101b;background-image:linear-gradient(180deg,#e0141f,#a00a14);border:1px solid #ff2a36;border-radius:10px;">
        <a href="https://unlocked.gr/discover" style="display:inline-block;padding:16px 38px;font-family:${font};font-size:15px;font-weight:700;letter-spacing:1px;color:#ffffff;text-decoration:none;">🔓 ${w("cta")}</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding:26px 24px 30px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#140f06" style="background-color:#140f06;border:1px dashed #b8892b;border-radius:12px;">
      <tr><td align="center" style="padding:14px 26px;font-family:${font};">
        <div style="font-size:10px;letter-spacing:3px;color:#8a7468;">${w("rank")}</div>
        <div style="font-family:${serif};font-size:20px;font-weight:800;color:#f0b43c;margin-top:4px;">🗝️ ${w("rankName")}</div>
        <div style="font-size:12px;color:#a8968a;margin-top:4px;">${w("rankHint")}</div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" bgcolor="#080404" style="background-color:#080404;border-top:1px solid #2a1414;padding:22px 24px;font-family:${font};">
    <div style="font-size:12px;color:#6f5d53;font-style:italic;">${w("quote")}</div>
    <div style="font-size:12px;color:#6f5d53;margin-top:10px;">${w("footer")}</div>
    <div style="font-size:12px;margin-top:6px;">
      <a href="https://unlocked.gr" style="color:#ff2a36;text-decoration:none;">unlocked.gr</a><span style="color:#4a3a32;">&nbsp;·&nbsp;</span><a href="https://unlocked.gr/privacy" style="color:#ff2a36;text-decoration:none;">Privacy</a><span style="color:#4a3a32;">&nbsp;·&nbsp;</span><a href="https://unlocked.gr/terms" style="color:#ff2a36;text-decoration:none;">Terms</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

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

    const html = welcomeHtml(lang, args.playerName);

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
// CONFIRM-YOUR-EMAIL LINK (new player accounts, widget bookings)
// See emailVerify.ts. The url is built on the server, never from input.
// ══════════════════════════════════════════════════════════════
export const sendConfirmLink = internalAction({
  args: {
    kind: v.union(v.literal("account"), v.literal("booking")),
    to: v.string(),
    name: v.string(),
    url: v.string(),
    lang: v.optional(v.string()),
    roomTitle: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    if (!resend) return;
    const el = args.lang === "el";
    const isBooking = args.kind === "booking";

    const title = isBooking
      ? (el ? "Επιβεβαιώστε την κράτησή σας" : "Confirm your booking")
      : (el ? "Επιβεβαιώστε το email σας" : "Confirm your email");
    const subtitle = isBooking
      ? (el ? "Η κράτηση κρατιέται για 30 λεπτά" : "We're holding your booking for 30 minutes")
      : (el ? "Ένα βήμα ακόμα" : "One more step");
    const intro = isBooking
      ? (el
          ? `Πατήστε το κουμπί για να επιβεβαιώσετε την κράτηση <strong>${escHtml(args.roomTitle ?? "")}</strong> στις ${escHtml(args.date ?? "")} ${escHtml(args.time ?? "")}. Αν δεν την επιβεβαιώσετε μέσα σε 30 λεπτά, θα ακυρωθεί.`
          : `Press the button to confirm your booking for <strong>${escHtml(args.roomTitle ?? "")}</strong> on ${escHtml(args.date ?? "")} at ${escHtml(args.time ?? "")}. If you don't confirm within 30 minutes, it will be cancelled.`)
      : (el
          ? "Πατήστε το κουμπί για να επιβεβαιώσετε το email σας. Μετά μπορείτε να κάνετε κρατήσεις με πληρωμή στην άφιξη."
          : "Press the button to confirm your email. After that you can make bookings that you pay for on arrival.");
    const button = isBooking
      ? (el ? "Επιβεβαίωση κράτησης" : "Confirm booking")
      : (el ? "Επιβεβαίωση email" : "Confirm email");
    const ignore = el
      ? "Αν δεν το ζητήσατε εσείς, αγνοήστε αυτό το email."
      : "If this wasn't you, you can ignore this email.";

    const html = shell(
      title,
      subtitle,
      `<p style="${S.greeting}">${el ? "Γεια σας" : "Hi"} <strong>${escHtml(args.name)}</strong>,</p>
<p style="${S.bodyText}">${intro}</p>
<div style="text-align:center;margin:32px 0;">
  <a href="${escHtml(args.url)}" style="${S.btn}">${button}</a>
</div>
<p style="font-size:13px;color:${C.textMuted};text-align:center;margin:0;">${ignore}</p>`,
      "Unlocked"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.to,
      subject: title,
      html,
    }).then(r => console.log("[Email] Confirm link sent:", r))
      .catch(e => console.error("[Email] Confirm link failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// SIGN-UP CODE (6 digits). See signupCodes.ts.
// ══════════════════════════════════════════════════════════════
export const sendSignupCode = internalAction({
  args: {
    to: v.string(),
    code: v.string(),
    lang: v.optional(v.string()),
    kind: v.union(v.literal("player"), v.literal("company")),
    // "signup" (default) or "reset" (forgot password, see passwordReset.ts)
    purpose: v.optional(v.union(v.literal("signup"), v.literal("reset"))),
  },
  handler: async (_ctx, args) => {
    const resend = getResend();
    const isReset = args.purpose === "reset";
    if (!resend) {
      // Dev without RESEND_API_KEY: the code shows in the Convex logs instead.
      console.log(`[Email] ${isReset ? "Password reset" : "Sign-up"} code for ${args.to}: ${args.code}`);
      return;
    }
    const el = args.lang === "el";
    const title = el ? "Ο κωδικός επιβεβαίωσης" : "Your confirmation code";
    const subtitle = el ? "Ισχύει για 15 λεπτά" : "Valid for 15 minutes";
    const intro = isReset
      ? el
        ? "Γράψτε αυτόν τον κωδικό για να ορίσετε νέο κωδικό πρόσβασης στο Unlocked."
        : "Enter this code to set a new password for your Unlocked account."
      : args.kind === "company"
        ? el
          ? "Γράψτε αυτόν τον κωδικό για να ολοκληρώσετε την εγγραφή της επιχείρησής σας στο Unlocked."
          : "Enter this code to finish registering your business on Unlocked."
        : el
          ? "Γράψε αυτόν τον κωδικό για να ολοκληρώσεις την εγγραφή σου στο Unlocked."
          : "Enter this code to finish signing up for Unlocked.";
    const ignore = el
      ? "Αν δεν το ζητήσατε εσείς, αγνοήστε αυτό το email. Μην δώσετε τον κωδικό σε κανέναν."
      : "If this wasn't you, ignore this email. Never share this code with anyone.";

    const html = shell(
      title,
      subtitle,
      `<p style="${S.bodyText}">${intro}</p>
<div style="text-align:center;margin:28px 0;">
  <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:10px;font-family:monospace;color:${C.white};background-color:${C.red};padding:14px 24px;border-radius:12px;">${escHtml(args.code)}</span>
</div>
<p style="font-size:13px;color:${C.textMuted};text-align:center;margin:0;">${ignore}</p>`,
      "Unlocked"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.to,
      // Code in the subject too, so it shows in the phone notification.
      subject: `${args.code} · ${title}`,
      html,
    }).then(r => console.log("[Email] Sign-up code sent:", r))
      .catch(e => console.error("[Email] Sign-up code failed:", e));
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
      ? `<p style="font-size:15px;color:#555;margin:0 0 8px;">Selected plan: <strong>${planName(args.plan)}</strong></p>`
      : "";

    const html = shell(
      "Welcome to UNLOCKED!",
      "Partner with the escape room platform",
      `<p style="${S.greeting}">Hi <strong>${escHtml(args.companyName)}</strong>,</p>
<p style="${S.bodyText}">
  Thank you for registering on <strong style="color:${C.red};">UNLOCKED</strong>!
  We're excited to have you on board.
</p>
${planLine}
<p style="${S.bodyText}">Here's what happens next:</p>
${TABLE(`
  ${FR(`<strong style="color:${C.white};">Step 1</strong> — Accept the terms in your dashboard`)}
  ${FR(`<strong style="color:${C.white};">Step 2</strong> — Our team reviews your application`)}
  ${FR(`<strong style="color:${C.white};">Step 3</strong> — Once approved, add your rooms and they go live on UNLOCKED`)}
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

    const everything = [
      "Unlimited rooms",
      "Booking management dashboard and full analytics",
      "Embeddable booking widget",
      "Online payments into your own Stripe or Viva account",
      "Featured listings and email notifications",
    ];
    const listing = args.plan === "listing";
    const planFeatures = listing
      ? [
          "Free while we launch: no fees, no card needed",
          "Unlimited rooms, each with photos, trailer and its own page",
          "\"Book\" sends players to your own booking page",
          "Your Instagram posts on your room pages",
          "Views and clicks for every room",
          "Your merch in the UNLOCKED shop, with no fee",
        ]
      : normalizePlan(args.plan) === "unlimited"
        ? ["€198/month or €1980/year, no per-booking fees", ...everything]
        : ["€3 per booking made through UNLOCKED, never more than €250 a month", "Invoiced by email at the start of each month", ...everything];
    const featureRows = planFeatures
      .map(f => FR(`<span style="color:#22c55e;margin-right:8px;">✓</span> ${f}`))
      .join("");

    const html = shell(
      "You're Approved!",
      "Your UNLOCKED account is now active",
      `<p style="${S.greeting}">Hi <strong>${escHtml(args.companyName)}</strong>,</p>
<p style="${S.bodyText}">
  Great news! Your company has been <strong style="color:#22c55e;">approved</strong> on UNLOCKED.
  ${listing ? "You can now add your escape rooms." : "You can now start adding your escape rooms and receiving bookings."}
</p>
<div style="text-align:center;margin:0 0 28px;">
  <span style="${S.badge}">${planName(args.plan)}</span>
</div>
<p style="${S.bodyText}">Your plan includes:</p>
${TABLE(featureRows)}
<p style="${S.bodyText}">
  Log in to your dashboard to start setting up your rooms.
  ${listing ? "Players can discover your rooms as soon as you publish them, and book them on your own site." : "Players can discover and book your rooms as soon as you publish them!"}
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="https://business.unlocked.gr" style="${S.btnGreen}">Go to Dashboard</a>
</div>`,
      "UNLOCKED — Escape Room Platform"
    );

    await resend.emails.send({
      from: fromAddr(),
      to: args.companyEmail,
      subject: listing ? "Your UNLOCKED account is approved!" : `Your UNLOCKED account is approved! ${planLabel(args.plan)} Plan activated`,
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
      `${et(lang, "receipt.subtitle")} ${escHtml(d.bookingCode)}`,
      `<p style="${S.greeting}">${et(lang, "receipt.greeting")} <strong>${escHtml(d.playerName)}</strong>,</p>
<p style="${S.bodyText}">
  ${et(lang, "receipt.body")}
</p>
<div style="text-align:center;margin:0 0 28px;">
  <span style="${S.badge}">${escHtml(d.bookingCode)}</span>
</div>
${TABLE(`
  <tr>${TH(et(lang, "booking.room"))}${TD(`<strong style="color:${C.red};">${escHtml(d.roomTitle)}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.date"))}${TD(fDate)}</tr>
  <tr>${TH(et(lang, "booking.time"))}${TD(escHtml(d.time))}</tr>
  <tr>${TH(et(lang, "booking.players"))}${TD(String(d.players))}</tr>
  <tr>${TH(et(lang, "receipt.bookingTotal"))}${TD(`€${d.total.toFixed(2)}`)}</tr>
  <tr>${TH(et(lang, "receipt.paymentType"))}${TD(termsLabel)}</tr>
  <tr>${TH(et(lang, "receipt.amountCharged"))}${TD(`<strong style="color:#22c55e;">€${d.amountCharged.toFixed(2)}</strong>`)}</tr>
`)}
<div style="${S.divider}"></div>
<p style="${S.smallText}">
  ${et(lang, "receipt.notice")} "${escHtml(d.companyName)}".
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
      `<p style="${S.greeting}">Hi <strong>${escHtml(d.companyName)}</strong>,</p>
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
    if (!/^https:\/\//i.test(d.photoUrl) || !/^https:\/\//i.test(d.photoPageUrl) || !isEmail(d.recipientEmail)) {
      return { messageId: null };
    }
    const escapeBadge = d.escaped !== undefined
      ? d.escaped
        ? `<span style="display:inline-block;background:#22c55e;color:#fff;padding:6px 16px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.5px;">✓ ESCAPED${d.escapeTime ? ` — ${escHtml(d.escapeTime)}` : ""}</span>`
        : `<span style="display:inline-block;background:${C.red};color:#fff;padding:6px 16px;border-radius:8px;font-size:14px;font-weight:700;letter-spacing:0.5px;">✗ LOCKED IN</span>`
      : "";

    const html = shell(
      d.teamName ? `${escHtml(d.teamName)}'s Escape Photo` : "Your Escape Room Photo",
      d.roomTitle ? `${escHtml(d.roomTitle)} — ${escHtml(d.companyName)}` : escHtml(d.companyName),
      `<p style="${S.bodyText}">
  Your escape room photo from <strong style="color:${C.red};">${escHtml(d.companyName)}</strong> is ready!
</p>
${d.teamName ? `<p style="text-align:center;font-size:18px;font-weight:700;color:${C.text};margin:0 0 8px;">Team: ${escHtml(d.teamName)}</p>` : ""}
${escapeBadge ? `<div style="text-align:center;margin:0 0 20px;">${escapeBadge}</div>` : ""}
<!-- Photo -->
<div style="text-align:center;margin:20px 0;">
  <img src="${escHtml(d.photoUrl)}" alt="Escape Room Photo" style="max-width:100%;border-radius:12px;border:2px solid ${C.border};" />
</div>
<div style="text-align:center;margin:28px 0;">
  <a href="${escHtml(d.photoPageUrl)}" style="${S.btn}">View & Download Photo</a>
</div>
<div style="${S.divider}"></div>
<p style="${S.smallText};text-align:center;">
  Share your achievement with friends! This photo was created with ❤️ by ${escHtml(d.companyName)}.
</p>`,
      `${escHtml(d.companyName)} · Powered by UNLOCKED Photos`
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
      `${escHtml(d.roomTitle)} — ${fmtDate(d.date, lang)} ${et(lang, "slot.subtitle")} ${d.time}`,
      `<p style="${S.greeting}">${et(lang, "slot.greeting")} <strong>${escHtml(d.playerName)}</strong>,</p>
<p style="${S.bodyText}">
  ${et(lang, "slot.body")}
</p>
${TABLE(`
  <tr>${TH(et(lang, "booking.room"))}${TD(`<strong style="color:${C.red};">${escHtml(d.roomTitle)}</strong>`)}</tr>
  <tr>${TH(et(lang, "booking.date"))}${TD(fmtDate(d.date, lang))}</tr>
  <tr>${TH(et(lang, "booking.time"))}${TD(`<strong>${escHtml(d.time)}</strong>`)}</tr>
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
  <strong>${escHtml(d.companyName)}</strong> has submitted a new application and is waiting for review.
</p>
<p style="color:#999; font-size:14px; margin:0 0 4px">Email: ${escHtml(d.companyEmail)}</p>
<p style="color:#999; font-size:14px; margin:0 0 20px">Plan: ${escHtml(planName(d.plan))}</p>
<a href="https://business.unlocked.gr/admin" style="display:inline-block; background:#E53E3E; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">
  Review Application
</a>`,
      "You received this email because a new company registered on UNLOCKED."
    );

    const adminTo = process.env.ADMIN_NOTIFY_EMAIL;
    if (!adminTo) {
      console.warn("[Email] ADMIN_NOTIFY_EMAIL not set — admin notification skipped");
      return;
    }

    await resend.emails.send({
      from: fromAddr(),
      to: adminTo,
      subject: `🏢 New Application: ${d.companyName} — Review Required`,
      html,
    }).then(r => console.log("[Email] Admin notification sent:", r))
      .catch(e => console.error("[Email] Admin notification failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// Admin: a player reported a room (details stay in the admin page)
// ══════════════════════════════════════════════════════════════

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export const sendRoomReportAlert = internalAction({
  args: {
    roomTitle: v.string(),
    companyName: v.string(),
    kind: v.union(v.literal("safety"), v.literal("behaviour")),
    photoCount: v.number(),
  },
  handler: async (_ctx, d) => {
    const resend = getResend();
    if (!resend) return;

    const kindLabel = d.kind === "safety" ? "Safety issue" : "Inappropriate behaviour";
    const html = shell(
      "New Room Report",
      "A player reported a room",
      `<h2 style="color:#E53E3E; margin:0 0 16px">${kindLabel}</h2>
<p style="color:#ccc; font-size:15px; margin:0 0 8px">
  Room: <strong>${escHtml(d.roomTitle)}</strong> (${escHtml(d.companyName)})
</p>
<p style="color:#999; font-size:14px; margin:0 0 20px">Photos attached: ${d.photoCount}</p>
<a href="https://business.unlocked.gr/admin" style="display:inline-block; background:#E53E3E; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">
  Open the reports queue
</a>`,
      "You received this email because you are an UNLOCKED admin."
    );

    const adminTo = process.env.ADMIN_NOTIFY_EMAIL;
    if (!adminTo) {
      console.warn("[Email] ADMIN_NOTIFY_EMAIL not set — admin notification skipped");
      return;
    }

    await resend.emails.send({
      from: fromAddr(),
      to: adminTo,
      subject: `⚠️ Room report (${kindLabel}): ${d.roomTitle}`,
      html,
    }).then(r => console.log("[Email] Room report alert sent:", r))
      .catch(e => console.error("[Email] Room report alert failed:", e));
  },
});

// ══════════════════════════════════════════════════════════════
// MERCH ORDER EMAILS (buyer confirmation + seller notice)
// ══════════════════════════════════════════════════════════════

const MERCH_TEXT = {
  en: {
    title: "Order confirmed",
    sub: "Thanks for supporting the rooms you love",
    hi: "Hi",
    intro: "Here is your order.",
    item: "Item",
    subtotal: "Subtotal",
    premium: "Premium discount",
    shipping: "Shipping",
    total: "Total",
    pickup: "Pick up at",
    pickupWhen: "At your game",
    payAtPickup: "You pay when you collect it.",
    paid: "Paid online.",
    shipTo: "Ship to",
    view: "View your orders",
    footer: "Questions about your order? Reply to the shop that sold it.",
    sellerTitle: "New merch order",
    sellerSub: "A player ordered from your shop",
    buyer: "Buyer",
    open: "Open your orders",
  },
  el: {
    title: "Η παραγγελία καταχωρήθηκε",
    sub: "Ευχαριστούμε που στηρίζεις τα δωμάτια που αγαπάς",
    hi: "Γεια σου",
    intro: "Αυτή είναι η παραγγελία σου.",
    item: "Προϊόν",
    subtotal: "Υποσύνολο",
    premium: "Έκπτωση Premium",
    shipping: "Μεταφορικά",
    total: "Σύνολο",
    pickup: "Παραλαβή από",
    pickupWhen: "Στο παιχνίδι σου",
    payAtPickup: "Πληρώνεις κατά την παραλαβή.",
    paid: "Πληρώθηκε online.",
    shipTo: "Αποστολή σε",
    view: "Δες τις παραγγελίες σου",
    footer: "Ερωτήσεις για την παραγγελία; Απάντησε στο κατάστημα που την πούλησε.",
    sellerTitle: "Νέα παραγγελία merch",
    sellerSub: "Ένας παίκτης παρήγγειλε από το κατάστημά σου",
    buyer: "Αγοραστής",
    open: "Άνοιξε τις παραγγελίες",
  },
};

const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;

export const sendMerchOrderEmails = internalAction({
  args: {
    orderCode: v.string(),
    buyerName: v.string(),
    buyerEmail: v.string(),
    buyerPhone: v.string(),
    sellerName: v.string(),
    sellerEmail: v.string(),
    items: v.array(
      v.object({ title: v.string(), variantLabel: v.string(), quantity: v.number(), unitPriceCents: v.number() })
    ),
    subtotalCents: v.number(),
    discountCents: v.number(),
    shippingCents: v.number(),
    totalCents: v.number(),
    delivery: v.string(),
    payment: v.string(),
    paid: v.boolean(),
    pickupNote: v.string(),
    pickupAddress: v.string(),
    bookingWhen: v.string(),
    address: v.string(),
    lang: v.optional(v.string()),
  },
  handler: async (_ctx, d) => {
    const resend = getResend();
    if (!resend) return;
    const tx = (lang: "en" | "el") => MERCH_TEXT[lang];

    const table = (lang: "en" | "el") => {
      const m = tx(lang);
      const rows = d.items
        .map(
          (i) =>
            `<tr>${TH(`${i.quantity}× ${escHtml(i.title)}`)}${TD(
              `${escHtml(i.variantLabel)} · ${i.unitPriceCents ? eur(i.unitPriceCents * i.quantity) : "€0"}`
            )}</tr>`
        )
        .join("");
      return TABLE(`
  ${rows}
  <tr>${TH(m.subtotal)}${TD(eur(d.subtotalCents))}</tr>
  ${d.discountCents ? `<tr>${TH(m.premium)}${TD(`−${eur(d.discountCents)}`)}</tr>` : ""}
  ${d.delivery === "shipping" ? `<tr>${TH(m.shipping)}${TD(d.shippingCents ? eur(d.shippingCents) : "€0")}</tr>` : ""}
  <tr>${TH(m.total)}${TD(`<strong>${eur(d.totalCents)}</strong>`)}</tr>
  ${
    d.delivery === "pickup"
      ? `<tr>${TH(m.pickup)}${TD(
          `${escHtml(d.sellerName)}${d.pickupAddress ? `<br>${escHtml(d.pickupAddress)}` : ""}${
            d.pickupNote ? `<br><em>${escHtml(d.pickupNote)}</em>` : ""
          }`
        )}</tr>${d.bookingWhen ? `<tr>${TH(m.pickupWhen)}${TD(escHtml(d.bookingWhen))}</tr>` : ""}`
      : `<tr>${TH(m.shipTo)}${TD(escHtml(d.address))}</tr>`
  }
`);
    };

    const promises: Promise<any>[] = [];
    const lang = d.lang === "el" ? "el" : "en";
    const m = tx(lang);
    if (isEmail(d.buyerEmail)) {
      const html = shell(
        m.title,
        m.sub,
        `<p style="${S.greeting}">${m.hi} <strong>${escHtml(d.buyerName)}</strong>,</p>
<p style="${S.bodyText}">${m.intro} ${d.paid ? m.paid : d.payment === "at_pickup" ? m.payAtPickup : ""}</p>
<div style="text-align:center;margin:0 0 28px;"><span style="${S.badge}">${d.orderCode}</span></div>
${table(lang)}
<div style="text-align:center;margin:24px 0;">
  <a href="https://unlocked.gr/shop/orders" style="${S.btn}">${m.view}</a>
</div>`,
        `${escHtml(d.sellerName)} · ${m.footer}`
      );
      promises.push(
        resend.emails
          .send({ from: fromAddr(d.sellerName), to: d.buyerEmail, subject: `${m.title}: ${d.orderCode}`, html })
          .catch((e) => console.error("[Email] Merch buyer email failed:", e))
      );
    }

    if (isEmail(d.sellerEmail)) {
      const s = tx("en");
      const html = shell(
        s.sellerTitle,
        s.sellerSub,
        `<div style="text-align:center;margin:0 0 28px;"><span style="${S.badge}">${d.orderCode}</span></div>
${TABLE(`<tr>${TH(s.buyer)}${TD(`${escHtml(d.buyerName)}<br>${escHtml(d.buyerEmail)}${d.buyerPhone ? `<br>${escHtml(d.buyerPhone)}` : ""}`)}</tr>`)}
${table("en")}
<p style="${S.bodyText}">${d.paid ? s.paid : d.payment === "at_pickup" ? s.payAtPickup : ""}</p>
<div style="text-align:center;margin:24px 0;">
  <a href="https://business.unlocked.gr/merch" style="${S.btn}">${s.open}</a>
</div>`,
        "UNLOCKED Business"
      );
      promises.push(
        resend.emails
          .send({ from: fromAddr(), to: d.sellerEmail, subject: `New order ${d.orderCode}`, html })
          .catch((e) => console.error("[Email] Merch seller email failed:", e))
      );
    }
    await Promise.all(promises);
  },
});
