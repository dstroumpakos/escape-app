import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { avatarUrl } from "./avatars";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, optionalUser } from "./userSession";
import { requireCompany } from "./companySession";
import { requireAdminSession } from "./adminSession";
import { companyIsPublic, filterPublicRooms } from "./companyRules";
import { rateLimit, HOUR } from "./rateLimit";
import { notifyUser } from "./push";
import { assertUpload, MAX_PHOTO_BYTES } from "./uploads";
import { cleanExternalUrl } from "./externalLinks";
import { readExif, distanceKm } from "./exif";

/**
 * Rooms Played: a player adds a room they played to their passport by hand,
 * for games that have no QR stamp (passport.ts). Trust levels:
 *
 *   confirmed  a QR stamp (passport.ts, not stored here)
 *   verified   proof (photo / receipt / forwarded booking email) approved by
 *              the room's company, the UNLOCKED team, or automatically when
 *              the photo's date and GPS match and nobody answered in 14 days
 *   vouched    a teammate who has a confirmed/verified entry for the same
 *              room within a day confirmed they played together
 *   declared   added by hand with no proof: personal log only
 *
 * Only verified and vouched plays count (`counted`): profile totals
 * (users.played / escaped), the passport maze and badges.
 *
 * Rooms not on UNLOCKED become community rooms. Each is a lead for sales and
 * gets merged into the real room once the company joins.
 */

const DAY = 24 * HOUR;
const AUTO_VERIFY_AFTER = 14 * DAY;
const STALE_FOR_ADMIN = 7 * DAY;
const MAX_TEAMMATES = 11;
const PROOF_TEXT_MAX = 4000;

type Ctx = QueryCtx | MutationCtx;
type Status = Doc<"playLogs">["status"];

// ─── Helpers ───────────────────────────────────────────────

/** Lower case, no accents, letters and digits only: "Το Σπίτι!" -> "το σπιτι". */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayGap = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

function checkPlayedOn(day: string) {
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(day))) throw new ConvexError("Pick the date you played.");
  // A day ahead is fine (time zones); the future is not.
  if (Date.parse(day) > Date.now() + DAY) throw new ConvexError("The date can't be in the future.");
  if (day < "2000-01-01") throw new ConvexError("Pick the date you played.");
}

function clean(s: string | undefined, max: number, label: string, min = 0): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length < min) throw new ConvexError(`Enter the ${label}.`);
  if (t.length > max) throw new ConvexError(`The ${label} is too long.`);
  return t;
}

/** Adds or removes a play from the player's totals (users.played / escaped). */
async function setCounted(ctx: MutationCtx, log: Doc<"playLogs">, counted: boolean) {
  if (log.counted === counted) return;
  const user = await ctx.db.get(log.userId);
  if (user) {
    const d = counted ? 1 : -1;
    await ctx.db.patch(user._id, {
      played: Math.max(0, (user.played ?? 0) + d),
      escaped: Math.max(0, (user.escaped ?? 0) + (log.escaped ? d : 0)),
    });
  }
  await ctx.db.patch(log._id, { counted });
}

/** Verified + vouched plays: they count like stamps in the passport maze. */
export async function countedPlays(ctx: Ctx, userId: Id<"users">): Promise<number> {
  const rows = await ctx.db.query("playLogs").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  return rows.filter((r) => r.counted).length;
}

/**
 * passport.claim: the player now has a QR stamp for a room they had added by
 * hand. The stamp wins; the play log goes. Returns what it had added to the
 * player's totals, so the caller can patch the user once.
 */
export async function absorbPlayLog(
  ctx: MutationCtx,
  userId: Id<"users">,
  roomId: Id<"rooms">
): Promise<{ played: number; escaped: number }> {
  const log = await ctx.db
    .query("playLogs")
    .withIndex("by_user_room", (q) => q.eq("userId", userId).eq("roomId", roomId))
    .first();
  if (!log) return { played: 0, escaped: 0 };
  const removed = log.counted ? { played: 1, escaped: log.escaped ? 1 : 0 } : { played: 0, escaped: 0 };
  await dropLog(ctx, log, { adjustTotals: false });
  return removed;
}

/** Deletes a log with its proof file and vouch requests. */
async function dropLog(ctx: MutationCtx, log: Doc<"playLogs">, opts: { adjustTotals: boolean }) {
  if (opts.adjustTotals) await setCounted(ctx, log, false);
  if (log.proofStorageId) await ctx.storage.delete(log.proofStorageId).catch(() => {});
  for (const vr of await ctx.db.query("playVouches").withIndex("by_log", (q) => q.eq("logId", log._id)).collect()) {
    await ctx.db.delete(vr._id);
  }
  if (log.communityRoomId) {
    const cr = await ctx.db.get(log.communityRoomId);
    if (cr) await ctx.db.patch(cr._id, { players: Math.max(0, cr.players - 1) });
  }
  await ctx.db.delete(log._id);
}

/** users.deleteAccount */
export async function deletePlayerPlays(ctx: MutationCtx, userId: Id<"users">) {
  for (const log of await ctx.db.query("playLogs").withIndex("by_user", (q) => q.eq("userId", userId)).collect()) {
    await dropLog(ctx, log, { adjustTotals: false });
  }
  for (const vr of await ctx.db
    .query("playVouches")
    .withIndex("by_voucher_status", (q) => q.eq("voucherId", userId))
    .collect()) {
    await ctx.db.delete(vr._id);
  }
}

// ─── Postmark inbound: personal forwarding addresses ───
// INBOUND_EMAIL_ADDRESS is the Postmark inbound address (…@inbound.postmarkapp.com
// or a custom inbound domain). Each player forwards to "<local>+<userId>-<sig>@<domain>";
// Postmark passes the "+" part as MailboxHash. The signature stops anyone from
// guessing another player's address from their (public) user id.

