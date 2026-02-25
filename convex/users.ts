import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { hashPassword, verifyPassword } from "./passwordUtils";
import { validateEmail, validatePassword, requireNonEmpty } from "./validation";

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

    const { password: _pw, ...safeUser } = user;
    return { ...safeUser, avatar, badges };
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

    const { password: _pw, ...safeUser } = user;
    return { ...safeUser, avatar, badges };
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
    avatar: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const updates: Record<string, any> = {};
    if (args.name !== undefined) updates.name = args.name;

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
