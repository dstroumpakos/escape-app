import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, optionalUser } from "./userSession";
import { requireCompany, requireRoomOf } from "./companySession";
import { companyIsPublic } from "./companyRules";
import { rateLimit, HOUR } from "./rateLimit";
import { notifyUser } from "./push";

/**
 * My Passport: a stamp for every room a player has played, collected by
 * scanning the QR the escape room shows at the end of the game. Works
 * whether the team booked on UNLOCKED or anywhere else.
 *
 * 1. The company ends the game in its portal: room, players, escaped/time
 *    -> a stamp session with a random token (QR), valid 30 minutes.
 * 2. Each player scans it with their own phone, logged in -> one stamp.
 * Safeguards: as many stamps as players, the token expires, one stamp per
 * room per player, scans are rate limited.
 *
 * Stamps open the chambers of the passport maze (PASSPORT_CHAMBERS).
 */

export const STAMP_WINDOW_MS = 30 * 60 * 1000;
const MAX_PLAYERS = 20;

/**
 * Stamps needed for each chamber of the maze (index 0 = entrance): the first
 * chamber at 5 stamps, then every 10 more.
 */
export const PASSPORT_CHAMBERS = [0, 5, 15, 25, 35, 45, 55, 65, 75, 85] as const;

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const TOKEN_RE = /^[0-9a-f]{48}$/;

// ─── Company ───────────────────────────────────────────────

/** End of game: create the QR the players scan. */
export const startSession = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("rooms"),
    players: v.number(),
    escaped: v.boolean(),
    escapeMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "passport:startSession");
    if (!companyIsPublic(company)) throw new ConvexError("Your company isn't approved yet.");
    const room = await requireRoomOf(ctx, company, args.roomId);
    if (!Number.isInteger(args.players) || args.players < 1 || args.players > MAX_PLAYERS) {
      throw new ConvexError(`Players must be between 1 and ${MAX_PLAYERS}.`);
    }
    let escapeSeconds: number | undefined;
    if (args.escaped && args.escapeMinutes !== undefined) {
      if (!Number.isFinite(args.escapeMinutes) || args.escapeMinutes <= 0 || args.escapeMinutes > 300) {
        throw new ConvexError("Enter the escape time in minutes.");
      }
      escapeSeconds = Math.round(args.escapeMinutes * 60);
    }
    await rateLimit(ctx, `stampSession:${company._id}`, 60, HOUR);
    const now = Date.now();
    const token = newToken();
    const id = await ctx.db.insert("stampSessions", {
      companyId: company._id,
      roomId: room._id,
      players: args.players,
      claimed: 0,
      escaped: args.escaped,
      escapeSeconds,
      token,
      expiresAt: now + STAMP_WINDOW_MS,
      createdAt: now,
    });
    return { sessionId: id, token, expiresAt: now + STAMP_WINDOW_MS };
  },
});

/** Live view for the company screen: how many players took their stamp. */
export const sessionStatus = query({
  args: { sessionToken: v.string(), sessionId: v.id("stampSessions") },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "passport:sessionStatus");
    const s = await ctx.db.get(args.sessionId);
    if (!s || s.companyId !== company._id) return null;
    const room = await ctx.db.get(s.roomId);
    return {
      token: s.token,
      roomTitle: room?.title ?? "",
      players: s.players,
      claimed: s.claimed,
      escaped: s.escaped,
      expiresAt: s.expiresAt,
    };
  },
});

/** The company's latest end-of-game QRs. */
export const recentSessions = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "passport:recentSessions");
    const rows = await ctx.db
      .query("stampSessions")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .order("desc")
      .take(20);
    return Promise.all(
      rows.map(async (s) => ({
        _id: s._id,
        roomTitle: (await ctx.db.get(s.roomId))?.title ?? "",
        players: s.players,
        claimed: s.claimed,
        escaped: s.escaped,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      }))
    );
  },
});

// ─── Players ───────────────────────────────────────────────

async function countStamps(ctx: { db: any }, userId: Id<"users">): Promise<number> {
  return (await ctx.db.query("stamps").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect()).length;
}