async function inboundSig(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`inbound:${userId}`)));
  return Array.from(mac.slice(0, 5), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function inboundAddressFor(userId: Id<"users">): Promise<string | null> {
  const base = process.env.INBOUND_EMAIL_ADDRESS;
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!base || !secret || !base.includes("@")) return null;
  const [local, domain] = base.split("@");
  return `${local}+${userId}-${await inboundSig(userId, secret)}@${domain}`;
}

/** The player a MailboxHash belongs to, or null when it isn't a valid one. */
async function userFromMailboxHash(ctx: Ctx, hash: string): Promise<Doc<"users"> | null> {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  const m = /^([a-z0-9]{20,40})-([0-9a-f]{10})$/.exec(hash.trim().toLowerCase());
  if (!secret || !m) return null;
  if ((await inboundSig(m[1], secret)) !== m[2]) return null;
  const id = ctx.db.normalizeId("users", m[1]);
  return id ? await ctx.db.get(id) : null;
}

async function areFriends(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<boolean> {
  const ab = await ctx.db.query("friendships").withIndex("by_pair", (q) => q.eq("requesterId", a).eq("receiverId", b)).first();
  if (ab?.status === "accepted") return true;
  const ba = await ctx.db.query("friendships").withIndex("by_pair", (q) => q.eq("requesterId", b).eq("receiverId", a)).first();
  return ba?.status === "accepted";
}

/**
 * Can `userId` vouch for `log`? Only with their own confirmed (QR stamp) or
 * verified (not vouched: no chains) entry for the same room, played within a
 * day of it.
 */
async function canVouch(ctx: Ctx, userId: Id<"users">, log: Doc<"playLogs">): Promise<boolean> {
  if (userId === log.userId) return false;
  if (log.roomId) {
    const roomId = log.roomId;
    const stamp = await ctx.db.query("stamps").withIndex("by_user_room", (q) => q.eq("userId", userId).eq("roomId", roomId)).first();
    if (stamp && dayGap(isoDay(stamp.playedAt ?? stamp.createdAt), log.playedOn) <= 1) return true;
    const own = await ctx.db.query("playLogs").withIndex("by_user_room", (q) => q.eq("userId", userId).eq("roomId", roomId)).first();
    return !!own && own.status === "verified" && dayGap(own.playedOn, log.playedOn) <= 1;
  }
  if (log.communityRoomId) {
    const crId = log.communityRoomId;
    const own = await ctx.db
      .query("playLogs")
      .withIndex("by_user_community", (q) => q.eq("userId", userId).eq("communityRoomId", crId))
      .first();
    return !!own && own.status === "verified" && dayGap(own.playedOn, log.playedOn) <= 1;
  }
  return false;
}

type Place = { title: string; company: string; city: string; lat?: number; lng?: number; theme: string; image: string };

async function placeOf(ctx: Ctx, log: Doc<"playLogs">): Promise<Place> {
  if (log.roomId) {
    const room = await ctx.db.get(log.roomId);
    const company = room?.companyId ? await ctx.db.get(room.companyId) : null;
    return {
      title: room?.title ?? "",
      company: company?.name ?? "",
      city: company?.city ?? room?.location ?? "",
      lat: room?.latitude,
      lng: room?.longitude,
      theme: room?.theme ?? "",
      image: room?.image ?? "",
    };
  }
  const cr = log.communityRoomId ? await ctx.db.get(log.communityRoomId) : null;
  return {
    title: cr?.name ?? "",
    company: cr?.companyName ?? "",
    city: cr?.city ?? "",
    lat: cr?.latitude,
    lng: cr?.longitude,
    theme: "",
    image: "",
  };
}

async function tell(
  ctx: MutationCtx,
  userId: Id<"users">,
  el: { title: string; message: string },
  en: { title: string; message: string },
  data: Record<string, unknown>
) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const txt = user.language === "el" ? el : en;
  await notifyUser(ctx, { userId, type: "system", ...txt, read: false, createdAt: Date.now(), data });
}

/** Approve or reject a log (company, admin, auto). */
async function review(
  ctx: MutationCtx,
  log: Doc<"playLogs">,
  approve: boolean,
  by: string,
  method: "company" | "admin" | "auto",
  note?: string
) {
  const now = Date.now();
  if (approve) {
    await ctx.db.patch(log._id, { status: "verified", method, reviewedBy: by, reviewedAt: now, reviewNote: undefined });
    await setCounted(ctx, log, true);
  } else {
    await ctx.db.patch(log._id, { status: "rejected", reviewedBy: by, reviewedAt: now, reviewNote: note });
    await setCounted(ctx, log, false);
  }
  const place = await placeOf(ctx, log);
  if (approve) {
    await tell(
      ctx,
      log.userId,
      { title: "✅ Επαληθεύτηκε!", message: `Το «${place.title}» μετράει πλέον στο passport σου.` },
      { title: "✅ Verified!", message: `"${place.title}" now counts in your passport.` },
      { kind: "plays", logId: log._id }
    );
  } else {
    await tell(
      ctx,
      log.userId,
      { title: "Δεν επαληθεύτηκε", message: `Το «${place.title}» δεν επαληθεύτηκε${note ? `: ${note}` : "."} Μπορείς να στείλεις άλλη απόδειξη.` },
      { title: "Not verified", message: `"${place.title}" wasn't verified${note ? `: ${note}` : "."} You can send another proof.` },
      { kind: "plays", logId: log._id }
    );
  }
}

// ─── Players ───────────────────────────────────────────────

