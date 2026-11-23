import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { sessionTokenV, requireCompany } from "./companySession";
import { assertUpload, MAX_IMAGE_BYTES, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES, storageUrl } from "./uploads";
import { checkLengths } from "./validation";
import { rateLimit, HOUR } from "./rateLimit";
import { freshMedia } from "./social";

/**
 * The photos on a company's public profile (companies/[id] on the site):
 *  - promo photos the company uploads here (companyPromoPhotos), and
 *  - team photos from the Photos tool (standalonePhotos) that the company
 *    chose to show, grouped by room.
 * Plus the company's logo. The rest of the profile (name, description...) is
 * companies.updateProfile.
 */

// No limit for the company in practice; only a safety cap so the profile stays light.
export const MAX_PROMO_PHOTOS = 500;
const MAX_PUBLIC_TEAM_PHOTOS = 200;
const MAX_PICKER_PHOTOS = 300;

export type TeamPhoto = {
  _id: Id<"standalonePhotos">;
  url: string;
  teamName: string;
  escaped: boolean | null;
  escapeTime: string;
  createdAt: number;
};

export type TeamPhotoGroup = { roomId: string; roomTitle: string; photos: TeamPhoto[] };

function teamPhoto(p: Doc<"standalonePhotos">): TeamPhoto {
  return {
    _id: p._id,
    url: p.processedUrl || p.originalUrl,
    teamName: p.teamName || "",
    escaped: p.escaped ?? null,
    escapeTime: p.escapeTime || "",
    createdAt: p.createdAt,
  };
}

/** Team photos grouped by room, newest first, rooms with the most photos first. */
async function groupByRoom(ctx: QueryCtx, photos: Doc<"standalonePhotos">[]) {
  const groups = new Map<string, { photos: Doc<"standalonePhotos">[] }>();
  for (const p of photos) {
    const key = p.roomId ? p.roomId.toString() : "";
    const g = groups.get(key) ?? { photos: [] };
    g.photos.push(p);
    groups.set(key, g);
  }
  const out = await Promise.all(
    [...groups.entries()].map(async ([roomId, g]) => {
      const room = roomId ? await ctx.db.get(roomId as Id<"rooms">) : null;
      return { roomId, roomTitle: room?.title || "", photos: g.photos.map(teamPhoto) };
    })
  );
  // Photos without a room go last
  return out.sort((a, b) => (a.roomId ? 0 : 1) - (b.roomId ? 0 : 1) || b.photos.length - a.photos.length);
}

async function promoPhotosOf(ctx: QueryCtx, companyId: Id<"companies">) {
  const rows = await ctx.db
    .query("companyPromoPhotos")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .take(MAX_PROMO_PHOTOS);
  return rows.map((r) => ({ _id: r._id, url: r.url, type: r.type ?? ("image" as const), createdAt: r.createdAt }));
}

const MAX_COMPANY_POSTS = 60;

/**
 * What the public profile shows (used by companyPages.profile): its promo
 * photos, its community posts, and the team photos it chose to show (each
 * with its room, so players can filter by room).
 */
export async function publicProfilePhotos(ctx: QueryCtx, companyId: Id<"companies">) {
  const [promo, team, posts] = await Promise.all([
    promoPhotosOf(ctx, companyId),
    ctx.db
      .query("standalonePhotos")
      .withIndex("by_company_profile", (q) => q.eq("companyId", companyId).eq("onProfile", true))
      .order("desc")
      .take(MAX_PUBLIC_TEAM_PHOTOS),
    ctx.db
      .query("posts")
      .withIndex("by_author_company", (q) => q.eq("authorCompanyId", companyId))
      .order("desc")
      .take(MAX_COMPANY_POSTS),
  ]);
  const groups = await groupByRoom(ctx, team);
  return {
    promoPhotos: promo.map(({ url, type, createdAt }) => ({ url, type, createdAt })),
    teamPhotos: groups.flatMap((g) =>
      g.photos.map(({ url, teamName, escaped, escapeTime, createdAt }) => ({
        url, teamName, escaped, escapeTime, createdAt, roomTitle: g.roomTitle,
      }))
    ).sort((a, b) => b.createdAt - a.createdAt),
    posts: await Promise.all(
      posts.map(async (p) => {
        const [media, comments, room] = await Promise.all([
          freshMedia(ctx, p),
          ctx.db.query("postComments").withIndex("by_post", (q) => q.eq("postId", p._id)).take(1000),
          p.roomId ? ctx.db.get(p.roomId) : null,
        ]);
        return {
          _id: p._id,
          text: p.text,
          media,
          likes: p.likes,
          commentCount: comments.length,
          createdAt: p.createdAt,
          roomId: p.roomId ?? null,
          roomTitle: room?.title ?? "",
        };
      })
    ),
  };
}

// ─── Company portal ───

