import { query } from "./_generated/server";

/**
 * Returns platform-wide public statistics.
 * Used on the homepage to show live counters.
 * Optimized: uses indexes where possible to avoid full table scans.
 */
export const getPlatformStats = query({
  args: {},
  handler: async (ctx) => {
    // Run independent queries in parallel
    const [users, rooms, completedBookings, approvedCompanies] = await Promise.all([
      // ── Active Players (total registered users) ──
      ctx.db.query("users").collect(),
      // ── Rooms ──
      ctx.db.query("rooms").collect(),
      // ── Completed bookings only (use status index) ──
      ctx.db.query("bookings").withIndex("by_status", (q) => q.eq("status", "completed")).collect(),
      // ── Partner Venues (approved companies — use onboarding index) ──
      ctx.db.query("companies").withIndex("by_onboardingStatus", (q) => q.eq("onboardingStatus", "approved")).collect(),
    ]);

    const totalPlayers = users.length;

    // ── Active rooms ──
    const activeRooms = rooms.filter((r) => r.isActive !== false);
    const totalRooms = activeRooms.length;

    // ── Average Rating (across all rooms with reviews) ──
    const ratedRooms = activeRooms.filter((r) => r.reviews > 0);
    const averageRating =
      ratedRooms.length > 0
        ? ratedRooms.reduce((sum, r) => sum + r.rating, 0) / ratedRooms.length
        : 0;

    return {
      totalPlayers,
      totalRooms,
      averageRating: Math.round(averageRating * 10) / 10,
      completedEscapes: completedBookings.length,
      partnerVenues: approvedCompanies.length,
    };
  },
});