/** Search for the room you played: the UNLOCKED catalog first, then community rooms. */
export const searchPlaces = query({
  args: { q: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const q = norm(args.q).slice(0, 60);
    if (q.length < 2) return [];
    const me = await optionalUser(ctx, args.sessionToken);
    const all = (await ctx.db.query("rooms").collect()).filter((r) => !r.photosOnly && r.isActive !== false);
    const hits = all.filter((r) => norm(`${r.title} ${r.location}`).includes(q)).slice(0, 30);
    const visible = (await filterPublicRooms(ctx, hits)).slice(0, 8);
    const catalog = await Promise.all(
      visible.map(async (r) => {
        const company = r.companyId ? await ctx.db.get(r.companyId) : null;
        return {
          kind: "room" as const,
          id: r._id as string,
          title: r.title,
          company: company?.name ?? "",
          city: company?.city ?? r.location,
          image: r.image,
        };
      })
    );
    const approved = await ctx.db
      .query("communityRooms")
      .withSearchIndex("search_name", (s) => s.search("name", args.q.slice(0, 60)).eq("status", "approved"))
      .take(8);
    const mine = me
      ? (await ctx.db.query("communityRooms").withIndex("by_status", (s) => s.eq("status", "pending")).collect()).filter(
          (c) => c.createdBy === me._id && norm(`${c.name} ${c.city}`).includes(q)
        )
      : [];
    const community = [...approved, ...mine].slice(0, 8).map((c) => ({
      kind: "community" as const,
      id: c._id as string,
      title: c.name,
      company: c.companyName,
      city: c.city,
      image: "",
    }));
    return [...catalog, ...community];
  },
});

const communityV = v.object({
  name: v.string(),
  companyName: v.string(),
  city: v.string(),
  country: v.string(),
  website: v.optional(v.string()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
});

/** Add a room I played. Starts as "declared"; send a proof or ask a teammate to vouch. */
export const addPlay = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.optional(v.id("rooms")),
    communityRoomId: v.optional(v.id("communityRooms")),
    community: v.optional(communityV), // a room that isn't in the search yet
    playedOn: v.string(),
    escaped: v.boolean(),
    escapeMinutes: v.optional(v.number()),
    hintsUsed: v.optional(v.number()),
    teammateIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    await rateLimit(ctx, `addPlay:${me._id}`, 15, HOUR);
    await rateLimit(ctx, `addPlayDay:${me._id}`, 40, DAY);
    checkPlayedOn(args.playedOn);
    if ([args.roomId, args.communityRoomId, args.community].filter(Boolean).length !== 1) {
      throw new ConvexError("Pick the room you played.");
    }
    let escapeSeconds: number | undefined;
    if (args.escaped && args.escapeMinutes !== undefined) {
      if (!Number.isFinite(args.escapeMinutes) || args.escapeMinutes <= 0 || args.escapeMinutes > 300) {
        throw new ConvexError("Enter the escape time in minutes.");
      }
      escapeSeconds = Math.round(args.escapeMinutes * 60);
    }
    if (args.hintsUsed !== undefined && (!Number.isInteger(args.hintsUsed) || args.hintsUsed < 0 || args.hintsUsed > 50)) {
      throw new ConvexError("Enter how many hints you used.");
    }

    // Which room
    let roomId: Id<"rooms"> | undefined = args.roomId;
    let communityRoomId: Id<"communityRooms"> | undefined = args.communityRoomId;
    if (args.community) {
      const c = args.community;
      const name = clean(c.name, 80, "room name", 2);
      const city = clean(c.city, 60, "city", 2);
      const key = `${norm(name)}|${norm(city)}`;
      const existing = await ctx.db.query("communityRooms").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (existing && existing.status === "merged" && existing.mergedIntoRoomId) {
        roomId = existing.mergedIntoRoomId;
      } else if (existing && existing.status !== "rejected") {
        communityRoomId = existing._id;
      } else {
        await rateLimit(ctx, `communityRoom:${me._id}`, 8, DAY);
        const lat = c.latitude, lng = c.longitude;
        const hasPin = lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        communityRoomId = await ctx.db.insert("communityRooms", {
          name,
          companyName: clean(c.companyName, 80, "company name"),
          city,
          country: clean(c.country, 60, "country", 2),
          website: cleanExternalUrl(c.website) || undefined,
          latitude: hasPin ? lat : undefined,
          longitude: hasPin ? lng : undefined,
          key,
          createdBy: me._id,
          status: "pending",
          players: 0,
          createdAt: Date.now(),
        });
      }
    }

    let companyId: Id<"companies"> | undefined;
    if (roomId) {
      const rid = roomId;
      const room = await ctx.db.get(rid);
      if (!room || room.photosOnly) throw new ConvexError("Room not found.");
      companyId = room.companyId;
      const stamp = await ctx.db.query("stamps").withIndex("by_user_room", (q) => q.eq("userId", me._id).eq("roomId", rid)).first();
      if (stamp) throw new ConvexError("This room is already stamped in your passport.");
      const dup = await ctx.db.query("playLogs").withIndex("by_user_room", (q) => q.eq("userId", me._id).eq("roomId", rid)).first();
      if (dup) throw new ConvexError("This room is already in your passport.");
    } else if (communityRoomId) {
      const crid = communityRoomId;
      const cr = await ctx.db.get(crid);
      if (!cr || cr.status === "rejected") throw new ConvexError("Room not found.");
      if (cr.status === "pending" && cr.createdBy !== me._id && !args.community) throw new ConvexError("Room not found.");
      const dup = await ctx.db
        .query("playLogs")
        .withIndex("by_user_community", (q) => q.eq("userId", me._id).eq("communityRoomId", crid))
        .first();
      if (dup) throw new ConvexError("This room is already in your passport.");
      await ctx.db.patch(crid, { players: cr.players + 1 });
    }

    // Teammates: friends only, so nobody can be tagged by strangers.
    const teammateIds: Id<"users">[] = [];
    for (const id of new Set(args.teammateIds ?? [])) {
      if (id === me._id) continue;
      if (teammateIds.length >= MAX_TEAMMATES) break;
      if (await areFriends(ctx, me._id, id)) teammateIds.push(id);
    }

    const logId = await ctx.db.insert("playLogs", {
      userId: me._id,
      roomId,
      communityRoomId: roomId ? undefined : communityRoomId,
      companyId,
      playedOn: args.playedOn,
      escaped: args.escaped,
      escapeSeconds,
      hintsUsed: args.hintsUsed,
      teammateIds,
      status: "declared",
      counted: false,
      createdAt: Date.now(),
    });
    const log = (await ctx.db.get(logId))!;
    await askTeammates(ctx, me, log, teammateIds);
    return { logId };
  },
});

