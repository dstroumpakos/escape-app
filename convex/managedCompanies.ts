import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAdminSession } from "./adminSession";
import { checkRoomInput } from "./companyRules";
import { cleanExternalUrl } from "./externalLinks";
import { cleanInstagramUsername, removePosts } from "./instagram";
import { categoryFields, categoryOf, subthemesOf } from "./roomCategories";

/**
 * Companies the UNLOCKED team adds itself, to promote an escape room that
 * said yes but doesn't want its own company portal yet.
 *
 * - The company and its rooms are public: rooms show in Discover, the map and
 *   search, and the company shows in the Companies section with its rooms.
 * - Its profile does not open (companyPages.profile returns null), and nobody
 *   can log in to it (no email, no password; loginCompany refuses it).
 * - The admin can set its Instagram: the posts show on its room pages like a
 *   portal company's (instagram.ts, same daily sync).
 * - When the escape room signs up for real, the admin assigns the company to
 *   that account: the rooms move over, empty profile fields are filled in,
 *   and the admin-made company is deleted. From then on the profile opens.
 */

const text = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max);

async function managedCompany(ctx: MutationCtx, id: Id<"companies">): Promise<Doc<"companies">> {
  const c = await ctx.db.get(id);
  if (!c || !c.managedByAdmin) throw new ConvexError("Not an admin-managed company");
  return c;
}

/** Admin: the managed companies with their rooms, and the real accounts they can be assigned to. */
export const adminList = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const all = await ctx.db.query("companies").collect();
    const managed = await Promise.all(
      all
        .filter((c) => c.managedByAdmin)
        .map(async (c) => {
          const rooms = await ctx.db
            .query("rooms")
            .withIndex("by_company", (q) => q.eq("companyId", c._id))
            .collect();
          return {
            _id: c._id,
            name: c.name,
            city: c.city,
            address: c.address,
            phone: c.phone,
            logo: c.logo,
            cover: c.cover ?? "",
            description: c.description,
            website: c.website ?? "",
            instagram: c.instagramUsername ?? "",
            instagramSyncedAt: c.instagramSyncedAt ?? null,
            instagramError: c.instagramSyncError ?? "",
            createdAt: c.createdAt,
            rooms: rooms.map((r) => ({
              _id: r._id,
              title: r.title,
              image: r.image,
              category: categoryOf(r),
              subthemes: subthemesOf(r),
              location: r.location,
              latitude: r.latitude ?? null,
              longitude: r.longitude ?? null,
              duration: r.duration,
              difficulty: r.difficulty,
              playersMin: r.playersMin,
              playersMax: r.playersMax,
              description: r.description,
              bookingUrl: r.bookingUrl ?? "",
              escapeAll: r.externalRating?.source === "EscapeAll" && r.externalRating.url
                ? { url: r.externalRating.url, rating: r.externalRating.rating, count: r.externalRating.count, updatedAt: r.externalRating.updatedAt }
                : null,
              isActive: r.isActive !== false,
            })),
          };
        })
    );
    const accounts = all
      .filter((c) => !c.managedByAdmin)
      .map((c) => ({ _id: c._id, name: c.name, email: c.email, city: c.city, onboardingStatus: c.onboardingStatus ?? "approved" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { managed: managed.sort((a, b) => b.createdAt - a.createdAt), accounts };
  },
});

const companyFields = {
  name: v.string(),
  city: v.string(),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  logo: v.optional(v.string()),
  cover: v.optional(v.string()),
  description: v.optional(v.string()),
  website: v.optional(v.string()),
  // Instagram username: its posts show on the company's room pages (instagram.ts). "" removes it.
  instagram: v.optional(v.string()),
};

/** Admin: add a company (no companyId) or edit one the admin manages. */
export const adminSaveCompany = mutation({
  args: { sessionToken: v.string(), companyId: v.optional(v.id("companies")), ...companyFields },
  handler: async (ctx, { sessionToken, companyId, instagram, ...f }) => {
    await requireAdminSession(ctx, sessionToken);
    // undefined = leave as it is (older admin page); "" = remove
    const cleanedIg = cleanInstagramUsername(instagram);
    const igUsername = cleanedIg === undefined ? undefined : cleanedIg || undefined;
    const name = text(f.name, 120);
    if (!name) throw new ConvexError("Give the company a name");
    const fields = {
      name,
      city: text(f.city, 80),
      address: text(f.address, 200),
      phone: text(f.phone, 40),
      logo: text(f.logo, 1000),
      cover: text(f.cover, 1000) || undefined,
      description: text(f.description, 3000),
      website: cleanExternalUrl(f.website) || undefined,
    };
    if (companyId) {
      const before = await managedCompany(ctx, companyId);
      await ctx.db.patch(companyId, fields);
      if (cleanedIg !== undefined && igUsername !== before.instagramUsername) {
        await ctx.db.patch(companyId, {
          instagramUsername: igUsername,
          instagramEnabled: !!igUsername,
          instagramSyncedAt: undefined,
          instagramSyncError: undefined,
        });
        await removePosts(ctx, companyId, new Set());
        if (igUsername) await ctx.scheduler.runAfter(0, internal.instagram.refreshCompany, { companyId });
      }
      return companyId;
    }
    const newId = await ctx.db.insert("companies", {
      ...fields,
      ...(igUsername ? { instagramUsername: igUsername, instagramEnabled: true } : {}),
      managedByAdmin: true,
      // Nobody logs in to it: no email, and "" is never a valid password hash
      email: "",
      password: "",
      verified: true,
      onboardingStatus: "approved",
      // Public like a paying company, but never billed (only "payg" is invoiced)
      platformPlan: "unlimited",
      createdAt: Date.now(),
    });
    if (igUsername) await ctx.scheduler.runAfter(0, internal.instagram.refreshCompany, { companyId: newId });
    return newId;
  },
});

