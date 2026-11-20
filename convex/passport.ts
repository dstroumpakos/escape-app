import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, optionalUser } from "./userSession";
import { requireCompany, requireRoomOf } from "./companySession";
import { companyIsPublic } from "./companyRules";
import { rateLimit, HOUR } from "./rateLimit";
import { notifyUser } from "./push";
import { countedPlays, absorbPlayLog } from "./plays";

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
 * The maze game has 10 doors. PASSPORT_CHAMBERS[i] = stamps placed in the
 * doors so far for door i to be open (index 0 = entrance): the first door
 * takes 5 stamps, every next door 10 more.
 */
export const PASSPORT_CHAMBERS = [0, 5, 15, 25, 35, 45, 55, 65, 75, 85, 95] as const;
const ALL_DOORS = PASSPORT_CHAMBERS[PASSPORT_CHAMBERS.length - 1];

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
    // When the team's game started (ms). The portal sends today's slot time,
    // e.g. 9:30, worked out in the company's own time zone.
    playedAt: v.optional(v.number()),
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
    const now = Date.now();
    // A game that started in the last 12 hours (a few minutes of clock skew allowed).
    if (args.playedAt !== undefined && (!Number.isFinite(args.playedAt) || args.playedAt > now + 15 * 60 * 1000 || args.playedAt < now - 12 * HOUR)) {
      throw new ConvexError("Pick the time the team's game started today.");
    }
    await rateLimit(ctx, `stampSession:${company._id}`, 60, HOUR);
    const token = newToken();
    const id = await ctx.db.insert("stampSessions", {
      companyId: company._id,
      roomId: room._id,
      players: args.players,
      claimed: 0,
      escaped: args.escaped,
      escapeSeconds,
      playedAt: args.playedAt,
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
      playedAt: s.playedAt ?? null,
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
        playedAt: s.playedAt ?? null,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      }))
    );
  },
});

// ─── Players ───────────────────────────────────────────────

/** QR stamps + verified/vouched Rooms Played entries (plays.ts): both open maze doors. */
async function countStamps(ctx: { db: any }, userId: Id<"users">): Promise<number> {
  const stamps = (await ctx.db.query("stamps").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect()).length;
  return stamps + (await countedPlays(ctx as any, userId));
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
      playedAt: s.playedAt ?? s.createdAt,
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

    // Added this room by hand before? The stamp replaces that entry.
    const absorbed = await absorbPlayLog(ctx, me._id, s.roomId);
    const before = await countStamps(ctx, me._id);
    await ctx.db.insert("stamps", {
      userId: me._id,
      roomId: s.roomId,
      companyId: s.companyId,
      sessionId: s._id,
      escaped: s.escaped,
      escapeSeconds: s.escapeSeconds,
      playedAt: s.playedAt,
      createdAt: Date.now(),
    });
    await ctx.db.patch(s._id, { claimed: s.claimed + 1 });
    // Counts on the profile too ("rooms played" / "escaped").
    await ctx.db.patch(me._id, {
      played: Math.max(0, (me.played ?? 0) - absorbed.played) + 1,
      escaped: Math.max(0, (me.escaped ?? 0) - absorbed.escaped) + (s.escaped ? 1 : 0),
    });

    const total = before + 1;
    // Enough stamps for the next door of the maze game (not when the stamp
    // only replaced a verified entry: that door was announced already).
    const opened = absorbed.played ? -1 : (PASSPORT_CHAMBERS as readonly number[]).indexOf(total);
    if (opened > 0) {
      const el = me.language === "el";
      await notifyUser(ctx, {
        userId: me._id,
        type: "system",
        title: el ? "🗝️ Μπορείς να ανοίξεις την επόμενη πόρτα!" : "🗝️ You can open the next door!",
        message: el
          ? `Με ${total} σφραγίδες έχεις αρκετές για την πόρτα ${opened} του λαβύρινθου. Πήγαινε στο passport να τις τοποθετήσεις.`
          : `With ${total} stamps you have enough for door ${opened} of the maze. Go to your passport and place them.`,
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
          // null on older stamps: show the date only
          playedAt: st.playedAt ?? null,
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
      // Verified/vouched Rooms Played entries count like stamps (plays.ts).
      total: stamps.length + (await countedPlays(ctx, me._id)),
      cities: cities.size,
      escapedPct: stamps.length ? Math.round((stamps.filter((s) => s.escaped).length / stamps.length) * 100) : 0,
      chambers: [...PASSPORT_CHAMBERS],
      placed: (await ctx.db.query("passportProgress").withIndex("by_user", (q) => q.eq("userId", me._id)).first())?.placed ?? 0,
    };
  },
});

/**
 * Maze game: put one of your stamps into the door you stand at. The server
 * keeps the count, so nobody can place more stamps than they collected.
 */
export const placeStamp = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    await rateLimit(ctx, `placeStamp:${me._id}`, 300, HOUR);
    const total = await countStamps(ctx, me._id);
    const row = await ctx.db.query("passportProgress").withIndex("by_user", (q) => q.eq("userId", me._id)).first();
    const placed = row?.placed ?? 0;
    if (placed >= ALL_DOORS) throw new ConvexError("Every door of the maze is already open.");
    if (placed >= total) throw new ConvexError("You have no stamps left. Play a room and scan the QR at the end.");
    if (row) await ctx.db.patch(row._id, { placed: placed + 1, updatedAt: Date.now() });
    else await ctx.db.insert("passportProgress", { userId: me._id, placed: 1, updatedAt: Date.now() });
    const door = (PASSPORT_CHAMBERS as readonly number[]).indexOf(placed + 1);
    return { placed: placed + 1, openedDoor: door > 0 ? door : null };
  },
});