/**
 * Teammates with a confirmed entry for the same game get a vouch request.
 * The others get a nudge to add the room to their own passport.
 */
async function askTeammates(ctx: MutationCtx, me: Doc<"users">, log: Doc<"playLogs">, ids: Id<"users">[]) {
  const place = await placeOf(ctx, log);
  for (const id of ids) {
    if (await canVouch(ctx, id, log)) {
      const open = (await ctx.db.query("playVouches").withIndex("by_log", (q) => q.eq("logId", log._id)).collect()).find(
        (r) => r.voucherId === id
      );
      if (open) continue;
      await ctx.db.insert("playVouches", { logId: log._id, ownerId: me._id, voucherId: id, status: "open", createdAt: Date.now() });
      await tell(
        ctx,
        id,
        { title: "🤝 Παίξατε μαζί;", message: `Ο/Η ${me.name} λέει ότι παίξατε μαζί το «${place.title}» στις ${log.playedOn}. Επιβεβαίωσέ το στο passport σου.` },
        { title: "🤝 Did you play together?", message: `${me.name} says you played "${place.title}" together on ${log.playedOn}. Confirm it in your passport.` },
        { kind: "vouch", logId: log._id }
      );
    } else {
      await tell(
        ctx,
        id,
        { title: "🗝️ Πρόσθεσέ το στο passport σου", message: `Ο/Η ${me.name} πρόσθεσε το «${place.title}» που παίξατε μαζί. Πρόσθεσέ το κι εσύ.` },
        { title: "🗝️ Add it to your passport", message: `${me.name} added "${place.title}", which you played together. Add it to yours too.` },
        { kind: "plays_teammate", logId: log._id }
      );
    }
  }
}

/** Ask more friends to vouch, after adding the play. */
export const askVouch = mutation({
  args: { sessionToken: v.string(), logId: v.id("playLogs"), teammateIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    await rateLimit(ctx, `askVouch:${me._id}`, 20, HOUR);
    const log = await ctx.db.get(args.logId);
    if (!log || log.userId !== me._id) throw new ConvexError("Not found.");
    if (log.counted) return { asked: 0 };
    const add: Id<"users">[] = [];
    for (const id of new Set(args.teammateIds)) {
      if (id === me._id || log.teammateIds.includes(id)) continue;
      if (log.teammateIds.length + add.length >= MAX_TEAMMATES) break;
      if (await areFriends(ctx, me._id, id)) add.push(id);
    }
    if (add.length) await ctx.db.patch(log._id, { teammateIds: [...log.teammateIds, ...add] });
    await askTeammates(ctx, me, log, add);
    return { asked: add.length };
  },
});

/** Answer a vouch request. */
export const answerVouch = mutation({
  args: { sessionToken: v.string(), logId: v.id("playLogs"), accept: v.boolean() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    await rateLimit(ctx, `vouch:${me._id}`, 40, HOUR);
    const req = (await ctx.db.query("playVouches").withIndex("by_log", (q) => q.eq("logId", args.logId)).collect()).find(
      (r) => r.voucherId === me._id && r.status === "open"
    );
    if (!req) throw new ConvexError("This request is no longer open.");
    const log = await ctx.db.get(args.logId);
    if (!log) {
      await ctx.db.delete(req._id);
      throw new ConvexError("This request is no longer open.");
    }
    await ctx.db.patch(req._id, { status: args.accept ? "accepted" : "declined" });
    if (!args.accept) return { ok: true };
    if (!(await canVouch(ctx, me._id, log))) throw new ConvexError("You need your own stamp for this room, from the same day.");
    if (log.status === "verified" || log.status === "vouched") return { ok: true };
    await ctx.db.patch(log._id, { status: "vouched", method: "vouch", vouchedBy: me._id, reviewedAt: Date.now(), reviewNote: undefined });
    await setCounted(ctx, log, true);
    const place = await placeOf(ctx, log);
    await tell(
      ctx,
      log.userId,
      { title: "🤝 Επιβεβαιώθηκε!", message: `Ο/Η ${me.name} επιβεβαίωσε ότι παίξατε μαζί το «${place.title}». Μετράει πλέον στο passport σου.` },
      { title: "🤝 Vouched!", message: `${me.name} confirmed you played "${place.title}" together. It now counts in your passport.` },
      { kind: "plays", logId: log._id }
    );
    return { ok: true };
  },
});