/** Admin: delete a managed company and its rooms. */
export const adminDeleteCompany = mutation({
  args: { sessionToken: v.string(), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    await managedCompany(ctx, args.companyId);
    const rooms = await ctx.db.query("rooms").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).collect();
    for (const r of rooms) await ctx.db.delete(r._id);
    await removePosts(ctx, args.companyId, new Set());
    await ctx.db.delete(args.companyId);
  },
});

/** Admin: add (no roomId) or edit a room of a managed company. Booking goes to their own site. */
export const adminSaveRoom = mutation({
  args: {
    sessionToken: v.string(),
    companyId: v.id("companies"),
    roomId: v.optional(v.id("rooms")),
    title: v.string(),
    location: v.string(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    image: v.string(),
    category: v.union(v.literal("puzzle"), v.literal("puzzle_actor"), v.literal("horror")),
    subthemes: v.array(v.string()),
    description: v.string(),
    duration: v.number(),
    difficulty: v.number(),
    playersMin: v.number(),
    playersMax: v.number(),
    bookingUrl: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { sessionToken, companyId, roomId, ...f }) => {
    await requireAdminSession(ctx, sessionToken);
    await managedCompany(ctx, companyId);
    const fields = {
      title: text(f.title, 120),
      location: text(f.location, 200),
      latitude: f.latitude,
      longitude: f.longitude,
      image: text(f.image, 1000),
      description: text(f.description, 5000),
      duration: f.duration,
      difficulty: f.difficulty,
      maxDifficulty: 5,
      playersMin: f.playersMin,
      playersMax: f.playersMax,
      players: `${f.playersMin}-${f.playersMax}`,
      bookingUrl: cleanExternalUrl(f.bookingUrl) || undefined,
      isActive: f.isActive ?? true,
      ...categoryFields({ category: f.category, subthemes: f.subthemes })!,
    };
    checkRoomInput(fields);
    if (!fields.image) throw new ConvexError("Add a photo of the room");
    if (roomId) {
      const room = await ctx.db.get(roomId);
      if (!room || room.companyId !== companyId) throw new ConvexError("Room not found");
      await ctx.db.patch(roomId, fields);
      return roomId;
    }
    return await ctx.db.insert("rooms", {
      ...fields,
      companyId,
      price: 0,
      tags: [],
      story: "",
      paymentTerms: ["pay_on_arrival"],
      bookingMode: "external_primary",
      rating: 0,
      reviews: 0,
      isNew: true,
      isFeatured: false,
      isTrending: false,
    });
  },
});

/** Admin: delete a room of a managed company. */
export const adminDeleteRoom = mutation({
  args: { sessionToken: v.string(), roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const room = await ctx.db.get(args.roomId);
    if (!room?.companyId) throw new ConvexError("Room not found");
    await managedCompany(ctx, room.companyId);
    await ctx.db.delete(args.roomId);
  },
});

/**
 * Admin: hand a managed company to the escape room's real account (it signed
 * up the normal way). Its rooms, their view/click stats and its followers move
 * to that account; profile fields the account left empty are filled in; then
 * the admin-made company is deleted.
 */
export const adminAssign = mutation({
  args: { sessionToken: v.string(), managedId: v.id("companies"), targetId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const from = await managedCompany(ctx, args.managedId);
    const to = await ctx.db.get(args.targetId);
    if (!to || to.managedByAdmin) throw new ConvexError("Pick the company's own account");

    const rooms = await ctx.db.query("rooms").withIndex("by_company", (q) => q.eq("companyId", from._id)).collect();
    for (const r of rooms) await ctx.db.patch(r._id, { companyId: to._id });

    for (const table of ["roomViews", "bookClicks"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_company_date", (q) => q.eq("companyId", from._id))
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { companyId: to._id });
    }

    const follows = await ctx.db.query("companyFollows").withIndex("by_company", (q) => q.eq("companyId", from._id)).collect();
    for (const f of follows) {
      const already = await ctx.db
        .query("companyFollows")
        .withIndex("by_user_company", (q) => q.eq("userId", f.userId).eq("companyId", to._id))
        .first();
      if (already) await ctx.db.delete(f._id);
      else await ctx.db.patch(f._id, { companyId: to._id });
    }

    // Keep what the company wrote itself; fill only what it left empty
    const fill: Partial<Doc<"companies">> = {};
    for (const k of ["logo", "cover", "description", "website", "city", "address", "phone"] as const) {
      if (!to[k] && from[k]) (fill as any)[k] = from[k];
    }
    if (Object.keys(fill).length) await ctx.db.patch(to._id, fill);

    // Instagram: the account keeps its own if it set one; otherwise it takes ours, posts included
    if (!to.instagramUsername && from.instagramUsername) {
      await ctx.db.patch(to._id, {
        instagramUsername: from.instagramUsername,
        instagramEnabled: from.instagramEnabled,
        instagramSyncedAt: from.instagramSyncedAt,
        instagramSyncError: from.instagramSyncError,
      });
      const posts = await ctx.db.query("instagramPosts").withIndex("by_company", (q) => q.eq("companyId", from._id)).collect();
      for (const p of posts) await ctx.db.patch(p._id, { companyId: to._id });
    } else {
      await removePosts(ctx, from._id, new Set());
    }

    await ctx.db.delete(from._id);
    return { rooms: rooms.length, approved: to.onboardingStatus === undefined || to.onboardingStatus === "approved" };
  },
});
