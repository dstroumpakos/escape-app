import { query, internalMutation } from "./_generated/server";
import { bookingTargetFor, cleanExternalUrl } from "./externalLinks";
import { v } from "convex/values";
import { companyIsPublic } from "./companyRules";

// Helper: batch-enrich rooms with company partner info
// Loads all unique companies in ONE pass, then maps them
// Also filters out rooms from free-plan companies (not shown on public site)
export async function batchEnrichRooms(ctx: any, rooms: any[]) {
  // Collect unique companyIds
  const companyIds = Array.from(new Set(rooms.map((r) => r.companyId).filter(Boolean)));

  // Single batch load
  const companies = await Promise.all(companyIds.map((id) => ctx.db.get(id)));
  const companyMap = new Map<string, any>();
  for (let i = 0; i < companyIds.length; i++) {
    if (companies[i]) companyMap.set(companyIds[i] as string, companies[i]);
  }

  // Filter out rooms from free-plan companies
  const visibleRooms = rooms.filter((room) => {
    // Switched off in the portal (Rooms → Inactive): hidden from every public list.
    if (room.isActive === false) return false;
    if (!room.companyId) return true; // non-company rooms always visible
    const company = companyMap.get(room.companyId as string);
    if (!company) return true;
    // Not approved yet, or declined: hidden from the public site (companyRules.ts).
    if (!companyIsPublic(company)) return false;
    return company.platformPlan !== "free";
  });

  return visibleRooms.map((room) => {
    const company = room.companyId ? companyMap.get(room.companyId as string) : null;
    return {
      ...room,
      isEarlyAccessPartner: company ? !!company.subscriptionEnabled : false,
      companyName: company?.name ?? "",
      // False for a company the UNLOCKED team added (managedCompanies.ts): no profile to link to
      companyHasProfile: company ? !company.managedByAdmin : false,
      bookingTarget: bookingTargetFor(room, company ?? null),
    };
  });
}

// Helper: single room enrichment (for getById)
async function enrichRoom(ctx: any, room: any) {
  let isEarlyAccessPartner = false;
  let companyName = "";
  let company: any = null;
  if (room.companyId) {
    company = await ctx.db.get(room.companyId);
    if (company) {
      isEarlyAccessPartner = !!company.subscriptionEnabled;
      companyName = company.name;
    }
  }
  // Where "Book now" sends players (the escape room's own site, see externalLinks.ts)
  const bookingTarget = bookingTargetFor(room, company);
  const companyHasProfile = company ? !company.managedByAdmin : false;
  return { ...room, isEarlyAccessPartner, companyName, companyHasProfile, bookingTarget };
}

/**
 * Every room players may see in a public list: not photos-only, not switched
 * off (Inactive), from an approved company that is not on the free plan.
 * The website's Discover (rooms.list) and the app's Discover
 * (premium.getVisibleRooms) both start from this, so they show the same rooms.
 */
export async function listPublicRooms(ctx: any) {
  const rooms = await ctx.db.query("rooms").collect();
  return await batchEnrichRooms(ctx, rooms.filter((r: any) => !r.photosOnly));
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await listPublicRooms(ctx);
  },
});

export const getById = query({
  args: { id: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.id);
    if (!room) return null;
    return await enrichRoom(ctx, room);
  },
});

