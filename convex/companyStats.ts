import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { optionalUser } from "./userSession";
import type { Id } from "./_generated/dataModel";
import { underCap } from "./rateLimit";
import { requireCompany, sessionTokenV } from "./companySession";
import { companyIsPublic } from "./companyRules";

/**
 * What UNLOCKED did for a company (its portal dashboard): how many players
 * saw its rooms, how many went to its site ("Book now", externalLinks.ts),
 * followers, stamps and reviews. Views and clicks are counted per room per
 * day, so the tables stay small.
 */

const DAY = 24 * 60 * 60 * 1000;

export function athensDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(ms));
}

const VISITOR_RE = /^[a-z0-9]{16,40}$/;

/**
 * Who is counting: the logged-in player, else the random id the site/app
 * keeps on the device. Null = don't count (no id, or a malformed one).
 */
export async function visitorKey(ctx: MutationCtx, sessionToken?: string, visitorId?: string): Promise<string | null> {
  const user = sessionToken ? await optionalUser(ctx, sessionToken) : null;
  if (user) return `u:${user._id}`;
  if (visitorId && VISITOR_RE.test(visitorId)) return `v:${visitorId}`;
  return null;
}

/** True the first time this visitor does this for this room today (and remembers it). */
export async function firstToday(ctx: MutationCtx, roomId: Id<"rooms">, kind: "view" | "click", key: string, date: string) {
  const seen = await ctx.db
    .query("visitorMarks")
    .withIndex("by_mark", (q) => q.eq("roomId", roomId).eq("kind", kind).eq("key", key).eq("date", date))
    .first();
  if (seen) return false;
  await ctx.db.insert("visitorMarks", { roomId, kind, key, date });
  return true;
}

/** Cron: forget who visited, two days later (batches of 500). */
export const pruneVisitorMarks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = athensDate(Date.now() - 2 * DAY);
    const old = await ctx.db.query("visitorMarks").withIndex("by_date", (q) => q.lt("date", cutoff)).take(500);
    for (const r of old) await ctx.db.delete(r._id);
    if (old.length === 500) await ctx.scheduler.runAfter(0, internal.companyStats.pruneVisitorMarks, {});
  },
});

/** Counts a room page view: once per visitor per room per day, capped per hour so it can't be inflated. */
export const trackRoomView = mutation({
  args: { roomId: v.id("rooms"), sessionToken: v.optional(v.string()), visitorId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room?.companyId || room.isActive === false) return;
    const company = await ctx.db.get(room.companyId);
    if (!companyIsPublic(company)) return;
    const key = await visitorKey(ctx, args.sessionToken, args.visitorId);
    if (!key) return;
    const date = athensDate(Date.now());
    if (!(await firstToday(ctx, room._id, "view", key, date))) return;
    if (!(await underCap(ctx, `roomView:${room._id}`, 300))) return;
    const row = await ctx.db
      .query("roomViews")
      .withIndex("by_room_date", (q) => q.eq("roomId", room._id).eq("date", date))
      .first();
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
    else await ctx.db.insert("roomViews", { roomId: room._id, companyId: room.companyId, date, count: 1 });
  },
});

/** The company's numbers for the last 30 days (and all-time followers and rating). */
export const overview = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyStats:overview");
    const now = Date.now();
    const sinceMs = now - 30 * DAY;
    const since = athensDate(sinceMs);
    const prevSince = athensDate(now - 60 * DAY);

    const [views, clicks, followers, sessions, rooms] = await Promise.all([
      ctx.db.query("roomViews").withIndex("by_company_date", (q) => q.eq("companyId", company._id).gte("date", prevSince)).collect(),
      ctx.db.query("bookClicks").withIndex("by_company_date", (q) => q.eq("companyId", company._id).gte("date", prevSince)).collect(),
      ctx.db.query("companyFollows").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect(),
      ctx.db.query("stampSessions").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect(),
      ctx.db.query("rooms").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect(),
    ]);

    // This period vs the 30 days before it
    const sum = (rows: { date: string; count: number }[], from: string, to?: string) =>
      rows.filter((r) => r.date >= from && (!to || r.date < to)).reduce((n, r) => n + r.count, 0);

    // Day by day (last 30 days, oldest first)
    const days: { date: string; views: number; clicks: number }[] = [];
    for (let i = 29; i >= 0; i--) days.push({ date: athensDate(now - i * DAY), views: 0, clicks: 0 });
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const r of views) { const d = byDate.get(r.date); if (d) d.views += r.count; }
    for (const r of clicks) { const d = byDate.get(r.date); if (d) d.clicks += r.count; }

    // Per room
    const perRoom = new Map<Id<"rooms">, { views: number; clicks: number; stamps: number }>();
    const slot = (id: Id<"rooms">) => {
      let s = perRoom.get(id);
      if (!s) { s = { views: 0, clicks: 0, stamps: 0 }; perRoom.set(id, s); }
      return s;
    };
    for (const r of views) if (r.date >= since) slot(r.roomId).views += r.count;
    for (const r of clicks) if (r.date >= since) slot(r.roomId).clicks += r.count;
    const recentSessions = sessions.filter((s) => s.createdAt >= sinceMs);
    for (const s of recentSessions) slot(s.roomId).stamps += s.claimed;

    // Reviews (all time) and the ones from the last 30 days
    let reviewCount = 0, ratingSum = 0, newReviews = 0;
    for (const room of rooms) {
      const rs = await ctx.db.query("reviews").withIndex("by_room", (q) => q.eq("roomId", room._id)).collect();
      reviewCount += rs.length;
      ratingSum += rs.reduce((n, r) => n + r.rating, 0);
      newReviews += rs.filter((r) => r.createdAt >= sinceMs).length;
    }

    const titles = new Map(rooms.map((r) => [r._id, r.title]));
    const roomRows = rooms
      .map((r) => ({ roomId: r._id, title: r.title, ...(perRoom.get(r._id) ?? { views: 0, clicks: 0, stamps: 0 }) }))
      .concat(
        [...perRoom.entries()]
          .filter(([id]) => !titles.has(id))
          .map(([roomId, s]) => ({ roomId, title: "", ...s }))
      )
      .sort((a, b) => b.views - a.views || b.clicks - a.clicks);

    return {
      views: sum(views, since),
      viewsBefore: sum(views, prevSince, since),
      clicks: sum(clicks, since),
      clicksBefore: sum(clicks, prevSince, since),
      followers: followers.length,
      newFollowers: followers.filter((f) => f.createdAt >= sinceMs).length,
      stamps: recentSessions.reduce((n, s) => n + s.claimed, 0),
      reviews: reviewCount,
      newReviews,
      rating: reviewCount ? Math.round((ratingSum / reviewCount) * 10) / 10 : 0,
      days,
      rooms: roomRows,
      hasWebsite: !!company.website,
    };
  },
});
