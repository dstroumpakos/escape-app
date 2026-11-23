import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, optionalUser } from "./userSession";
import { rateLimit, HOUR } from "./rateLimit";
import { companyIsPublic } from "./companyRules";
import { batchEnrichRooms } from "./rooms";
import { publicProfilePhotos } from "./companyProfile";
import { findSession } from "./companySession";

/**
 * "Companies" section for players: every public escape room company with its
 * rooms, a company profile for logged-in players, and following a company.
 *
 * Only approved companies (companyRules.ts) that have at least one public room
 * are listed. Nothing private is returned: no email, plan, payments or
 * onboarding details.
 */

const MAX_COMPANIES = 300;

/** Approved companies (legacy rows without a status count as approved). */
async function publicCompanies(ctx: QueryCtx): Promise<Doc<"companies">[]> {
  const [approved, legacy] = await Promise.all([
    ctx.db
      .query("companies")
      .withIndex("by_onboardingStatus", (q) => q.eq("onboardingStatus", "approved"))
      .take(MAX_COMPANIES),
    ctx.db
      .query("companies")
      .withIndex("by_onboardingStatus", (q) => q.eq("onboardingStatus", undefined))
      .take(MAX_COMPANIES),
  ]);
  return [...approved, ...legacy].filter((c) => companyIsPublic(c) && c.platformPlan !== "free");
}

/** The company's rooms that players can see (same rules as every public room list). */
async function visibleRoomsOf(ctx: QueryCtx, companyId: Id<"companies">) {
  const rooms = await ctx.db
    .query("rooms")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .take(100);
  return await batchEnrichRooms(ctx, rooms.filter((r) => !r.photosOnly));
}

function publicCompany(c: Doc<"companies">) {
  return {
    _id: c._id,
    name: c.name,
    logo: c.logo || "",
    city: c.city || "",
    description: c.description || "",
  };
}

/** The Companies section: each public company with a preview of its rooms. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const companies = await publicCompanies(ctx);
    const rows = await Promise.all(
      companies.map(async (c) => {
        const rooms = await visibleRoomsOf(ctx, c._id);
        if (rooms.length === 0) return null;
        return {
          ...publicCompany(c),
          roomCount: rooms.length,
          rooms: rooms.slice(0, 6).map((r: any) => ({
            _id: r._id,
            title: r.title,
            image: r.image,
            theme: r.theme,
            difficulty: r.difficulty,
            maxDifficulty: r.maxDifficulty,
          })),
        };
      })
    );
    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.roomCount - a.roomCount || a.name.localeCompare(b.name));
  },
});

/** A company's profile, for logged-in players. Null when logged out or not public. */
export const profile = query({
  args: {
    companyId: v.id("companies"),
    sessionToken: v.optional(v.string()),
    // The company looking at its own profile (portal "See your profile"),
    // without a player login.
    companySessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    let isOwner = false;
    if (args.companySessionToken) {
      const session = await findSession(ctx, args.companySessionToken);
      isOwner = !!session && session.companyId === args.companyId;
    }
    if (!me && !isOwner) return null;
    const c = await ctx.db.get(args.companyId);
    if (!c) return null;
    // Players see approved, paying companies; the company always sees its own.
    if (!isOwner && (!companyIsPublic(c) || c.platformPlan === "free")) return null;
    const [rooms, followers, mine, photos] = await Promise.all([
      visibleRoomsOf(ctx, c._id),
      ctx.db.query("companyFollows").withIndex("by_company", (q) => q.eq("companyId", c._id)).take(10000),
      me
        ? ctx.db
            .query("companyFollows")
            .withIndex("by_user_company", (q) => q.eq("userId", me._id).eq("companyId", c._id))
            .first()
        : null,
      publicProfilePhotos(ctx, c._id),
    ]);
    return {
      ...publicCompany(c),
      ...photos,
      address: c.address || "",
      website: c.website || "",
      cover: c.cover || "",
      instagramUsername: c.instagramEnabled ? c.instagramUsername || "" : "",
      rooms,
      followers: followers.length,
      following: !!mine,
      isOwner,
      // Only a logged-in player can follow
      canFollow: !!me,
    };
  },
});

export const follow = mutation({
  args: { sessionToken: v.string(), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const c = await ctx.db.get(args.companyId);
    if (!c || !companyIsPublic(c)) throw new ConvexError("Company not found");
    const existing = await ctx.db
      .query("companyFollows")
      .withIndex("by_user_company", (q) => q.eq("userId", me._id).eq("companyId", c._id))
      .first();
    if (existing) return;
    await rateLimit(ctx, `companyFollow:${me._id}`, 60, HOUR);
    await ctx.db.insert("companyFollows", { userId: me._id, companyId: c._id, createdAt: Date.now() });
  },
});

export const unfollow = mutation({
  args: { sessionToken: v.string(), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("companyFollows")
      .withIndex("by_user_company", (q) => q.eq("userId", me._id).eq("companyId", args.companyId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