/** Attach a photo or a receipt screenshot (uploaded with users.generateUploadUrl). */
export const attachProof = mutation({
  args: {
    sessionToken: v.string(),
    logId: v.id("playLogs"),
    storageId: v.id("_storage"),
    kind: v.union(v.literal("photo"), v.literal("receipt")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    await rateLimit(ctx, `playProof:${me._id}`, 30, HOUR);
    const log = await ctx.db.get(args.logId);
    if (!log || log.userId !== me._id) throw new ConvexError("Not found.");
    if (log.status === "verified" || log.status === "vouched") throw new ConvexError("This play is already verified.");
    await assertUpload(ctx, args.storageId, "image", MAX_PHOTO_BYTES);
    if (log.proofStorageId && log.proofStorageId !== args.storageId) await ctx.storage.delete(log.proofStorageId).catch(() => {});
    await ctx.db.patch(log._id, {
      status: "pending",
      proofKind: args.kind,
      proofStorageId: args.storageId,
      proofAt: Date.now(),
      photoTakenAt: undefined,
      photoLat: undefined,
      photoLng: undefined,
      proofCheck: undefined,
      reviewNote: undefined,
    });
    if (args.kind === "photo") await ctx.scheduler.runAfter(0, internal.plays.readProof, { logId: log._id });
    return { ok: true };
  },
});

/** Edit the result of a play that isn't verified yet. */
export const updatePlay = mutation({
  args: {
    sessionToken: v.string(),
    logId: v.id("playLogs"),
    playedOn: v.string(),
    escaped: v.boolean(),
    escapeMinutes: v.optional(v.number()),
    hintsUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const log = await ctx.db.get(args.logId);
    if (!log || log.userId !== me._id) throw new ConvexError("Not found.");
    if (log.counted) throw new ConvexError("A verified play can't be changed.");
    checkPlayedOn(args.playedOn);
    let escapeSeconds: number | undefined;
    if (args.escaped && args.escapeMinutes !== undefined) {
      if (!Number.isFinite(args.escapeMinutes) || args.escapeMinutes <= 0 || args.escapeMinutes > 300) {
        throw new ConvexError("Enter the escape time in minutes.");
      }
      escapeSeconds = Math.round(args.escapeMinutes * 60);
    }
    await ctx.db.patch(log._id, { playedOn: args.playedOn, escaped: args.escaped, escapeSeconds, hintsUsed: args.hintsUsed });
  },
});

export const removePlay = mutation({
  args: { sessionToken: v.string(), logId: v.id("playLogs") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const log = await ctx.db.get(args.logId);
    if (!log || log.userId !== me._id) throw new ConvexError("Not found.");
    await dropLog(ctx, log, { adjustTotals: true });
  },
});

/** Everything for the "Rooms played" tab: my plays, vouch requests, map pins. */
export const mine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return null;
    const logs = await ctx.db.query("playLogs").withIndex("by_user", (q) => q.eq("userId", me._id)).collect();
    logs.sort((a, b) => (a.playedOn < b.playedOn ? 1 : a.playedOn > b.playedOn ? -1 : b.createdAt - a.createdAt));
    const plays = await Promise.all(
      logs.map(async (l) => {
        const place = await placeOf(ctx, l);
        const voucher = l.vouchedBy ? await ctx.db.get(l.vouchedBy) : null;
        const cr = l.communityRoomId ? await ctx.db.get(l.communityRoomId) : null;
        return {
          _id: l._id,
          roomId: l.roomId ?? null,
          communityRoomId: l.communityRoomId ?? null,
          communityStatus: cr?.status ?? null,
          ...place,
          playedOn: l.playedOn,
          escaped: l.escaped,
          escapeSeconds: l.escapeSeconds ?? null,
          hintsUsed: l.hintsUsed ?? null,
          status: l.status,
          method: l.method ?? null,
          proofKind: l.proofKind ?? null,
          proofUrl: l.proofStorageId ? await ctx.storage.getUrl(l.proofStorageId) : null,
          hasEmailProof: !!l.proofText,
          reviewNote: l.reviewNote ?? null,
          vouchedByName: voucher?.name ?? null,
          teammates: l.teammateIds.length,
          counted: l.counted,
        };
      })
    );

    const reqs = await ctx.db
      .query("playVouches")
      .withIndex("by_voucher_status", (q) => q.eq("voucherId", me._id).eq("status", "open"))
      .take(30);
    const requests = (
      await Promise.all(
        reqs.map(async (r) => {
          const log = await ctx.db.get(r.logId);
          const owner = await ctx.db.get(r.ownerId);
          if (!log || !owner) return null;
          const place = await placeOf(ctx, log);
          return { logId: log._id, ownerName: owner.name, ownerAvatar: await avatarUrl(ctx, owner), title: place.title, company: place.company, playedOn: log.playedOn };
        })
      )
    ).filter((x): x is NonNullable<typeof x> => !!x);

    // Map: stamps + plays that have a position.
    const stamps = await ctx.db.query("stamps").withIndex("by_user", (q) => q.eq("userId", me._id)).collect();
    const pins: { id: string; title: string; company: string; lat: number; lng: number; level: string; roomId: string | null }[] = [];
    for (const s of stamps) {
      const room = await ctx.db.get(s.roomId);
      if (room?.latitude !== undefined && room.longitude !== undefined) {
        const company = await ctx.db.get(s.companyId);
        pins.push({ id: s._id, title: room.title, company: company?.name ?? "", lat: room.latitude, lng: room.longitude, level: "confirmed", roomId: room._id });
      }
    }
    for (const p of plays) {
      if (p.lat !== undefined && p.lng !== undefined && p.status !== "rejected") {
        pins.push({ id: p._id, title: p.title, company: p.company, lat: p.lat, lng: p.lng, level: p.status, roomId: p.roomId });
      }
    }

    return {
      plays,
      requests,
      pins,
      counted: plays.filter((p) => p.counted).length,
      stamps: stamps.length,
      // My personal Postmark address for booking emails (null = not set up).
      inboundEmail: await inboundAddressFor(me._id),
    };
  },
});

/** Public "claim your page" card for a community room. */
export const communityRoom = query({
  args: { id: v.id("communityRooms") },
  handler: async (ctx, args) => {
    const cr = await ctx.db.get(args.id);
    if (!cr || cr.status === "rejected") return null;
    return {
      name: cr.name,
      companyName: cr.companyName,
      city: cr.city,
      country: cr.country,
      players: cr.players,
      merged: cr.status === "merged",
      roomId: cr.mergedIntoRoomId ?? null,
    };
  },
});

