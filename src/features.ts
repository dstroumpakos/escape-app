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
 * FOLLOW_ENABLED: following players (follow button, followers / following
 * counts, the "Following" feed, players to follow). Off for now; the code
 * stays. EXPO_PUBLIC_FOLLOW_ENABLED=1 brings it back.
 */
export const FOLLOW_ENABLED = process.env.EXPO_PUBLIC_FOLLOW_ENABLED === '1';
