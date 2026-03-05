import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { hashPassword, verifyPassword } from "./passwordUtils";
import { validateEmail, validatePassword, requireNonEmpty } from "./validation";

// ── Rank thresholds based on completed rooms ──
function getPlayerRank(completed: number): string {
  if (completed >= 100) return "rank_legend";
  if (completed >= 50) return "rank_master";
  if (completed >= 25) return "rank_expert";
  if (completed >= 10) return "rank_veteran";
  if (completed >= 5) return "rank_adventurer";
  if (completed >= 1) return "rank_explorer";
  return "rank_rookie";
}

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (!user) return null;

    // Resolve avatar from storage each time (signed URLs expire)
    let avatar = user.avatar;
    if (user.avatarStorageId) {
      const freshUrl = await ctx.storage.getUrl(user.avatarStorageId);
      if (freshUrl) avatar = freshUrl;
    }

    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Compute real stats from bookings
    const allBookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const played = allBookings.filter((b) => b.status === "completed").length;
    const uniqueRooms = new Set(
      allBookings.filter((b) => b.status === "completed").map((b) => b.roomId)
    ).size;

    const rank = getPlayerRank(played);

    const { password: _pw, ...safeUser } = user;
    return {
      ...safeUser,
      avatar,
      badges,
      played,
      escaped: uniqueRooms,
      awards: badges.filter((b) => b.earned).length,
      title: rank,
    };
  },
});

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    // Resolve avatar from storage each time (signed URLs expire)
    let avatar = user.avatar;
    if (user.avatarStorageId) {
      const freshUrl = await ctx.storage.getUrl(user.avatarStorageId);
      if (freshUrl) avatar = freshUrl;
    }

    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Compute real stats from bookings
    const allBookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const played = allBookings.filter(
      (b) => b.status === "completed"
    ).length;
    const upcoming = allBookings.filter(
      (b) => b.status === "upcoming"
    ).length;
    // Count unique rooms completed
    const uniqueRooms = new Set(
      allBookings.filter((b) => b.status === "completed").map((b) => b.roomId)
    ).size;

    const rank = getPlayerRank(played);

    const { password: _pw, ...safeUser } = user;
    return {
      ...safeUser,
      avatar,
      badges,
      played,
      escaped: uniqueRooms,
      awards: badges.filter((b) => b.earned).length,
      title: rank,
      upcoming,
    };
  },
});

export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate inputs
    const name = requireNonEmpty(args.name, "Name");
    if (!validateEmail(args.email)) throw new Error("Invalid email format");
    const pwError = validatePassword(args.password);
    if (pwError) throw new Error(pwError);

    // Check if email already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
    if (existing) {
      throw new Error("An account with this email already exists");
    }

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const memberSince = `Member since ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    const hashedPw = await hashPassword(args.password);

    const userId = await ctx.db.insert("users", {
      name,
      email: args.email.toLowerCase(),
      password: hashedPw,
      avatar: "",
      title: "Escape Rookie",
      memberSince,
      played: 0,
      escaped: 0,
      awards: 0,
      wishlist: [],
    });

    // Send welcome email
    await ctx.scheduler.runAfter(0, internal.email.sendPlayerWelcome, {
      playerName: name,
      playerEmail: args.email.toLowerCase(),
    });

    return userId;
  },
});

export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();

    if (!user) {
      throw new Error("No account found with this email");
    }

    if (!user.password) {
      throw new Error("Incorrect password");
    }

    const valid = await verifyPassword(args.password, user.password);
    if (!valid) {
      throw new Error("Incorrect password");
    }

    // Upgrade legacy plaintext passwords to hashed on successful login
    if (!user.password.includes(":")) {
      const hashed = await hashPassword(args.password);
      await ctx.db.patch(user._id, { password: hashed });
    }

    return user._id;
  },
});

export const loginWithApple = mutation({
  args: {
    appleId: v.string(),
    email: v.optional(v.string()),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user already exists with this Apple ID
    const existingByApple = await ctx.db
      .query("users")
      .withIndex("by_apple_id", (q) => q.eq("appleId", args.appleId))
      .first();
    if (existingByApple) {
      return existingByApple._id;
    }

    // Check if user exists with same email
    if (args.email) {
      const existingByEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .unique();
      if (existingByEmail) {
        // Link Apple ID to existing account
        await ctx.db.patch(existingByEmail._id, { appleId: args.appleId });
        return existingByEmail._id;
      }
    }

    // Create new user
    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const memberSince = `Member since ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    const userId = await ctx.db.insert("users", {
      name: args.fullName || "Escape Fan",
      email: args.email || `apple_${args.appleId.slice(0, 8)}@private.relay`,
      appleId: args.appleId,
      avatar: "",
      title: "Escape Rookie",
      memberSince,
      played: 0,
      escaped: 0,
      awards: 0,
      wishlist: [],
    });

    // Send welcome email (only if real email)
    const userEmail = args.email || "";
    if (userEmail && !userEmail.includes("@private.relay")) {
      await ctx.scheduler.runAfter(0, internal.email.sendPlayerWelcome, {
        playerName: args.fullName || "Escape Fan",
        playerEmail: userEmail,
      });
    }

    return userId;
  },
});