// ─── Company ───────────────────────────────────────────────

async function reviewRow(ctx: Ctx, l: Doc<"playLogs">) {
  const [player, place] = await Promise.all([ctx.db.get(l.userId), placeOf(ctx, l)]);
  const company = l.companyId ? await ctx.db.get(l.companyId) : null;
  return {
    _id: l._id,
    playerName: player?.name ?? "",
    playerAvatar: await avatarUrl(ctx, player),
    playerPlayed: player?.played ?? 0,
    title: place.title,
    company: place.company || company?.name || "",
    city: place.city,
    communityRoomId: l.communityRoomId ?? null,
    playedOn: l.playedOn,
    escaped: l.escaped,
    escapeSeconds: l.escapeSeconds ?? null,
    hintsUsed: l.hintsUsed ?? null,
    teammates: l.teammateIds.length,
    status: l.status,
    proofKind: l.proofKind ?? null,
    proofUrl: l.proofStorageId ? await ctx.storage.getUrl(l.proofStorageId) : null,
    proofText: l.proofText ?? null,
    photoTakenAt: l.photoTakenAt ?? null,
    photoKm:
      l.photoLat !== undefined && l.photoLng !== undefined && place.lat !== undefined && place.lng !== undefined
        ? Math.round(distanceKm(l.photoLat, l.photoLng, place.lat, place.lng) * 10) / 10
        : null,
    proofCheck: l.proofCheck ?? null,
    proofAt: l.proofAt ?? null,
    reviewNote: l.reviewNote ?? null,
    reviewedAt: l.reviewedAt ?? null,
    createdAt: l.createdAt,
  };
}

/** Portal: plays of the company's rooms waiting for an answer, and the latest answered. */
export const companyQueue = query({
  args: { sessionToken: v.optional(v.string()), view: v.union(v.literal("pending"), v.literal("declared"), v.literal("done")) },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "plays:companyQueue");
    const statuses: Status[] = args.view === "done" ? ["verified", "rejected"] : [args.view];
    const rows: Doc<"playLogs">[] = [];
    for (const s of statuses) {
      rows.push(
        ...(await ctx.db
          .query("playLogs")
          .withIndex("by_company_status", (q) => q.eq("companyId", company._id).eq("status", s))
          .order("desc")
          .take(100))
      );
    }
    rows.sort((a, b) => (b.reviewedAt ?? b.proofAt ?? b.createdAt) - (a.reviewedAt ?? a.proofAt ?? a.createdAt));
    return Promise.all(rows.slice(0, 100).map((l) => reviewRow(ctx, l)));
  },
});

export const companyPendingCount = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "plays:companyPendingCount");
    return (
      await ctx.db
        .query("playLogs")
        .withIndex("by_company_status", (q) => q.eq("companyId", company._id).eq("status", "pending"))
        .take(100)
    ).length;
  },
});

/** Approve or reject one or more plays of the company's rooms. */
export const companyReview = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    logIds: v.array(v.id("playLogs")),
    approve: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "plays:companyReview");
    if (!companyIsPublic(company)) throw new ConvexError("Your company isn't approved yet.");
    await rateLimit(ctx, `playReview:${company._id}`, 300, HOUR);
    if (args.logIds.length > 50) throw new ConvexError("Up to 50 at a time.");
    const note = args.note ? clean(args.note, 300, "note") : undefined;
    let done = 0;
    for (const id of args.logIds) {
      const log = await ctx.db.get(id);
      if (!log || log.companyId !== company._id) continue;
      if (log.status !== "pending" && log.status !== "declared") continue;
      await review(ctx, log, args.approve, `company:${company._id}`, "company", note);
      done++;
    }
    return { done };
  },
});

// ─── Admin ─────────────────────────────────────────────────

/**
 * The team's queue: plays of community rooms, of companies that aren't live,
 * and plays a company left without an answer for a week.
 */
export const adminQueue = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const pending = await ctx.db.query("playLogs").withIndex("by_status", (q) => q.eq("status", "pending")).take(500);
    const now = Date.now();
    const out: Doc<"playLogs">[] = [];
    for (const l of pending) {
      if (!l.companyId) { out.push(l); continue; }
      const company = await ctx.db.get(l.companyId);
      if (!companyIsPublic(company) || now - (l.proofAt ?? l.createdAt) > STALE_FOR_ADMIN) out.push(l);
    }
    out.sort((a, b) => (a.proofAt ?? a.createdAt) - (b.proofAt ?? b.createdAt));
    return Promise.all(out.slice(0, 100).map((l) => reviewRow(ctx, l)));
  },
});

