import { query, mutation, action, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { removeOwnerTokens } from "./push";
import { readPublicCache } from "./publicCache";
import type { Id } from "./_generated/dataModel";
import { verifyAppleIdentityToken } from "./appleAuth";
import { verifyGoogleIdToken } from "./googleAuth";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { hashPassword, verifyPassword } from "./passwordUtils";
import { createUserSession, requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { validateEmail, validatePassword, requireNonEmpty } from "./validation";
import { rateLimit, HOUR } from "./rateLimit";
import { sendUserVerification } from "./emailVerify";
import { startPendingSignup, takePendingSignup, requireLegacySignupAllowed } from "./signupCodes";
import type { MutationCtx } from "./_generated/server";
import { assertUpload, MAX_IMAGE_BYTES, UPLOADS_PER_HOUR_USER, isOwnStorageUrl } from "./uploads";
import { filterPublicRooms } from "./companyRules";
import { removeUserFromChats } from "./messages";

export const getByEmail = internalQuery({
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
      // Lets the app ask for the password (or the word DELETE) before deleting.
      hasPassword: !!user.password,
      avatar,
      badges,
      played,
      escaped: uniqueRooms,
      awards: badges.filter((b) => b.earned).length,
      title: rank,
    };
  },
});

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

export const getById = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    // Own profile only: the user comes from the session, never from an argument.
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
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

// ─── Player names (shown to other players: posts, friends, leaderboard) ───
// Short, and nothing that looks like the UNLOCKED team.
const NAME_MAX = 50;
const RESERVED_NAME_WORDS = ["unlocked", "admin", "support", "moderator", "staff"];
const NAME_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: "Please enter your name",
  NAME_TOO_LONG: `Your name can be up to ${NAME_MAX} characters`,
  NAME_RESERVED: "This name is not allowed",
};

function normalizeName(raw: string): string {
  return raw.trim().split(/\s+/).join(" ");
}

/** null if fine, else an error code (NAME_REQUIRED / NAME_TOO_LONG / NAME_RESERVED). */
function playerNameProblem(raw: string): string | null {
  const name = normalizeName(raw);
  if (!name) return "NAME_REQUIRED";
  if (name.length > NAME_MAX) return "NAME_TOO_LONG";
  const lower = name.toLowerCase();
  if (RESERVED_NAME_WORDS.some((w) => lower.includes(w))) return "NAME_RESERVED";
  return null;
}

// ─── Player sign-up with a 6-digit email code (see signupCodes.ts) ───

/** Checks the sign-up form. Throws the same error codes the clients already show. */
async function checkPlayerSignup(
  ctx: MutationCtx,
  args: { name: string; email: string; password: string }
): Promise<{ name: string; email: string }> {
  const problem = playerNameProblem(args.name);
  if (problem) throw new ConvexError(problem);
  const name = normalizeName(args.name);
  const email = args.email.trim().toLowerCase();
  if (!validateEmail(email)) throw new ConvexError("INVALID_EMAIL");
  const pwError = validatePassword(args.password);
  if (pwError) {
    if (pwError.includes("8 characters")) throw new ConvexError("PASSWORD_LENGTH");
    if (pwError.includes("uppercase")) throw new ConvexError("PASSWORD_UPPERCASE");
    if (pwError.includes("number")) throw new ConvexError("PASSWORD_NUMBER");
    throw new ConvexError("PASSWORD_INVALID");
  }
  if (await emailTaken(ctx, email)) throw new ConvexError("EMAIL_EXISTS");
  return { name, email };
}

async function emailTaken(ctx: MutationCtx, email: string): Promise<boolean> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return !!existing;
}

