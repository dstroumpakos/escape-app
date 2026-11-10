import { query } from "./_generated/server";
import { v } from "convex/values";

// Helper: batch-enrich rooms with company partner info
// Loads all unique companies in ONE pass, then maps them
// Also filters out rooms from free-plan companies (not shown on public site)
async function batchEnrichRooms(ctx: any, rooms: any[]) {
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
    if (!room.companyId) return true; // non-company rooms always visible
    const company = companyMap.get(room.companyId as string);
    if (!company) return true;
    return company.platformPlan !== "free";
  });

  return visibleRooms.map((room) => {
    const company = room.companyId ? companyMap.get(room.companyId as string) : null;
    return {
      ...room,
      isEarlyAccessPartner: company ? !!company.subscriptionEnabled : false,
      companyName: company?.name ?? "",
    };
  });
}

// Helper: single room enrichment (for getById)
async function enrichRoom(ctx: any, room: any) {
  let isEarlyAccessPartner = false;
  let companyName = "";
  if (room.companyId) {
    const company = await ctx.db.get(room.companyId);
    if (company) {
      isEarlyAccessPartner = !!company.subscriptionEnabled;
      companyName = company.name;
    }
  }
  return { ...room, isEarlyAccessPartner, companyName };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rooms = await ctx.db.query("rooms").collect();
    const publicRooms = rooms.filter((r) => !r.photosOnly);
    return await batchEnrichRooms(ctx, publicRooms);
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
    // Get explicitly featured rooms
    const featured = (await ctx.db
      .query("rooms")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect()).filter((r) => !r.photosOnly);

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