/** What a scanned QR is for (shown before the player takes the stamp). */
export const preview = query({
  args: { token: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!TOKEN_RE.test(args.token)) return null;
    const s = await ctx.db
      .query("stampSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!s) return null;
    const [room, company, me] = await Promise.all([
      ctx.db.get(s.roomId),
      ctx.db.get(s.companyId),
      optionalUser(ctx, args.sessionToken),
    ]);
    let alreadyHave = false;
    if (me) {
      alreadyHave = !!(await ctx.db
        .query("stamps")
        .withIndex("by_user_room", (q) => q.eq("userId", me._id).eq("roomId", s.roomId))
        .first());
    }
    return {
      roomTitle: room?.title ?? "",
      roomTheme: room?.theme ?? "",
      roomImage: room?.image ?? "",
      companyName: company?.name ?? "",
      escaped: s.escaped,
      escapeSeconds: s.escapeSeconds ?? null,
      expired: Date.now() > s.expiresAt,
      full: s.claimed >= s.players,
      alreadyHave,
    };
  },
});

/** Take the stamp. Returns the new total and the chamber it opened, if any. */
export const claim = mutation({
  args: { sessionToken: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    await rateLimit(ctx, `stampClaim:${me._id}`, 20, HOUR);
    if (!TOKEN_RE.test(args.token)) throw new ConvexError("This QR isn't valid.");
    const s = await ctx.db
      .query("stampSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!s) throw new ConvexError("This QR isn't valid.");
    if (Date.now() > s.expiresAt) throw new ConvexError("This QR has expired. Ask the escape room for a new one.");
    const existing = await ctx.db
      .query("stamps")
      .withIndex("by_user_room", (q) => q.eq("userId", me._id).eq("roomId", s.roomId))
      .first();
    if (existing) return { already: true, total: await countStamps(ctx, me._id), opened: null };
    if (s.claimed >= s.players) throw new ConvexError("All the players of this game already took their stamp.");

    const before = await countStamps(ctx, me._id);
    await ctx.db.insert("stamps", {
      userId: me._id,
      roomId: s.roomId,
      companyId: s.companyId,
      sessionId: s._id,
      escaped: s.escaped,
      escapeSeconds: s.escapeSeconds,
      createdAt: Date.now(),
    });
    await ctx.db.patch(s._id, { claimed: s.claimed + 1 });
    // Counts on the profile too ("rooms played" / "escaped").
    await ctx.db.patch(me._id, { played: (me.played ?? 0) + 1, escaped: (me.escaped ?? 0) + (s.escaped ? 1 : 0) });

    const total = before + 1;
    const opened = (PASSPORT_CHAMBERS as readonly number[]).indexOf(total);
    if (opened > 0) {
      const el = me.language === "el";
      await notifyUser(ctx, {
        userId: me._id,
        type: "system",
        title: el ? "🗝️ Άνοιξε νέος θάλαμος!" : "🗝️ A new chamber opened!",
        message: el
          ? `Με ${total} σφραγίδες έφτασες σε νέο θάλαμο του λαβύρινθου. Δες το δώρο σου στο passport.`
          : `With ${total} stamps you reached a new chamber of the maze. See your gift in your passport.`,
        read: false,
        createdAt: Date.now(),
        data: { kind: "passport", chamber: opened },
      });
    }
    return { already: false, total, opened: opened > 0 ? opened : null };
  },
});

/** The player's passport: their stamps, newest first, with room details. */
export const mine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return null;
    const rows: Doc<"stamps">[] = await ctx.db
      .query("stamps")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .order("desc")
      .collect();
    const stamps = await Promise.all(
      rows.map(async (st) => {
        const [room, company] = await Promise.all([ctx.db.get(st.roomId), ctx.db.get(st.companyId)]);
        return {
          _id: st._id,
          roomId: st.roomId,
          roomTitle: room?.title ?? "",
          theme: room?.theme ?? "",
          location: room?.location ?? "",
          companyName: company?.name ?? "",
          city: company?.city ?? "",
          escaped: st.escaped,
          escapeSeconds: st.escapeSeconds ?? null,
          createdAt: st.createdAt,
        };
      })
    );
    const cities = new Set(stamps.map((s) => s.city).filter(Boolean));
    return {
      name: me.name,
      avatar: me.avatar,
      passportNo: `UNL-${String(me._id).slice(-8).toUpperCase()}`,
      memberSince: me.memberSince,
      stamps,
      total: stamps.length,
      cities: cities.size,
      escapedPct: stamps.length ? Math.round((stamps.filter((s) => s.escaped).length / stamps.length) * 100) : 0,
      chambers: [...PASSPORT_CHAMBERS],
    };
  },
});