export const featured = query({
  args: {},
  handler: async (ctx) => {
    // Paid promotions first (admin > Promo, promo.ts), the ones that end soonest last
    const now = Date.now();
    const promoted = (await ctx.db
      .query("rooms")
      .withIndex("by_promoUntil", (q) => q.gt("promoUntil", now))
      .collect())
      .filter((r) => !r.photosOnly)
      .sort((a, b) => (a.promoSince ?? 0) - (b.promoSince ?? 0));
    const promotedIds = new Set(promoted.map((r) => r._id.toString()));

    // Then explicitly featured rooms
    const featured = [
      ...promoted,
      ...(await ctx.db
        .query("rooms")
        .withIndex("by_featured", (q) => q.eq("isFeatured", true))
        .collect()).filter((r) => !r.photosOnly && !promotedIds.has(r._id.toString())),
    ];

    // Also include EA partner rooms (Featured Spotlight benefit)
    // Load all companies at once to check subscriptionEnabled
    const featuredIds = new Set(featured.map((r) => r._id.toString()));
    const allRooms = await ctx.db.query("rooms").collect();

    // Collect companyIds from non-featured active rooms to check subscription
    const candidateRooms = allRooms.filter(
      (r) => !featuredIds.has(r._id.toString()) && r.companyId && r.isActive !== false && !r.photosOnly
    );
    const companyIds = Array.from(new Set(candidateRooms.map((r) => r.companyId).filter(Boolean)));
    const companies = await Promise.all(companyIds.map((id) => ctx.db.get(id!)));
    const subscribedCompanies = new Set(
      companies.filter((c) => c?.subscriptionEnabled && c?.platformPlan !== "free").map((c) => c!._id.toString())
    );

    for (const room of candidateRooms) {
      if (subscribedCompanies.has(room.companyId!.toString())) {
        featured.push(room);
      }
    }

    return await batchEnrichRooms(ctx, featured);
  },
});

export const trending = query({
  args: {},
  handler: async (ctx) => {
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_trending", (q) => q.eq("isTrending", true))
      .collect();
    return await batchEnrichRooms(ctx, rooms.filter((r) => !r.photosOnly));
  },
});

export const byTheme = query({
  args: { theme: v.string() },
  handler: async (ctx, args) => {
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_theme", (q) => q.eq("theme", args.theme))
      .collect();
    return await batchEnrichRooms(ctx, rooms.filter((r) => !r.photosOnly));
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("rooms").collect();
    const q = args.query.toLowerCase();
    const filtered = all.filter(
      (r) =>
        !r.photosOnly &&
        (r.title.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.theme.toLowerCase().includes(q))
    );
    return await batchEnrichRooms(ctx, filtered);
  },
});

// Team-only (CLI / dashboard, needs the deploy key): switch rooms on or off,
// e.g. to hide test and demo rooms. Same as the portal's Active/Inactive toggle.
// npx convex run --prod rooms:setActiveInternal '{"roomIds":["..."],"isActive":false}'
export const setActiveInternal = internalMutation({
  args: { roomIds: v.array(v.id("rooms")), isActive: v.boolean() },
  handler: async (ctx, { roomIds, isActive }) => {
    const changed: string[] = [];
    for (const id of roomIds) {
      const room = await ctx.db.get(id);
      if (!room) continue;
      await ctx.db.patch(id, { isActive });
      changed.push(room.title);
    }
    return changed;
  },
});

// Team-only: the rating a room has on another site, shown with its source
// ("4.9 from 1,061 reviews on EscapeAll"). Companies can't set this themselves.
// npx convex run --prod rooms:setExternalRatingInternal '{"roomId":"...","source":"EscapeAll","rating":4.9,"count":1061,"url":"https://..."}'
// Pass "clear": true to remove it.
export const setExternalRatingInternal = internalMutation({
  args: {
    roomId: v.id("rooms"),
    source: v.optional(v.string()),
    rating: v.optional(v.number()),
    count: v.optional(v.number()),
    url: v.optional(v.string()),
    clear: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");
    if (args.clear) {
      await ctx.db.patch(args.roomId, { externalRating: undefined });
      return `${room.title}: cleared`;
    }
    const source = (args.source ?? "").trim();
    const { rating, count } = args;
    if (!source || source.length > 40) throw new Error("source is required (max 40 chars)");
    if (rating === undefined || !(rating >= 0 && rating <= 5)) throw new Error("rating must be 0-5");
    if (count === undefined || !Number.isInteger(count) || count < 0) throw new Error("count must be a whole number");
    const url = cleanExternalUrl(args.url) || undefined;
    await ctx.db.patch(args.roomId, {
      externalRating: { source, rating, count, url, updatedAt: Date.now() },
    });
    return `${room.title}: ${rating} from ${count} reviews on ${source}`;
  },
});
