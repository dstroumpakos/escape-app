import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ═══════════════════════════════════════════════════════════════
// Badge Definitions — the 8 UNLOCKED badges
// ═══════════════════════════════════════════════════════════════

export const BADGE_DEFS = [
  { key: "champion",      icon: "🏆", threshold: 50 },
  { key: "on_fire",       icon: "🔥", threshold: 10 },
  { key: "mastermind",    icon: "🧠", threshold: 5  },
  { key: "speed_demon",   icon: "⚡", threshold: 1  },
  { key: "team_leader",   icon: "👥", threshold: 20 },
  { key: "explorer",      icon: "🌍", threshold: 0  }, // dynamic: # of themes
  { key: "perfectionist", icon: "🎯", threshold: 10 },
  { key: "night_owl",     icon: "🌙", threshold: 10 },
] as const;

// ═══════════════════════════════════════════════════════════════
// Get all 8 badges for a user with progress
// ═══════════════════════════════════════════════════════════════

export const getUserBadges = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Fetch earned badges
    const earnedBadges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Fetch performance records
    const performances = await ctx.db
      .query("bookingPerformance")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Fetch user's completed bookings
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const completedBookings = bookings.filter((b) => b.status === "completed");

    // Get all rooms to compute theme counts
    const allRooms = await ctx.db.query("rooms").collect();
    const allThemes = new Set(allRooms.map((r) => r.theme).filter(Boolean));
    const totalThemes = allThemes.size || 1;

    // Compute room info for completed bookings
    const roomMap = new Map(allRooms.map((r) => [r._id.toString(), r]));

    // ── Per-badge progress ──
    const escaped = performances.filter((p) => p.escaped);
    const escapedCount = escaped.length;

    // Champion: total escaped rooms
    const championProgress = escapedCount;

    // On Fire: longest consecutive escape streak
    const sortedPerf = [...performances].sort((a, b) => a.verifiedAt - b.verifiedAt);
    let onFireProgress = 0;
    let streak = 0;
    for (const p of sortedPerf) {
      if (p.escaped) { streak++; onFireProgress = Math.max(onFireProgress, streak); }
      else { streak = 0; }
    }

    // Mastermind: escaped hard rooms (difficulty >= 4)
    const mastermindProgress = escaped.filter((p) => {
      const room = roomMap.get(p.roomId.toString());
      return room && room.difficulty >= 4;
    }).length;

    // Speed Demon: escaped in under 30 min
    const speedDemonProgress = escaped.filter(
      (p) => p.escapeTimeMinutes !== undefined && p.escapeTimeMinutes <= 30
    ).length;

    // Team Leader: group escapes (3+ players)
    const teamLeaderProgress = completedBookings.filter((b) => {
      const perf = performances.find(
        (p) => p.bookingId.toString() === b._id.toString()
      );
      return perf?.escaped && b.players >= 3;
    }).length;

    // Explorer: unique themes played
    const playedThemes = new Set(
      escaped.map((p) => {
        const room = roomMap.get(p.roomId.toString());
        return room?.theme;
      }).filter(Boolean)
    );
    const explorerProgress = playedThemes.size;

    // Perfectionist: rooms with 0 hints
    const perfectionistProgress = escaped.filter(
      (p) => p.hintsUsed !== undefined && p.hintsUsed === 0
    ).length;

    // Night Owl: escapes at 21:00+
    const nightOwlProgress = completedBookings.filter((b) => {
      const perf = performances.find(
        (p) => p.bookingId.toString() === b._id.toString()
      );
      if (!perf?.escaped) return false;
      const hour = parseInt(b.time.split(":")[0], 10);
      return hour >= 21 || hour === 0;
    }).length;

    const progressMap: Record<string, number> = {
      champion: championProgress,
      on_fire: onFireProgress,
      mastermind: mastermindProgress,
      speed_demon: speedDemonProgress,
      team_leader: teamLeaderProgress,
      explorer: explorerProgress,
      perfectionist: perfectionistProgress,
      night_owl: nightOwlProgress,
    };

    // Build result with all 8 badges
    return BADGE_DEFS.map((def) => {
      const earned = earnedBadges.find((b) => b.badgeKey === def.key);
      const threshold = def.key === "explorer" ? totalThemes : def.threshold;
      const progress = progressMap[def.key] ?? 0;

      return {
        key: def.key,
        icon: def.icon,
        earned: !!earned,
        earnedAt: earned?.earnedAt,
        verifiedByCompanyId: earned?.verifiedByCompanyId,
        progress,
        threshold,
        date: earned?.date,
      };
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// Submit performance data & check for new badges
// Called when a company completes a booking
// ═══════════════════════════════════════════════════════════════

export const submitPerformance = mutation({
  args: {
    companyId: v.id("companies"),
    bookingId: v.id("bookings"),
    escaped: v.boolean(),
    escapeTimeMinutes: v.optional(v.number()),
    hintsUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (!booking.userId) return; // external bookings — no user to award badges to

    const userId = booking.userId!; // TS narrowing — checked above

    // Verify company owns this booking
    if (booking.companyId?.toString() !== args.companyId.toString()) {
      throw new Error("Not authorised");
    }

    // Check for existing performance record
    const existing = await ctx.db
      .query("bookingPerformance")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();
    if (existing) return; // already submitted

    // Store performance
    await ctx.db.insert("bookingPerformance", {
      bookingId: args.bookingId,
      companyId: args.companyId,
      userId,
      roomId: booking.roomId,
      escaped: args.escaped,
      escapeTimeMinutes: args.escapeTimeMinutes,
      hintsUsed: args.hintsUsed,
      verifiedAt: Date.now(),
    });

    // ── Check & award badges ──
    if (!args.escaped) return; // only award badges for successful escapes

    // Re-fetch all performance data for this user
    const performances = await ctx.db
      .query("bookingPerformance")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const escaped = performances.filter((p) => p.escaped);

    // Fetch user's bookings for time-based checks
    const userBookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const completedBookings = userBookings.filter((b) => b.status === "completed");

    // Fetch all rooms for theme/difficulty checks
    const allRooms = await ctx.db.query("rooms").collect();
    const roomMap = new Map(allRooms.map((r) => [r._id.toString(), r]));
    const allThemes = new Set(allRooms.map((r) => r.theme).filter(Boolean));
    const totalThemes = allThemes.size || 1;

    // Fetch currently earned badges
    const earnedBadges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const earnedKeys = new Set(earnedBadges.map((b) => b.badgeKey));

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Helper to award a badge
    const award = async (key: string, icon: string, title: string) => {
      if (earnedKeys.has(key)) return;
      await ctx.db.insert("badges", {
        userId,
        badgeKey: key,
        title,
        icon,
        earned: true,
        date: today,
        verifiedByCompanyId: args.companyId,
        verifiedByBookingId: args.bookingId,
        earnedAt: now,
      });
      earnedKeys.add(key);
    };

    // 1. Champion — 50+ escapes
    if (escaped.length >= 50) {
      await award("champion", "🏆", "Champion");
    }

    // 2. On Fire — 10 consecutive escapes
    const sortedPerf = [...performances].sort((a, b) => a.verifiedAt - b.verifiedAt);
    let streak = 0;
    let maxStreak = 0;
    for (const p of sortedPerf) {
      if (p.escaped) { streak++; maxStreak = Math.max(maxStreak, streak); }
      else { streak = 0; }
    }
    if (maxStreak >= 10) {
      await award("on_fire", "🔥", "On Fire");
    }

    // 3. Mastermind — 5 hard rooms (difficulty >= 4)
    const hardEscapes = escaped.filter((p) => {
      const room = roomMap.get(p.roomId.toString());
      return room && room.difficulty >= 4;
    }).length;
    if (hardEscapes >= 5) {
      await award("mastermind", "🧠", "Mastermind");
    }

    // 4. Speed Demon — escape under 30 min
    const fastEscapes = escaped.filter(
      (p) => p.escapeTimeMinutes !== undefined && p.escapeTimeMinutes <= 30
    ).length;
    if (fastEscapes >= 1) {
      await award("speed_demon", "⚡", "Speed Demon");
    }

    // 5. Team Leader — 20 group escapes (3+ players)
    const groupEscapes = completedBookings.filter((b) => {
      const perf = performances.find(
        (p) => p.bookingId.toString() === b._id.toString()
      );
      return perf?.escaped && b.players >= 3;
    }).length;
    if (groupEscapes >= 20) {
      await award("team_leader", "👥", "Team Leader");
    }

    // 6. Explorer — all themes played
    const playedThemes = new Set(
      escaped.map((p) => {
        const room = roomMap.get(p.roomId.toString());
        return room?.theme;
      }).filter(Boolean)
    );
    if (playedThemes.size >= totalThemes && totalThemes > 0) {
      await award("explorer", "🌍", "Explorer");
    }

    // 7. Perfectionist — 10 rooms with 0 hints
    const perfectRooms = escaped.filter(
      (p) => p.hintsUsed !== undefined && p.hintsUsed === 0
    ).length;
    if (perfectRooms >= 10) {
      await award("perfectionist", "🎯", "Perfectionist");
    }

    // 8. Night Owl — 10 late-night escapes (21:00+)
    const nightEscapes = completedBookings.filter((b) => {
      const perf = performances.find(
        (p) => p.bookingId.toString() === b._id.toString()
      );
      if (!perf?.escaped) return false;
      const hour = parseInt(b.time.split(":")[0], 10);
      return hour >= 21 || hour === 0;
    }).length;
    if (nightEscapes >= 10) {
      await award("night_owl", "🌙", "Night Owl");
    }
  },
});

// ═══════════════════════════════════════════════════════════════
// Leaderboard badge stats — how many users have each badge
// ═══════════════════════════════════════════════════════════════

export const badgeLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    const allBadges = await ctx.db.query("badges").collect();
    const earned = allBadges.filter((b) => b.earned);

    const counts: Record<string, number> = {};
    for (const b of earned) {
      counts[b.badgeKey] = (counts[b.badgeKey] || 0) + 1;
    }

    return BADGE_DEFS.map((def) => ({
      key: def.key,
      icon: def.icon,
      earnedCount: counts[def.key] || 0,
    }));
  },
});

