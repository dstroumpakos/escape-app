import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { underCap } from "./rateLimit";
import { requireCompany, sessionTokenV } from "./companySession";
import { companyIsPublic } from "./companyRules";

/**
 * "Book now" sends players to the escape room's own site (UNLOCKED's own
 * booking is switched off for players, see src/lib/features.ts).
 *
 * Companies give a website (Settings) and, optionally, a booking link per
 * room. Both are checked here so nothing but a normal web address gets in
 * (no javascript: or data: links, which would run on our site).
 */

const MAX_URL = 500;

/** A clean https/http address, or "" to clear. Throws on anything else. */
export function cleanExternalUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (s === "") return "";
  if (s.length > MAX_URL) throw new ConvexError("That web address is too long.");
  if (!s.includes("://")) s = "https://" + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new ConvexError("Enter a valid web address, like https://example.com");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new ConvexError("Enter a valid web address, like https://example.com");
  }
  if (!u.hostname.includes(".") || u.username || u.password) {
    throw new ConvexError("Enter a valid web address, like https://example.com");
  }
  return u.toString();
}

/**
 * A room trailer: only YouTube or Vimeo, stored as a plain watch link
 * (the site builds the embed from it). "" clears. Throws on anything else.
 */
export function cleanVideoUrl(raw: string | undefined): string | undefined {
  const s = cleanExternalUrl(raw);
  if (!s) return s;
  const u = new URL(s);
  const host = u.hostname.replace(/^(www\.|m\.)/, "");
  const parts = u.pathname.split("/").filter(Boolean);
  let yt: string | null = null;
  if (host === "youtu.be") yt = parts[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") yt = u.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0])) yt = parts[1] ?? null;
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) return `https://www.youtube.com/watch?v=${yt}`;
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((p) => /^\d{5,12}$/.test(p));
    if (id) return `https://vimeo.com/${id}`;
  }
  throw new ConvexError("Use a YouTube or Vimeo link for the trailer");
}

export type BookingTarget = { kind: "url"; url: string } | { kind: "phone"; phone: string } | null;

/** Where "Book now" goes: the room's own link, else the company site, else a call. */
export function bookingTargetFor(
  room: Pick<Doc<"rooms">, "bookingUrl">,
  company: Pick<Doc<"companies">, "website" | "phone"> | null
): BookingTarget {
  if (room.bookingUrl) return { kind: "url", url: room.bookingUrl };
  if (company?.website) return { kind: "url", url: company.website };
  const phone = (company?.phone ?? "").trim();
  if (phone) return { kind: "phone", phone };
  return null;
}

function athensDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(ms));
}

/** Counts a "Book now" click (for the company's stats). Capped so it can't be inflated. */
export const trackBookClick = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room?.companyId) return;
    const company = await ctx.db.get(room.companyId);
    if (!companyIsPublic(company)) return;
    if (!(await underCap(ctx, `bookClick:${room._id}`, 300))) return;
    const date = athensDate(Date.now());
    const row = await ctx.db
      .query("bookClicks")
      .withIndex("by_room_date", (q) => q.eq("roomId", room._id).eq("date", date))
      .first();
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
    else await ctx.db.insert("bookClicks", { roomId: room._id, companyId: room.companyId, date, count: 1 });
  },
});

/** Clicks to the company's site in the last 30 days, per room. */
export const companyClicks = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "externalLinks:companyClicks");
    const since = athensDate(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await ctx.db
      .query("bookClicks")
      .withIndex("by_company_date", (q) => q.eq("companyId", company._id).gte("date", since))
      .collect();
    const perRoom = new Map<Id<"rooms">, number>();
    for (const r of rows) perRoom.set(r.roomId, (perRoom.get(r.roomId) ?? 0) + r.count);
    const rooms = [];
    for (const [roomId, clicks] of perRoom) {
      const room = await ctx.db.get(roomId);
      rooms.push({ roomId, title: room?.title ?? "", clicks });
    }
    rooms.sort((a, b) => b.clicks - a.clicks);
    return { total: rows.reduce((n, r) => n + r.count, 0), rooms, hasWebsite: !!company.website };
  },
});