export const toggleWishlist = mutation({
  args: { userId: v.id("users"), roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const wishlist = user.wishlist.includes(args.roomId)
      ? user.wishlist.filter((id) => id !== args.roomId)
      : [...user.wishlist, args.roomId];

    await ctx.db.patch(args.userId, { wishlist });
    return wishlist;
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatar: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.phone !== undefined) updates.phone = args.phone;

    // Store the storageId persistently — URL is resolved at query time
    if (args.avatarStorageId) {
      updates.avatarStorageId = args.avatarStorageId;
      // Also set avatar to empty so the storageId path is used
      updates.avatar = "";
    } else if (args.avatar !== undefined) {
      updates.avatar = args.avatar;
      // Clear storageId when avatar is explicitly set/cleared
      updates.avatarStorageId = undefined;
    }

    await ctx.db.patch(args.userId, updates);
    return args.userId;
  },
});

// ─── Update language preference ───
export const updateLanguage = mutation({
  args: {
    userId: v.id("users"),
    language: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { language: args.language });
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const updateStats = mutation({
  args: {
    userId: v.id("users"),
    played: v.number(),
    escaped: v.number(),
    awards: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId, ...stats } = args;
    await ctx.db.patch(userId, stats);
  },
});

export const setAdmin = mutation({
  args: {
    userId: v.id("users"),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { isAdmin: args.isAdmin });
    return args.userId;
  },
});

export const updateLocation = mutation({
  args: {
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(args.userId, {
      latitude: args.latitude,
      longitude: args.longitude,
      city: args.city,
    });
    return args.userId;
  },
});

/* ═══════════════════════════════════════════════════════════
   Account Deletion (Apple Guideline 5.1.1(v))
   Users who create an account must be able to delete it.
   This permanently removes the user and all associated data.
   ═══════════════════════════════════════════════════════════ */
export const deleteAccount = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // 1. Delete badges
    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const b of badges) await ctx.db.delete(b._id);

    // 2. Delete bookings
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const b of bookings) await ctx.db.delete(b._id);

    // 3. Delete posts and their likes/comments
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author_user", (q) => q.eq("authorUserId", args.userId))
      .collect();
    for (const p of posts) {
      const pComments = await ctx.db
        .query("postComments")
        .withIndex("by_post", (q) => q.eq("postId", p._id))
        .collect();
      for (const c of pComments) await ctx.db.delete(c._id);
      const pLikes = await ctx.db
        .query("postLikes")
        .withIndex("by_post", (q) => q.eq("postId", p._id))
        .collect();
      for (const l of pLikes) await ctx.db.delete(l._id);
      await ctx.db.delete(p._id);
    }

    // 4. Delete user's own likes on other posts
    const userLikes = await ctx.db
      .query("postLikes")
      .withIndex("by_user_post")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();
    for (const l of userLikes) {
      const post = await ctx.db.get(l.postId);
      if (post) {
        await ctx.db.patch(l.postId, { likes: Math.max(0, post.likes - 1) });
      }
      await ctx.db.delete(l._id);
    }

    // 5. Delete comments by user
    const userComments = await ctx.db
      .query("postComments")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();
    for (const c of userComments) await ctx.db.delete(c._id);

    // 6. Delete slot alerts
    const slotAlerts = await ctx.db
      .query("slotAlerts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const a of slotAlerts) await ctx.db.delete(a._id);

    // 7. Delete notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const n of notifications) await ctx.db.delete(n._id);

    // 8. Delete premium subscriptions
    const premiumSubs = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const s of premiumSubs) await ctx.db.delete(s._id);

    // 9. Delete friendships
    const friendsAsSender = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", args.userId))
      .collect();
    for (const f of friendsAsSender) await ctx.db.delete(f._id);
    const friendsAsReceiver = await ctx.db
      .query("friendships")
      .withIndex("by_receiver", (q) => q.eq("receiverId", args.userId))
      .collect();
    for (const f of friendsAsReceiver) await ctx.db.delete(f._id);

    // 9b. Delete booking invites
    const invitesAsInvitee = await ctx.db
      .query("bookingInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", args.userId))
      .collect();
    for (const inv of invitesAsInvitee) await ctx.db.delete(inv._id);

    // 10. Delete blocked-users entries (as blocker or blocked)
    const blocksAsBlocker = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocker", (q) => q.eq("blockerId", args.userId))
      .collect();
    for (const b of blocksAsBlocker) await ctx.db.delete(b._id);

    const allBlocks = await ctx.db.query("blockedUsers").collect();
    for (const b of allBlocks) {
      if (b.blockedUserId === args.userId) await ctx.db.delete(b._id);
    }

    // 11. Delete reports made by user
    const reports = await ctx.db.query("reports").collect();
    for (const r of reports) {
      if (r.reporterId === args.userId) await ctx.db.delete(r._id);
    }

    // 12. Delete the user record itself
    await ctx.db.delete(args.userId);

    return { success: true };
  },
});