/** Everything the portal's Profile page needs about photos. */
export const forPortal = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyProfile:forPortal");
    const [promo, team] = await Promise.all([
      promoPhotosOf(ctx, company._id),
      ctx.db
        .query("standalonePhotos")
        .withIndex("by_company_created", (q) => q.eq("companyId", company._id))
        .order("desc")
        .take(MAX_PICKER_PHOTOS),
    ]);
    // Every room of the company gets a section (even without photos yet, so a
    // new room shows up ready for uploads). Photos-only rooms from the old
    // Photos tool only when they have photos.
    const rooms = await ctx.db
      .query("rooms")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .take(200);
    const byRoom = new Map<string, Doc<"standalonePhotos">[]>();
    for (const p of team) {
      const key = p.roomId ? p.roomId.toString() : "";
      byRoom.set(key, [...(byRoom.get(key) ?? []), p]);
    }
    const groups = [
      ...rooms.filter((r) => !r.photosOnly),
      ...rooms.filter((r) => r.photosOnly && byRoom.has(r._id.toString())),
    ].map((r) => ({ roomId: r._id.toString(), roomTitle: r.title, photos: (byRoom.get(r._id.toString()) ?? []).map(teamPhoto) }));
    const known = new Set(groups.map((g) => g.roomId));
    const rest = team.filter((p) => !p.roomId || !known.has(p.roomId.toString()));
    if (rest.length) groups.push({ roomId: "", roomTitle: "", photos: rest.map(teamPhoto) });
    const shown = new Set(team.filter((p) => p.onProfile).map((p) => p._id.toString()));
    return {
      name: company.name,
      city: company.city || "",
      logo: company.logo || "",
      cover: company.cover || "",
      promo,
      team: groups.map((g) => ({
        ...g,
        photos: g.photos.map((p) => ({ ...p, onProfile: shown.has(p._id.toString()) })),
      })),
    };
  },
});

export const setLogo = mutation({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV, storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyProfile:setLogo");
    if (!args.storageId) {
      await ctx.db.patch(company._id, { logo: "" });
      return;
    }
    await assertUpload(ctx, args.storageId, "image", MAX_IMAGE_BYTES);
    await ctx.db.patch(company._id, { logo: await storageUrl(ctx, args.storageId) });
  },
});

export const setCover = mutation({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV, storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyProfile:setCover");
    if (!args.storageId) {
      await ctx.db.patch(company._id, { cover: undefined });
      return;
    }
    await assertUpload(ctx, args.storageId, "image", MAX_IMAGE_BYTES);
    await ctx.db.patch(company._id, { cover: await storageUrl(ctx, args.storageId) });
  },
});

export const addPromo = mutation({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV, storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyProfile:addPromo");
    // A photo (up to 10 MB) or a video (up to 100 MB), told apart by the stored file's type
    const meta = await ctx.db.system.get(args.storageId);
    const type = meta?.contentType?.startsWith("video/") ? "video" : "image";
    await assertUpload(ctx, args.storageId, type, type === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
    const existing = await ctx.db
      .query("companyPromoPhotos")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .take(MAX_PROMO_PHOTOS);
    if (existing.length >= MAX_PROMO_PHOTOS) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError(`You can have up to ${MAX_PROMO_PHOTOS} photos`);
    }
    await rateLimit(ctx, `promoPhoto:${company._id}`, 60, HOUR);
    await ctx.db.insert("companyPromoPhotos", {
      companyId: company._id,
      storageId: args.storageId,
      url: await storageUrl(ctx, args.storageId),
      type,
      createdAt: Date.now(),
    });
  },
});

export const removePromo = mutation({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV, photoId: v.id("companyPromoPhotos") },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyProfile:removePromo");
    const row = await ctx.db.get(args.photoId);
    if (!row || row.companyId !== company._id) throw new ConvexError("Photo not found");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  },
});

/**
 * A team photo uploaded from the portal's Profile page into one of the
 * company's rooms. It shows on the profile straight away (the company uploads
 * it for that); the page reminds them the team should agree.
 */
export const addTeamPhoto = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    roomId: v.id("rooms"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyProfile:addTeamPhoto");
    const room = await ctx.db.get(args.roomId);
    if (!room || room.companyId !== company._id) throw new ConvexError("Room not found");
    await assertUpload(ctx, args.storageId, "image", MAX_PHOTO_BYTES);
    await ctx.db.insert("standalonePhotos", {
      companyId: company._id,
      roomId: room._id,
      originalStorageId: args.storageId,
      originalUrl: await storageUrl(ctx, args.storageId),
      status: "ready",
      emailsSent: 0,
      hostedPageViews: 0,
      downloads: 0,
      createdAt: Date.now(),
      onProfile: true,
    });
  },
});

export const setTeamName = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    photoId: v.id("standalonePhotos"),
    teamName: v.string(),
  },
  handler: async (ctx, args) => {
    checkLengths([["Team name", args.teamName, 100]]);
    const company = await requireCompany(ctx, args, "companyProfile:setTeamName");
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.companyId !== company._id) throw new ConvexError("Photo not found");
    await ctx.db.patch(photo._id, { teamName: args.teamName.trim() || undefined });
  },
});

/** Show or hide one of the company's team photos on its public profile. */
export const setTeamPhotoOnProfile = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    photoId: v.id("standalonePhotos"),
    onProfile: v.boolean(),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "companyProfile:setTeamPhotoOnProfile");
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.companyId !== company._id) throw new ConvexError("Photo not found");
    await ctx.db.patch(photo._id, { onProfile: args.onProfile || undefined });
  },
});
