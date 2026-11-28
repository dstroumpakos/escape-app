/**
 * Feature switches (same as escape-web src/lib/features.ts).
 *
 * BOOKING_ENABLED: UNLOCKED's own booking for players (time picker, checkout,
 * offers, the Bookings tab). Off by default: rooms are adverts and "Book now"
 * opens the escape room's own site (convex/externalLinks.ts). The booking code
 * stays; EXPO_PUBLIC_BOOKING_ENABLED=1 brings it back.
 */
export const BOOKING_ENABLED = process.env.EXPO_PUBLIC_BOOKING_ENABLED === '1';

/**
 * FOLLOW_ENABLED: following players, worded as "following their trail"
 * (button, trackers / on the trail counts, the "Trails" feed, trails to
 * follow). On; EXPO_PUBLIC_FOLLOW_ENABLED=0 hides it.
 */
export const FOLLOW_ENABLED = process.env.EXPO_PUBLIC_FOLLOW_ENABLED !== '0';

/**
 * PASSPORT_ENABLED: the passport and QR stamps (the Passport tab with the
 * scanner, rooms played and the tower; the company's QR stamps card). Hidden
 * for now; the code stays. EXPO_PUBLIC_PASSPORT_ENABLED=1 brings it back.
 */
export const PASSPORT_ENABLED = process.env.EXPO_PUBLIC_PASSPORT_ENABLED === '1';

/**
 * PREMIUM_ENABLED: the player Premium membership and everything tied to it
 * (the Premium screen and its entry points, member prices and members-only
 * merch, early access to new rooms and merch drops, the Premium badge). Off
 * for now: UNLOCKED is free. The code stays; EXPO_PUBLIC_PREMIUM_ENABLED=1
 * brings it back.
 */
export const PREMIUM_ENABLED = process.env.EXPO_PUBLIC_PREMIUM_ENABLED === '1';