async function createPlayer(
  ctx: MutationCtx,
  p: { name: string; email: string; hashedPw: string; lang?: string; client?: string; emailVerified: boolean }
): Promise<{ userId: Id<"users">; sessionToken: string }> {
  // Site-wide cap on new player accounts (no IP in mutations; see rateLimit.ts).
  await rateLimit(ctx, "playerRegister", 60, HOUR);

  const now = new Date();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const memberSince = `Member since ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  const userId = await ctx.db.insert("users", {
    name: p.name,
    email: p.email,
    password: p.hashedPw,
    avatar: "",
    title: "Escape Rookie",
    memberSince,
    played: 0,
    escaped: 0,
    awards: 0,
    wishlist: [],
    emailVerified: p.emailVerified,
    language: p.lang === "el" || p.lang === "nl" || p.lang === "en" ? p.lang : undefined,
  });

  if (!p.emailVerified) {
    const created = await ctx.db.get(userId);
    if (created) await sendUserVerification(ctx, created, p.lang);
  }

  await ctx.scheduler.runAfter(0, internal.email.sendPlayerWelcome, {
    playerName: p.name,
    playerEmail: p.email,
    lang: p.lang || "en",
  });

  return { userId, sessionToken: await createUserSession(ctx, userId, p.client) };
}

/** Step 1: check the form and email a 6-digit code. No account yet. */
export const startRegister = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    lang: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { name, email } = await checkPlayerSignup(ctx, args);
    await startPendingSignup(ctx, "player", email, { name, hashedPw: await hashPassword(args.password) }, args.lang);
    return { ok: true };
  },
});

/**
 * Step 2: the right code creates the account (email already confirmed) and
 * logs in. A wrong code returns { error } so the try is counted.
 */
export const confirmRegister = mutation({
  args: {
    email: v.string(),
    code: v.string(),
    client: v.optional(v.string()), // "web" | "app"
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; sessionToken: string } | { error: string }> => {
    const email = args.email.trim().toLowerCase();
    const r = await takePendingSignup(ctx, "player", email, args.code);
    if (!r.ok) return { error: r.error };
    // Someone may have taken the email in the meantime (e.g. Apple sign-in).
    if (await emailTaken(ctx, email)) return { error: "EMAIL_EXISTS" };
    const data = r.row.data as { name: string; hashedPw: string };
    return await createPlayer(ctx, {
      name: data.name,
      email,
      hashedPw: data.hashedPw,
      lang: r.row.lang,
      client: args.client,
      emailVerified: true,
    });
  },
});

/**
 * Old sign-up without a code. Kept only for app builds from before the code
 * step, and off unless ALLOW_LEGACY_SIGNUP=1 (otherwise anyone could skip the code).
 */
export const register = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.string(),
    lang: v.optional(v.string()),
    client: v.optional(v.string()), // "web" | "app"
  },
  handler: async (ctx, args) => {
    requireLegacySignupAllowed();
    const { name, email } = await checkPlayerSignup(ctx, args);
    return await createPlayer(ctx, {
      name,
      email,
      hashedPw: await hashPassword(args.password),
      lang: args.lang,
      client: args.client,
      // Still has to press the email link before "pay on arrival" bookings.
      emailVerified: false,
    });
  },
});

// Wrong-password limiter: this many failures within the window locks the
// email for LOCK_MS. (Per email, so a stranger can't guess forever.)
const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

type LoginResult =
  | { ok: true; userId: Id<"users">; sessionToken: string }
  | { ok: false; code: string };

/**
 * The real login work. It returns a failure instead of throwing, because a
 * thrown error rolls the mutation back and the failed attempt would never be
 * counted. The public `login` action below turns a failure into an error.
 */
export const loginAttempt = internalMutation({
  args: {
    email: v.string(),
    password: v.string(),
    client: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<LoginResult> => {
    const email = args.email.toLowerCase();
    const now = Date.now();
    const attempt = await ctx.db
      .query("loginAttempts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (attempt?.lockedUntil && attempt.lockedUntil > now) {
      return { ok: false, code: "TOO_MANY_ATTEMPTS" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    // Same amount of work whether or not the email exists (timing).
    const valid = user?.password
      ? await verifyPassword(args.password, user.password)
      : (await hashPassword(args.password), false);
    if (!user || !user.password || !valid) {
      const inWindow = attempt && now - attempt.windowStart < LOGIN_WINDOW_MS;
      const failures = (inWindow ? attempt.failures : 0) + 1;
      const fields = {
        failures,
        windowStart: inWindow ? attempt.windowStart : now,
        lockedUntil: failures >= LOGIN_MAX_FAILURES ? now + LOGIN_LOCK_MS : undefined,
      };
      if (attempt) await ctx.db.patch(attempt._id, fields);
      else await ctx.db.insert("loginAttempts", { email, ...fields });
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }

    if (attempt) await ctx.db.delete(attempt._id);

    return { ok: true, userId: user._id, sessionToken: await createUserSession(ctx, user._id, args.client) };
  },
});

export const login = action({
  args: {
    email: v.string(),
    password: v.string(),
    client: v.optional(v.string()), // "web" | "app"
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; sessionToken: string }> => {
    const r = await ctx.runMutation(internal.users.loginAttempt, args);
    if (!r.ok) throw new ConvexError(r.code);
    return { userId: r.userId, sessionToken: r.sessionToken };
  },
});

/**
 * Sign in with Apple. The app sends Apple's signed identity token; the
 * Apple user id and email come from the verified token, never from the
 * client's say-so.
 */
export const loginWithApple = action({
  args: {
    identityToken: v.string(),
    fullName: v.optional(v.string()),
    lang: v.optional(v.string()),
    client: v.optional(v.string()), // "web" | "app"
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; sessionToken: string }> => {
    let identity;
    try {
      identity = await verifyAppleIdentityToken(args.identityToken);
    } catch (e: any) {
      throw new ConvexError(typeof e?.message === "string" && e.message.startsWith("APPLE_") ? e.message : "APPLE_TOKEN_INVALID");
    }
    return await ctx.runMutation(internal.users.appleLogin, {
      appleId: identity.sub,
      email: identity.emailVerified ? identity.email : undefined,
      fullName: args.fullName,
      lang: args.lang,
      client: args.client,
    });
  },
});

export const appleLogin = internalMutation({
  args: {
    appleId: v.string(),
    email: v.optional(v.string()), // only passed when Apple verified it
    fullName: v.optional(v.string()),
    lang: v.optional(v.string()),
    client: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; sessionToken: string }> => {
    // Check if user already exists with this Apple ID
    const existingByApple = await ctx.db
      .query("users")
      .withIndex("by_apple_id", (q) => q.eq("appleId", args.appleId))
      .first();
    if (existingByApple) {
      return { userId: existingByApple._id, sessionToken: await createUserSession(ctx, existingByApple._id, args.client) };
    }

    // Check if user exists with same email
    if (args.email) {
      const existingByEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email!))
        .unique();
      if (existingByEmail) {
        // Link Apple ID to existing account
        // Apple verified this email, so it counts as confirmed too.
        await ctx.db.patch(existingByEmail._id, {
          appleId: args.appleId,
          ...(existingByEmail.emailVerified === false ? { emailVerified: true } : {}),
        });
        return { userId: existingByEmail._id, sessionToken: await createUserSession(ctx, existingByEmail._id, args.client) };
      }
    }

    // Create new user
    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const memberSince = `Member since ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    const userId = await ctx.db.insert("users", {
      name: args.fullName && !playerNameProblem(args.fullName) ? normalizeName(args.fullName) : "Escape Fan",
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
        lang: args.lang || "en",
      });
    }

    return { userId, sessionToken: await createUserSession(ctx, userId, args.client) };
  },
});

