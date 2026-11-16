import { ConvexError, v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireCompany, requireRoomOf } from "./companySession";
import { companyIsPublic } from "./companyRules";
import { athensBusinessDays, slotClosedReason } from "./slotRules";
import { rateLimit, HOUR } from "./rateLimit";
import { nt } from "./notificationTexts";

/**
 * Last-minute offers. A company puts a discount (5-50%) on a free slot of
 * today or tomorrow. Players who book that slot on UNLOCKED (web or app) pay
 * less; the company's own widget keeps the normal price. Players who have the
 * room in their wishlist get a notification.
 *
 * The discount is always worked out here on the server (offerPercentFor),
 * never taken from the client.
 */

export const MIN_PERCENT = 5;
export const MAX_PERCENT = 50;
const NOTIFY_BATCH = 300;

type Ctx = QueryCtx | MutationCtx;

/** Total after the discount, rounded to cents. */
export function applyOffer(total: number, percent: number): number {
  if (!percent) return total;
  return Math.round(total * (100 - percent)) / 100;
}

function bookable(room: Doc<"rooms"> | null): room is Doc<"rooms"> {
  return !!room && room.isActive !== false && !(room as any).photosOnly;
}

/**
 * The room's times on a date that a player can still book right now
 * (same rules as the booking page and the widget).
 */
async function freeTimes(ctx: Ctx, room: Doc<"rooms">, date: string, nowMs: number): Promise<string[]> {
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (room.operatingDays && !room.operatingDays.includes(dow)) return [];
  const custom = await ctx.db
    .query("timeSlots")
    .withIndex("by_room_date", (q) => q.eq("roomId", room._id).eq("date", date))
    .collect();
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_room_date", (q) => q.eq("roomId", room._id).eq("date", date))
    .collect();
  const booked = new Set(bookings.filter((b) => b.status !== "cancelled").map((b) => b.time));
  const times =
    custom.length > 0
      ? custom.filter((s) => s.available).map((s) => s.time)
      : (room.defaultTimeSlots || []).map((s) => s.time);
  const all = new Set<string>([...custom.map((s) => s.time), ...times, ...booked]);
  return times.filter((t) => !booked.has(t) && slotClosedReason(date, t, all, booked, nowMs) === null);
}

/** The discount (0 = none) a booking of this slot made on UNLOCKED gets. */
export async function offerPercentFor(
  ctx: Ctx,
  roomId: Id<"rooms">,
  date: string,
  time: string,
  nowMs: number = Date.now()
): Promise<number> {
  const [today, tomorrow] = athensBusinessDays(nowMs);
  if (date !== today && date !== tomorrow) return 0;
  const offer = await ctx.db
    .query("slotOffers")
    .withIndex("by_room_date", (q) => q.eq("roomId", roomId).eq("date", date))
    .filter((q) => q.eq(q.field("time"), time))
    .first();
  return offer ? offer.percent : 0;
}

// ─── Company ───────────────────────────────────────────────

/** Free slots of today and tomorrow for every bookable room, with their offers. */
export const companyBoard = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "slotOffers:companyBoard");
    const now = Date.now();
    const days = athensBusinessDays(now);
    const rooms = (
      await ctx.db
        .query("rooms")
        .withIndex("by_company", (q) => q.eq("companyId", company._id))
        .collect()
    ).filter(bookable);

    const out = [];
    for (const room of rooms) {
      const perDay: Record<string, { time: string; percent: number; offerId?: Id<"slotOffers"> }[]> = {};
      for (const date of days) {
        const offers = await ctx.db
          .query("slotOffers")
          .withIndex("by_room_date", (q) => q.eq("roomId", room._id).eq("date", date))
          .collect();
        const free = await freeTimes(ctx, room, date, now);
        perDay[date] = free.map((time) => {
          const o = offers.find((x) => x.time === time);
          return { time, percent: o?.percent ?? 0, offerId: o?._id };
        });
      }
      out.push({ _id: room._id, title: room.title, image: room.image, price: room.price, days: perDay });
    }
    return { days, rooms: out };
  },
});

export const set = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("rooms"),
    date: v.string(),
    time: v.string(),
    percent: v.number(),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "slotOffers:set");
    const room = await requireRoomOf(ctx, company, args.roomId);
    if (!bookable(room)) throw new ConvexError("This room isn't taking bookings.");
    if (!Number.isInteger(args.percent) || args.percent < MIN_PERCENT || args.percent > MAX_PERCENT) {
      throw new ConvexError(`The discount must be between ${MIN_PERCENT}% and ${MAX_PERCENT}%.`);
    }
    const now = Date.now();
    const [today, tomorrow] = athensBusinessDays(now);
    if (args.date !== today && args.date !== tomorrow) {
      throw new ConvexError("Last-minute offers are only for today and tomorrow.");
    }
    if (!(await freeTimes(ctx, room, args.date, now)).includes(args.time)) {
      throw new ConvexError("This time slot is no longer available");
    }
    await rateLimit(ctx, `slotOffer:${company._id}`, 60, HOUR);

    const existing = await ctx.db
      .query("slotOffers")
      .withIndex("by_room_date", (q) => q.eq("roomId", room._id).eq("date", args.date))
      .filter((q) => q.eq(q.field("time"), args.time))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { percent: args.percent });
      return existing._id;
    }
    const id = await ctx.db.insert("slotOffers", {
      companyId: company._id,
      roomId: room._id,
      date: args.date,
      time: args.time,
      percent: args.percent,
      createdAt: now,
    });
    // Tell players who saved this room, at most once per room per day.
    const dayKey = `slotOfferNotify:${room._id}:${args.date}`;
    const already = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", dayKey))
      .first();
    if (!already) {
      await ctx.db.insert("rateLimits", { key: dayKey, count: 1, windowStart: now });
      await ctx.scheduler.runAfter(0, internal.slotOffers.notifyWishlist, { offerId: id });
    }
    return id;
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), offerId: v.id("slotOffers") },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "slotOffers:remove");
    const offer = await ctx.db.get(args.offerId);
    if (!offer) return;
    if (offer.companyId !== company._id) throw new ConvexError("Access denied");
    await ctx.db.delete(offer._id);
  },
});