// ═══════════════════════════════════════════════════════════════
// Manual badge award — company awards specific badges to a player
// ═══════════════════════════════════════════════════════════════

export const manualAwardBadges = mutation({
  args: {
    companyId: v.id("companies"),
    bookingId: v.id("bookings"),
    badgeKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (!booking.userId) return; // external bookings — no user

    const userId = booking.userId;

    // Verify company owns this booking's room
    if (booking.companyId?.toString() !== args.companyId.toString()) {
      throw new Error("Not authorised");
    }

    // Validate badge keys
    const validKeys = new Set(BADGE_DEFS.map((d) => d.key as string));
    const keysToAward = args.badgeKeys.filter((k) => validKeys.has(k));
    if (keysToAward.length === 0) return;

    // Check which badges user already has
    const existingBadges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const earnedKeys = new Set(existingBadges.map((b) => b.badgeKey));

    const today = new Date().toISOString().split("T")[0];
    const now = Date.now();

    for (const key of keysToAward) {
      if (earnedKeys.has(key)) continue; // already earned
      const def = BADGE_DEFS.find((d) => d.key === key);
      if (!def) continue;

      await ctx.db.insert("badges", {
        userId,
        badgeKey: key,
        title: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: def.icon,
        earned: true,
        date: today,
        verifiedByCompanyId: args.companyId,
        verifiedByBookingId: args.bookingId,
        earnedAt: now,
      });
      earnedKeys.add(key);
    }
  },
});