/**
 * Sign in with Google (website). The site sends the ID token from Google
 * Identity Services; the Google user id, email and name come from the
 * verified token, never from the client's say-so.
 */
export const loginWithGoogle = action({
  args: {
    idToken: v.string(),
    lang: v.optional(v.string()),
    client: v.optional(v.string()), // "web" | "app"
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; sessionToken: string }> => {
    let identity;
    try {
      identity = await verifyGoogleIdToken(args.idToken);
    } catch (e: any) {
      throw new ConvexError(typeof e?.message === "string" && e.message.startsWith("GOOGLE_") ? e.message : "GOOGLE_TOKEN_INVALID");
    }
    // Every account needs a real email (bookings, receipts), and only a
    // Google-verified one may be linked to an existing account.
    if (!identity.email || !identity.emailVerified) throw new ConvexError("GOOGLE_EMAIL_UNVERIFIED");
    return await ctx.runMutation(internal.users.googleLogin, {
      googleId: identity.sub,
      email: identity.email,
      fullName: identity.name,
      lang: args.lang,
      client: args.client,
    });
  },
});

export const googleLogin = internalMutation({
  args: {
    googleId: v.string(),
    email: v.string(), // verified by Google
    fullName: v.optional(v.string()),
    lang: v.optional(v.string()),
    client: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ userId: Id<"users">; sessionToken: string }> => {
    const existingByGoogle = await ctx.db
      .query("users")
      .withIndex("by_google_id", (q) => q.eq("googleId", args.googleId))
      .first();
    if (existingByGoogle) {
      return { userId: existingByGoogle._id, sessionToken: await createUserSession(ctx, existingByGoogle._id, args.client) };
    }

    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existingByEmail) {
      // Link Google to the existing account. Google verified this email,
      // so it counts as confirmed too.
      await ctx.db.patch(existingByEmail._id, {
        googleId: args.googleId,
        ...(existingByEmail.emailVerified === false ? { emailVerified: true } : {}),
      });
      return { userId: existingByEmail._id, sessionToken: await createUserSession(ctx, existingByEmail._id, args.client) };
    }

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const memberSince = `Member since ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    const name = args.fullName && !playerNameProblem(args.fullName) ? normalizeName(args.fullName) : "Escape Fan";

    const userId = await ctx.db.insert("users", {
      name,
      email: args.email,
      googleId: args.googleId,
      avatar: "",
      title: "Escape Rookie",
      memberSince,
      played: 0,
      escaped: 0,
      awards: 0,
      wishlist: [],
      language: args.lang === "el" || args.lang === "nl" || args.lang === "en" ? args.lang : undefined,
    });

    await ctx.scheduler.runAfter(0, internal.email.sendPlayerWelcome, {
      playerName: name,
      playerEmail: args.email,
      lang: args.lang || "en",
    });

    return { userId, sessionToken: await createUserSession(ctx, userId, args.client) };
  },
});

export const toggleWishlist = mutation({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV, roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);

    const wishlist = user.wishlist.includes(args.roomId)
      ? user.wishlist.filter((id) => id !== args.roomId)
      : [...user.wishlist, args.roomId];

    await ctx.db.patch(user._id, { wishlist });
    return wishlist;
  },
});

export const updateProfile = mutation({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    avatar: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);

    const updates: Record<string, any> = {};
    if (args.name !== undefined) {
      const problem = playerNameProblem(args.name);
      if (problem) throw new ConvexError(NAME_MESSAGES[problem]);
      updates.name = normalizeName(args.name);
    }
    if (args.phone !== undefined) {
      const phone = args.phone.trim();
      if (phone.length > 30 || !/^[+0-9 ()-]*$/.test(phone)) throw new ConvexError("Please enter a valid phone number");
      updates.phone = phone;
    }

    // Store the storageId persistently — URL is resolved at query time
    if (args.avatarStorageId) {
      await assertUpload(ctx, args.avatarStorageId, "image", MAX_IMAGE_BYTES);
      updates.avatarStorageId = args.avatarStorageId;
      // Also set avatar to empty so the storageId path is used
      updates.avatar = "";
    } else if (args.avatar !== undefined) {
      // Only clearing it, or one of our own stored files: never a link to
      // another site (it would see the IP of everyone who views the profile).
      if (args.avatar !== "" && !isOwnStorageUrl(args.avatar)) throw new ConvexError("Please upload a photo");
      updates.avatar = args.avatar;
      // Clear storageId when avatar is explicitly set/cleared
      updates.avatarStorageId = undefined;
    }

    await ctx.db.patch(user._id, updates);
    return user._id;
  },
});

// ─── Update language preference ───
export const updateLanguage = mutation({
  args: {
    sessionToken: v.string(),
    language: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    // Only languages we have texts for (also called from the public HTTP /updateLanguage).
    if (!["en", "el", "nl"].includes(args.language)) throw new ConvexError("Unsupported language");
    await ctx.db.patch(user._id, { language: args.language });
  },
});

export const generateUploadUrl = mutation({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    await rateLimit(ctx, `upload:user:${user._id}`, UPLOADS_PER_HOUR_USER, HOUR);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const updateStats = internalMutation({
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

export const setAdmin = internalMutation({
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
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    latitude: v.number(),
    longitude: v.number(),
    city: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    if (Math.abs(args.latitude) > 90 || Math.abs(args.longitude) > 180) throw new Error("Invalid location");

    // Only an approximate position is kept (2 decimals ≈ 1 km), enough for
    // "rooms near you" (checklist item 24).
    const round = (n: number) => Math.round(n * 100) / 100;
    await ctx.db.patch(user._id, {
      latitude: round(args.latitude),
      longitude: round(args.longitude),
      city: args.city?.slice(0, 100),
    });
    return user._id;
  },
});

/* ═══════════════════════════════════════════════════════════
   Account Deletion (Apple Guideline 5.1.1(v))
   Users who create an account must be able to delete it.
   This permanently removes the user and all associated data.
   ═══════════════════════════════════════════════════════════ */
export const deleteAccount = mutation({
  args: {
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    // Confirmation, so a stolen session alone can't wipe the account:
    // the password, or the word DELETE for Apple accounts that have none.
    password: v.optional(v.string()),
    confirm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Old app builds cannot ask for the password: they are told to update.
    if (!args.sessionToken) throw new ConvexError("Please update the UNLOCKED app to delete your account.");
    const user = await requireUser(ctx, args.sessionToken);
    const userId = user._id;

    if (user.password) {
      // Counted (returned, not thrown, so the try is saved): 10 per hour.
      await rateLimit(ctx, `deleteAccount:${userId}`, 10, HOUR);
      if (!args.password || !(await verifyPassword(args.password, user.password))) {
        return { error: "WRONG_PASSWORD" };
      }
    } else if ((args.confirm ?? "").trim().toUpperCase() !== "DELETE") {
      return { error: "CONFIRM_REQUIRED" };
    }

    // 0. End every login session of this account
    const sessions = await ctx.db
      .query("userSessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const sess of sessions) await ctx.db.delete(sess._id);
    await removeOwnerTokens(ctx, { userId });

    // 1. Delete badges
    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const b of badges) await ctx.db.delete(b._id);

    // 2. Delete bookings
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const b of bookings) await ctx.db.delete(b._id);

    // 3. Delete posts and their likes/comments
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author_user", (q) => q.eq("authorUserId", userId))
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
      .filter((q) => q.eq(q.field("userId"), userId))
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
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    for (const c of userComments) await ctx.db.delete(c._id);

    // 6. Delete slot alerts
    const slotAlerts = await ctx.db
      .query("slotAlerts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const a of slotAlerts) await ctx.db.delete(a._id);

    // 7. Delete notifications
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const n of notifications) await ctx.db.delete(n._id);

    // 8. Delete premium subscriptions
    const premiumSubs = await ctx.db
      .query("premiumSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const s of premiumSubs) await ctx.db.delete(s._id);

    // 9. Delete friendships
    const friendsAsSender = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", userId))
      .collect();
    for (const f of friendsAsSender) await ctx.db.delete(f._id);
    const friendsAsReceiver = await ctx.db
      .query("friendships")
      .withIndex("by_receiver", (q) => q.eq("receiverId", userId))
      .collect();
    for (const f of friendsAsReceiver) await ctx.db.delete(f._id);

    // 9b. Delete booking invites
    const invitesAsInvitee = await ctx.db
      .query("bookingInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", userId))
      .collect();
    for (const inv of invitesAsInvitee) await ctx.db.delete(inv._id);

    // 9c. Delete reports filed by or about this player (and report photos)
    const roomReports = await ctx.db
      .query("roomReports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const r of roomReports) {
      for (const sid of r.photoStorageIds) await ctx.storage.delete(sid).catch(() => {});
      await ctx.db.delete(r._id);
    }
    const playerReports = await ctx.db
      .query("playerReports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const r of playerReports) await ctx.db.delete(r._id);

    // 10. Delete blocked-users entries (as blocker or blocked)
    const blocksAsBlocker = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocker", (q) => q.eq("blockerId", userId))
      .collect();
    for (const b of blocksAsBlocker) await ctx.db.delete(b._id);

    const blocksAsBlocked = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocked", (q) => q.eq("blockedUserId", userId))
      .collect();
    for (const b of blocksAsBlocked) await ctx.db.delete(b._id);

    // 11. Delete reports made by user
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_reporter_post", (q) => q.eq("reporterId", userId))
      .collect();
    for (const r of reports) await ctx.db.delete(r._id);

    // 12. Leave every chat and forget the chat devices (messages.ts)
    await removeUserFromChats(ctx, userId);

    // 13. Delete the user record itself
    await ctx.db.delete(userId);

    return { success: true };
  },
});

// ── Leaderboard ──

export const leaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Read from the cache the cron fills (publicCache.ts); compute live only
    // if it hasn't run yet.
    const max = Math.min(Math.max(Math.floor(args.limit ?? 20), 1), 100);
    const full = (await readPublicCache<Awaited<ReturnType<typeof computeLeaderboard>>>(ctx, "leaderboard")) ?? (await computeLeaderboard(ctx, 100));
    return { ...full, players: full.players.slice(0, max) };
  },
});

export async function computeLeaderboard(ctx: QueryCtx, max: number) {
    

    // Fetch all users and only completed bookings (use status index)
    const [allUsers, completedBookings] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("bookings").withIndex("by_status", (q) => q.eq("status", "completed")).collect(),
    ]);

    // Compute dynamic stats per user using a Map for O(1) lookups
    const userBookingsMap = new Map<string, typeof completedBookings>();
    for (const b of completedBookings) {
      if (!b.userId) continue;
      const uid = b.userId as string;
      if (!userBookingsMap.has(uid)) userBookingsMap.set(uid, []);
      userBookingsMap.get(uid)!.push(b);
    }

    const userStats = allUsers.map((user) => {
      const userBookings = userBookingsMap.get(user._id as string) ?? [];
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

    // Batch-fetch badges for all top users in parallel
    const badgeCounts = await Promise.all(
      topUsers.map(async (user) => {
        const badges = await ctx.db
          .query("badges")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        return badges.length;
      })
    );

    // Batch-resolve avatars for users with storageIds
    const avatarUrls = await Promise.all(
      topUsers.map(async (user) => {
        if (user.avatarStorageId) {
          return await ctx.storage.getUrl(user.avatarStorageId);
        }
        return null;
      })
    );

    const players = topUsers.map((user, i) => {
      const avatar = avatarUrls[i] || user.avatar;
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
        badges: badgeCounts[i],
        isPremium: user.isPremium ?? false,
      };
    });

    // Aggregate stats across ALL users (dynamic)
    const totalEscapes = userStats.reduce((sum, u) => sum + u.escaped, 0);
    const totalPlayed = userStats.reduce((sum, u) => sum + u.played, 0);
    const successRate = totalPlayed > 0 ? Math.round((totalEscapes / totalPlayed) * 100) : 0;

    // Total badges — count from the already-loaded badge queries for top users
    // For accuracy we still need the full count, but we can use a single query
    const allBadgesCount = (await ctx.db.query("badges").collect()).length;

    // ── Per-room escape stats (computed from bookings) ──
    const allRooms = await filterPublicRooms(ctx, await ctx.db.query("rooms").collect());
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Use ALL bookings (not just completed) for room stats — load non-cancelled
    const allBookings = await ctx.db.query("bookings").collect();

    const roomStats: Record<string, { completed: number; total: number }> = {};
    for (const booking of allBookings) {
      if (booking.status === "cancelled") continue;
      const rid = booking.roomId as string;
      if (!roomStats[rid]) roomStats[rid] = { completed: 0, total: 0 };
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

    // Batch-enrich top rooms with company name
    const roomCompanyIds = Array.from(new Set(topRooms.map((r) => r.companyId).filter(Boolean)));
    const roomCompanies = await Promise.all(roomCompanyIds.map((id) => ctx.db.get(id!)));
    const roomCompanyMap = new Map(
      roomCompanyIds.map((id, i) => [id!.toString(), roomCompanies[i]])
    );

    const topRoomsEnriched = topRooms.map((r) => {
      const company = r.companyId ? roomCompanyMap.get(r.companyId.toString()) : null;
      return { ...r, companyName: company?.name ?? "" };
    });

    return {
      players,
      topRooms: topRoomsEnriched,
      stats: {
        totalEscapes,
        totalPlayed,
        successRate,
        totalBadges: allBadgesCount,
      },
    };
}
