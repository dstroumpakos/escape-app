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
