/**
 * Backend notification text translations.
 * Used when inserting notifications so they appear in the recipient's language.
 */

type Lang = "en" | "el";

const texts: Record<Lang, Record<string, string>> = {
  en: {
    // Friend system
    "friend_request.title": "Friend Request",
    "friend_request.message": "{{name}} sent you a friend request!",
    "friend_accepted.title": "Friend Request Accepted",
    "friend_accepted.message": "{{name}} accepted your friend request!",

    // Booking invites
    "booking_invite.title": "Booking Invitation",
    "booking_invite.message": "{{name}} invited you to {{room}} on {{date}} at {{time}}!",
    "invite_accepted.title": "Invite Accepted",
    "invite_accepted.message": "{{name}} accepted the invite to {{room}}!",
    "invite_declined.title": "Invite Declined",
    "invite_declined.message": "{{name}} declined the invite to {{room}}.",

    // Photos
    "photos_ready.title": "Your Escape Moments are ready! 🎉",
    "photos_ready.message": "Your photos from {{room}} are now available to view and download.",

    // New room (premium notification)
    "new_room.title": "🆕 New Room: {{room}}",
    "new_room.message": "{{company}} just added a new escape room! As a Premium member, you can book it before anyone else.",
  },
  el: {
    // Friend system
    "friend_request.title": "Αίτημα Φιλίας",
    "friend_request.message": "Ο/Η {{name}} σου έστειλε αίτημα φιλίας!",
    "friend_accepted.title": "Αίτημα Φιλίας Αποδεκτό",
    "friend_accepted.message": "Ο/Η {{name}} αποδέχτηκε το αίτημα φιλίας σου!",

    // Booking invites
    "booking_invite.title": "Πρόσκληση Κράτησης",
    "booking_invite.message": "Ο/Η {{name}} σε προσκάλεσε στο {{room}} στις {{date}} στις {{time}}!",
    "invite_accepted.title": "Πρόσκληση Αποδεκτή",
    "invite_accepted.message": "Ο/Η {{name}} αποδέχτηκε την πρόσκληση για {{room}}!",
    "invite_declined.title": "Πρόσκληση Απορρίφθηκε",
    "invite_declined.message": "Ο/Η {{name}} απέρριψε την πρόσκληση για {{room}}.",

    // Photos
    "photos_ready.title": "Οι Στιγμές σου είναι έτοιμες! 🎉",
    "photos_ready.message": "Οι φωτογραφίες σου από {{room}} είναι πλέον διαθέσιμες για προβολή και λήψη.",

    // New room (premium notification)
    "new_room.title": "🆕 Νέο Δωμάτιο: {{room}}",
    "new_room.message": "Η {{company}} μόλις πρόσθεσε ένα νέο escape room! Ως Premium μέλος, μπορείς να το κλείσεις πριν από όλους.",
  },
};

/**
 * Get a translated notification text with variable interpolation.
 * Falls back to English if the language or key is not found.
 */
export function nt(
  lang: string | undefined,
  key: string,
  params?: Record<string, string>
): string {
  const language: Lang = lang === "el" ? "el" : "en";
  let text = texts[language]?.[key] ?? texts.en[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{{${k}}}`, v);
    }
  }

  return text;
}