export const adminReview = mutation({
  args: { sessionToken: v.string(), logIds: v.array(v.id("playLogs")), approve: v.boolean(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAdminSession(ctx, args.sessionToken);
    if (args.logIds.length > 50) throw new ConvexError("Up to 50 at a time.");
    const note = args.note ? clean(args.note, 300, "note") : undefined;
    let done = 0;
    for (const id of args.logIds) {
      const log = await ctx.db.get(id);
      if (!log || (log.status !== "pending" && log.status !== "declared")) continue;
      await review(ctx, log, args.approve, `admin:${admin.email}`, "admin", note);
      done++;
    }
    return { done };
  },
});

/** Take back a verified or vouched play (fake proof found later). */
export const adminRevoke = mutation({
  args: { sessionToken: v.string(), logId: v.id("playLogs"), note: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminSession(ctx, args.sessionToken);
    const log = await ctx.db.get(args.logId);
    if (!log) throw new ConvexError("Not found.");
    await review(ctx, log, false, `admin:${admin.email}`, "admin", clean(args.note, 300, "note", 2));
  },
});

/** Community rooms by status, most-played first: the sales leads. */
export const adminCommunityRooms = query({
  args: {
    sessionToken: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("merged")),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const rows = await ctx.db.query("communityRooms").withIndex("by_status", (q) => q.eq("status", args.status)).take(500);
    rows.sort((a, b) => b.players - a.players || b.createdAt - a.createdAt);
    return Promise.all(
      rows.slice(0, 200).map(async (c) => ({
        _id: c._id,
        name: c.name,
        companyName: c.companyName,
        city: c.city,
        country: c.country,
        website: c.website ?? null,
        latitude: c.latitude ?? null,
        longitude: c.longitude ?? null,
        players: c.players,
        createdByName: (await ctx.db.get(c.createdBy))?.name ?? "",
        mergedIntoRoomId: c.mergedIntoRoomId ?? null,
        createdAt: c.createdAt,
      }))
    );
  },
});

/** Approve (fix the details), or reject a community room. Rejecting declines its pending plays too. */
export const adminSetCommunityRoom = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("communityRooms"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
    name: v.optional(v.string()),
    companyName: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminSession(ctx, args.sessionToken);
    const cr = await ctx.db.get(args.id);
    if (!cr || cr.status === "merged") throw new ConvexError("Not found.");
    const name = args.name !== undefined ? clean(args.name, 80, "room name", 2) : cr.name;
    const city = args.city !== undefined ? clean(args.city, 60, "city", 2) : cr.city;
    const key = `${norm(name)}|${norm(city)}`;
    if (key !== cr.key) {
      const other = await ctx.db.query("communityRooms").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (other && other._id !== cr._id) throw new ConvexError(`"${other.name}" in ${other.city} already exists. Merge them instead.`);
    }
    await ctx.db.patch(cr._id, {
      status: args.status,
      name,
      city,
      key,
      companyName: args.companyName !== undefined ? clean(args.companyName, 80, "company name") : cr.companyName,
      country: args.country !== undefined ? clean(args.country, 60, "country", 2) : cr.country,
      website: args.website !== undefined ? cleanExternalUrl(args.website) || undefined : cr.website,
      reviewedAt: Date.now(),
    });
    if (args.status === "rejected") {
      const logs = await ctx.db.query("playLogs").withIndex("by_community", (q) => q.eq("communityRoomId", cr._id)).collect();
      for (const l of logs) {
        if (l.status === "pending" || l.status === "declared") {
          await review(ctx, l, false, `admin:${admin.email}`, "admin", "this room couldn't be found");
        }
      }
    }
  },
});

/**
 * The company joined UNLOCKED (or the room was there all along): move every
 * play of the community room to the real room. A player who already has that
 * room keeps the entry that counts.
 */
export const adminMergeCommunityRoom = mutation({
  args: {
    sessionToken: v.string(),
    id: v.id("communityRooms"),
    into: v.union(v.object({ roomId: v.id("rooms") }), v.object({ communityRoomId: v.id("communityRooms") })),
  },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const cr = await ctx.db.get(args.id);
    if (!cr || cr.status === "merged") throw new ConvexError("Not found.");
    const logs = await ctx.db.query("playLogs").withIndex("by_community", (q) => q.eq("communityRoomId", cr._id)).collect();
    let moved = 0;

    if ("roomId" in args.into) {
      const roomId = args.into.roomId;
      const room = await ctx.db.get(roomId);
      if (!room) throw new ConvexError("Room not found.");
      for (const l of logs) {
        const stamp = await ctx.db.query("stamps").withIndex("by_user_room", (q) => q.eq("userId", l.userId).eq("roomId", roomId)).first();
        const other = await ctx.db.query("playLogs").withIndex("by_user_room", (q) => q.eq("userId", l.userId).eq("roomId", roomId)).first();
        if (stamp || (other && (other.counted || !l.counted))) {
          await dropLog(ctx, l, { adjustTotals: true });
          continue;
        }
        if (other) await dropLog(ctx, other, { adjustTotals: true });
        await ctx.db.patch(l._id, { roomId, communityRoomId: undefined, companyId: room.companyId });
        moved++;
        await tell(
          ctx,
          l.userId,
          { title: "🎉 Είναι πλέον στο UNLOCKED", message: `Το «${room.title}» που πρόσθεσες είναι πλέον στο UNLOCKED.` },
          { title: "🎉 Now on UNLOCKED", message: `"${room.title}", which you added, is now on UNLOCKED.` },
          { kind: "plays", logId: l._id, roomId }
        );
      }
      await ctx.db.patch(cr._id, { status: "merged", mergedIntoRoomId: roomId, players: 0, reviewedAt: Date.now() });
    } else {
      // Duplicate community rooms: keep `into`.
      const targetId = args.into.communityRoomId;
      const target = await ctx.db.get(targetId);
      if (!target || targetId === cr._id || target.status === "merged" || target.status === "rejected") throw new ConvexError("Room not found.");
      for (const l of logs) {
        const other = await ctx.db
          .query("playLogs")
          .withIndex("by_user_community", (q) => q.eq("userId", l.userId).eq("communityRoomId", targetId))
          .first();
        if (other && (other.counted || !l.counted)) {
          await dropLog(ctx, l, { adjustTotals: true });
          continue;
        }
        if (other) await dropLog(ctx, other, { adjustTotals: true });
        await ctx.db.patch(l._id, { communityRoomId: targetId });
        moved++;
      }
      const fresh = (await ctx.db.get(targetId))!;
      await ctx.db.patch(targetId, { players: fresh.players + moved });
      // Keep the old key pointing nowhere new: mark it rejected-as-duplicate.
      await ctx.db.patch(cr._id, { status: "rejected", players: 0, reviewedAt: Date.now() });
    }
    return { moved };
  },
});