/** Sends the offer to players with the room in their wishlist, a batch at a time. */
export const notifyWishlist = internalMutation({
  args: { offerId: v.id("slotOffers"), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const offer = await ctx.db.get(args.offerId);
    if (!offer) return;
    const room = await ctx.db.get(offer.roomId);
    if (!bookable(room)) return;
    const company = room.companyId ? await ctx.db.get(room.companyId) : null;
    if (!companyIsPublic(company)) return;
    const [today] = athensBusinessDays();
    const page = await ctx.db
      .query("users")
      .paginate({ numItems: NOTIFY_BATCH, cursor: args.cursor ?? null });
    for (const user of page.page) {
      if (!user.wishlist?.includes(room._id)) continue;
      const lang = (user as any).language;
      await ctx.db.insert("notifications", {
        userId: user._id,
        type: "promo",
        title: nt(lang, "offer.title", { percent: String(offer.percent), room: room.title }),
        message: nt(lang, "offer.message", {
          day: nt(lang, offer.date === today ? "offer.today" : "offer.tomorrow"),
          time: offer.time,
        }),
        read: false,
        createdAt: Date.now(),
        data: { kind: "offer", roomId: room._id, date: offer.date, time: offer.time, percent: offer.percent },
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.slotOffers.notifyWishlist, {
        offerId: args.offerId,
        cursor: page.continueCursor,
      });
    }
  },
});

/** Deletes offers of past days (cron). */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const [today] = athensBusinessDays();
    const old = await ctx.db
      .query("slotOffers")
      .withIndex("by_date", (q) => q.lt("date", today))
      .take(500);
    for (const o of old) await ctx.db.delete(o._id);
  },
});

// ─── Players ───────────────────────────────────────────────

/** Offers on a room's date that can still be booked: [{ time, percent }]. */
export const forRoomDate = query({
  args: { roomId: v.id("rooms"), date: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const [today, tomorrow] = athensBusinessDays(now);
    if (args.date !== today && args.date !== tomorrow) return [];
    const room = await ctx.db.get(args.roomId);
    if (!bookable(room)) return [];
    const company = room.companyId ? await ctx.db.get(room.companyId) : null;
    if (!companyIsPublic(company)) return [];
    const offers = await ctx.db
      .query("slotOffers")
      .withIndex("by_room_date", (q) => q.eq("roomId", args.roomId).eq("date", args.date))
      .collect();
    if (offers.length === 0) return [];
    const free = new Set(await freeTimes(ctx, room, args.date, now));
    return offers.filter((o) => free.has(o.time)).map((o) => ({ time: o.time, percent: o.percent }));
  },
});

/** Every offer of today and tomorrow that can still be booked, best discount first. */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const days = athensBusinessDays(now);
    const result = [];
    const roomCache = new Map<string, Doc<"rooms"> | null>();
    const companyCache = new Map<string, Doc<"companies"> | null>();
    const freeCache = new Map<string, Set<string>>();
    for (const date of days) {
      const offers = await ctx.db
        .query("slotOffers")
        .withIndex("by_date", (q) => q.eq("date", date))
        .take(300);
      for (const o of offers) {
        if (!roomCache.has(o.roomId)) roomCache.set(o.roomId, await ctx.db.get(o.roomId));
        const room = roomCache.get(o.roomId)!;
        if (!bookable(room) || !room.companyId) continue;
        if (!companyCache.has(room.companyId)) companyCache.set(room.companyId, await ctx.db.get(room.companyId));
        const company = companyCache.get(room.companyId)!;
        if (!companyIsPublic(company)) continue;
        const key = `${o.roomId}:${date}`;
        if (!freeCache.has(key)) freeCache.set(key, new Set(await freeTimes(ctx, room, date, now)));
        if (!freeCache.get(key)!.has(o.time)) continue;
        result.push({
          roomId: room._id,
          title: room.title,
          image: room.image,
          location: room.location,
          rating: room.rating,
          players: room.players,
          duration: room.duration,
          price: room.price,
          companyName: company!.name,
          date,
          time: o.time,
          percent: o.percent,
        });
      }
    }
    result.sort((a, b) => b.percent - a.percent || a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    return result.slice(0, 100);
  },
});