// ── Leaderboard ──

export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const max = args.limit ?? 20;

    // Fetch all users and all bookings
    const allUsers = await ctx.db.query("users").collect();
    const allBookings = await ctx.db.query("bookings").collect();

    // Compute dynamic stats per user
    const userStats = allUsers.map((user) => {
      const userBookings = allBookings.filter(
        (b) => b.userId === user._id && b.status === "completed"
      );
      const played = userBookings.length;
      const escaped = new Set(userBookings.map((b) => b.roomId)).size;
      return { ...user, played, escaped };
    });

    // Sort by escaped count descending, then by played ascending (fewer games = better rate)
    const sorted = userStats
      .filter((u) => u.played > 0)
      .sort((a, b) => {
        if (b.escaped !== a.escaped) return b.escaped - a.escaped;
        return a.played - b.played;
      });

    const topUsers = sorted.slice(0, max);

    // Fetch badges for each top user
    const players = await Promise.all(
      topUsers.map(async (user, i) => {
        const badges = await ctx.db
          .query("badges")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        // Resolve avatar
        let avatar = user.avatar;
        if (user.avatarStorageId) {
          const freshUrl = await ctx.storage.getUrl(user.avatarStorageId);
          if (freshUrl) avatar = freshUrl;
        }

        const rate = user.played > 0 ? Math.round((user.escaped / user.played) * 100) : 0;
        const initials = user.name
          .split(" ")
          .map((w: string) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);

        return {
          rank: i + 1,
          id: user._id,
          name: user.name,
          avatar,
          initials,
          played: user.played,
          escaped: user.escaped,
          rate,
          badges: badges.length,
          isPremium: user.isPremium ?? false,
        };
      })
    );

    // Aggregate stats across ALL users (dynamic)
    const totalEscapes = userStats.reduce((sum, u) => sum + u.escaped, 0);
    const totalPlayed = userStats.reduce((sum, u) => sum + u.played, 0);
    const successRate = totalPlayed > 0 ? Math.round((totalEscapes / totalPlayed) * 100) : 0;

    // Total badges
    const allBadges = await ctx.db.query("badges").collect();
    const totalBadges = allBadges.length;

    // ── Per-room escape stats (computed from bookings) ──
    const allRooms = await ctx.db.query("rooms").collect();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const roomStats: Record<string, { completed: number; total: number }> = {};
    for (const booking of allBookings) {
      if (booking.status === "cancelled") continue;
      const rid = booking.roomId as string;
      if (!roomStats[rid]) roomStats[rid] = { completed: 0, total: 0 };
      // Only count past bookings (date <= today) for escape rate
      if (booking.date <= today) {
        roomStats[rid].total += 1;
        if (booking.status === "completed") {
          roomStats[rid].completed += 1;
        }
      }
    }

    const topRooms = allRooms
      .filter((r) => r.isActive !== false)
      .map((r) => {
        const stats = roomStats[r._id as string] ?? { completed: 0, total: 0 };
        const escapeRate = stats.total > 0
          ? Math.round((stats.completed / stats.total) * 100)
          : 0;
        return {
          id: r._id,
          title: r.title,
          location: r.location,
          rating: r.rating,
          reviews: r.reviews,
          theme: r.theme,
          escapeRate,
          gamesPlayed: stats.completed,
          companyId: r.companyId,
        };
      })
      .filter((r) => r.rating > 0 || r.gamesPlayed > 0)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 10);

    // Enrich top rooms with company name
    const topRoomsEnriched = await Promise.all(
      topRooms.map(async (r) => {
        let companyName = "";
        if (r.companyId) {
          const company = await ctx.db.get(r.companyId);
          if (company) companyName = company.name;
        }
        return { ...r, companyName };
      })
    );

    return {
      players,
      topRooms: topRoomsEnriched,
      stats: {
        totalEscapes,
        totalPlayed,
        successRate,
        totalBadges,
      },
    };
  },
});