// ─── Automatic checks ──────────────────────────────────────

export const proofInfo = internalQuery({
  args: { logId: v.id("playLogs") },
  handler: async (ctx, args) => {
    const l = await ctx.db.get(args.logId);
    return l?.proofStorageId ? { storageId: l.proofStorageId } : null;
  },
});

/** Reads the proof photo's EXIF date and GPS (right after attachProof). */
export const readProof = internalAction({
  args: { logId: v.id("playLogs") },
  handler: async (ctx, args) => {
    const info = await ctx.runQuery(internal.plays.proofInfo, { logId: args.logId });
    if (!info) return;
    const blob = await ctx.storage.get(info.storageId);
    if (!blob) return;
    // EXIF sits at the start of a JPEG.
    const exif = readExif(await blob.slice(0, 256 * 1024).arrayBuffer());
    await ctx.runMutation(internal.plays.saveProofCheck, {
      logId: args.logId,
      storageId: info.storageId,
      takenOn: exif.takenOn,
      lat: exif.lat,
      lng: exif.lng,
    });
  },
});

export const saveProofCheck = internalMutation({
  args: {
    logId: v.id("playLogs"),
    storageId: v.id("_storage"),
    takenOn: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log || log.proofStorageId !== args.storageId) return; // replaced meanwhile
    const place = await placeOf(ctx, log);
    const dateKnown = !!args.takenOn && DAY_RE.test(args.takenOn);
    const dateOk = dateKnown && dayGap(args.takenOn!, log.playedOn) <= 1;
    const gpsKnown = args.lat !== undefined && args.lng !== undefined && place.lat !== undefined && place.lng !== undefined;
    const gpsOk = gpsKnown && distanceKm(args.lat!, args.lng!, place.lat!, place.lng!) <= 2;
    const check = (dateKnown && !dateOk) || (gpsKnown && !gpsOk) ? "mismatch" : dateOk && gpsOk ? "match" : "unknown";
    await ctx.db.patch(log._id, {
      photoTakenAt: dateKnown ? args.takenOn : undefined,
      photoLat: args.lat,
      photoLng: args.lng,
      proofCheck: check,
    });
  },
});

/**
 * Daily: a photo whose date and GPS both match the room, left unanswered
 * for 14 days, is verified automatically.
 */
export const autoVerify = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - AUTO_VERIFY_AFTER;
    const pending = await ctx.db.query("playLogs").withIndex("by_status", (q) => q.eq("status", "pending")).take(1000);
    let n = 0;
    for (const l of pending) {
      if (l.proofKind === "photo" && l.proofCheck === "match" && (l.proofAt ?? l.createdAt) < cutoff) {
        await review(ctx, l, true, "auto", "auto");
        n++;
      }
    }
    return { verified: n };
  },
});

/**
 * A booking confirmation forwarded to Postmark (http.ts /inbound-email).
 * Matched to the player by their personal address (MailboxHash), else by the
 * sender's email, and to one of their unverified plays by the room's name in
 * the email. The text is attached as proof for the reviewer; it never
 * verifies anything by itself.
 */
export const ingestEmail = internalMutation({
  args: { from: v.string(), mailboxHash: v.optional(v.string()), subject: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    let user = args.mailboxHash ? await userFromMailboxHash(ctx, args.mailboxHash) : null;
    if (!user) {
      const raw = (/<([^>]+)>/.exec(args.from)?.[1] ?? args.from).trim();
      const addr = raw.toLowerCase();
      if (!addr.includes("@") || addr.length > 200) return { result: "no_sender" as const };
      user =
        (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", addr)).first()) ??
        (raw !== addr ? await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", raw)).first() : null);
    }
    if (!user) return { result: "no_user" as const };
    try {
      await rateLimit(ctx, `inboundEmail:${user._id}`, 20, DAY);
    } catch {
      return { result: "rate_limited" as const };
    }
    const body = norm(`${args.subject} ${args.text}`);
    const logs = (await ctx.db.query("playLogs").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()).filter(
      (l) => !l.counted
    );
    let best: { log: Doc<"playLogs">; title: string; len: number } | null = null;
    for (const l of logs) {
      const place = await placeOf(ctx, l);
      const n = norm(place.title);
      if (n.length >= 3 && body.includes(n) && (!best || n.length > best.len)) best = { log: l, title: place.title, len: n.length };
    }
    if (!best) {
      await tell(
        ctx,
        user._id,
        { title: "Δεν βρήκαμε το δωμάτιο", message: "Λάβαμε το email σου αλλά δεν ταιριάζει με κάποιο δωμάτιο του passport σου. Πρόσθεσε πρώτα το δωμάτιο και στείλ' το ξανά." },
        { title: "We couldn't match that email", message: "We got your email but it doesn't name a room in your passport. Add the room first, then forward it again." },
        { kind: "plays" }
      );
      return { result: "no_match" as const };
    }
    const text = `${args.subject}\n\n${args.text}`.slice(0, PROOF_TEXT_MAX);
    await ctx.db.patch(best.log._id, {
      status: "pending",
      proofText: text,
      proofKind: best.log.proofKind ?? "email",
      proofAt: Date.now(),
      reviewNote: undefined,
    });
    await tell(
      ctx,
      user._id,
      { title: "📧 Λάβαμε την απόδειξη", message: `Το email επισυνάφθηκε στο «${best.title}». Θα σε ειδοποιήσουμε όταν επαληθευτεί.` },
      { title: "📧 Proof received", message: `Your email was attached to "${best.title}". We'll let you know once it's verified.` },
      { kind: "plays", logId: best.log._id }
    );
    return { result: "attached" as const };
  },
});
