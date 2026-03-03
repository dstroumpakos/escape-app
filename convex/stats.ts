import { query } from "./_generated/server";

/**
 * Returns platform-wide public statistics.
 * Used on the homepage to show live counters.
 */
export const getPlatformStats = query({
  args: {},
  handler: async (ctx) => {
    // ── Active Players (total registered users) ──
    const users = await ctx.db.query("users").collect();
    const totalPlayers = users.length;

    // ── Escape Rooms (active rooms only) ──
    const rooms = await ctx.db.query("rooms").collect();
    const activeRooms = rooms.filter((r) => r.isActive !== false);
    const totalRooms = activeRooms.length;

    // ── Average Rating (across all rooms with reviews) ──
    const ratedRooms = activeRooms.filter((r) => r.reviews > 0);
    const averageRating =
      ratedRooms.length > 0
        ? ratedRooms.reduce((sum, r) => sum + r.rating, 0) / ratedRooms.length
        : 0;

    // ── Escapes Completed ──
    const bookings = await ctx.db.query("bookings").collect();
    const completedEscapes = bookings.filter(
      (b) => b.status === "completed"
    ).length;

    // ── Partner Venues (approved companies) ──
    const companies = await ctx.db.query("companies").collect();
    const partnerVenues = companies.filter(
      (c) => c.onboardingStatus === "approved"
    ).length;

    return {
      totalPlayers,
      totalRooms,
      averageRating: Math.round(averageRating * 10) / 10,
      completedEscapes,
      partnerVenues,
    };
  },
});
