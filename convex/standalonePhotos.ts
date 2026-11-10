import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

// ════════════════════════════════════════════════════════════════
// Standalone Photos — photos.unlocked.gr workflow
// ════════════════════════════════════════════════════════════════

// ── Create a new standalone photo ──
export const create = mutation({
  args: {
    companyId: v.id("companies"),
    roomId: v.optional(v.id("rooms")),
    originalStorageId: v.id("_storage"),
    originalUrl: v.string(),
    teamName: v.optional(v.string()),
    escaped: v.optional(v.boolean()),
    escapeTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify company exists
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    return await ctx.db.insert("standalonePhotos", {
      companyId: args.companyId,
      roomId: args.roomId,
      originalStorageId: args.originalStorageId,
      originalUrl: args.originalUrl,
      teamName: args.teamName,
      escaped: args.escaped,
      escapeTime: args.escapeTime,
      status: "draft",
      emailsSent: 0,
      hostedPageViews: 0,
      downloads: 0,
      createdAt: Date.now(),
    });
  },
});

// ── Save the processed (branded/filtered) version ──
export const saveProcessed = mutation({
  args: {
    photoId: v.id("standalonePhotos"),
    companyId: v.id("companies"),
    processedStorageId: v.id("_storage"),
    processedUrl: v.string(),
    filter: v.optional(v.string()),
    adjustments: v.optional(v.object({
      brightness: v.optional(v.number()),
      contrast: v.optional(v.number()),
      saturation: v.optional(v.number()),
      temperature: v.optional(v.number()),
      sharpness: v.optional(v.number()),
      vignette: v.optional(v.number()),
      grain: v.optional(v.number()),
    })),
    hasWatermark: v.optional(v.boolean()),
    hasFrame: v.optional(v.boolean()),
    textOverlay: v.optional(v.string()),
    sticker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.companyId.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized");
    }

    // Delete old processed file if exists
    if (photo.processedStorageId) {
      await ctx.storage.delete(photo.processedStorageId);
    }

    await ctx.db.patch(args.photoId, {
      processedStorageId: args.processedStorageId,
      processedUrl: args.processedUrl,
      filter: args.filter,
      adjustments: args.adjustments,
      hasWatermark: args.hasWatermark,
      hasFrame: args.hasFrame,
      textOverlay: args.textOverlay,
      sticker: args.sticker,
      status: "ready",
    });
  },
});

// ── Update photo metadata ──
export const updateMeta = mutation({
  args: {
    photoId: v.id("standalonePhotos"),
    companyId: v.id("companies"),
    roomId: v.optional(v.id("rooms")),
    teamName: v.optional(v.string()),
    escaped: v.optional(v.boolean()),
    escapeTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.companyId.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.photoId, {
      roomId: args.roomId,
      teamName: args.teamName,
      escaped: args.escaped,
      escapeTime: args.escapeTime,
    });
  },
});

// ── Delete a standalone photo ──
export const deletePhoto = mutation({
  args: {
    photoId: v.id("standalonePhotos"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.companyId.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized");
    }
    await ctx.storage.delete(photo.originalStorageId);
    if (photo.processedStorageId) {
      await ctx.storage.delete(photo.processedStorageId);
    }
    // Delete associated email records
    const emails = await ctx.db
      .query("photoEmails")
      .withIndex("by_photo", (q) => q.eq("photoId", args.photoId))
      .collect();
    for (const email of emails) {
      await ctx.db.delete(email._id);
    }
    await ctx.db.delete(args.photoId);
  },
});

// ── List photos for a company (paginated recent-first) ──
export const listByCompany = query({
  args: {
    companyId: v.id("companies"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const photos = await ctx.db
      .query("standalonePhotos")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .take(args.limit ?? 50);

    // Enrich with room info
    const enriched = await Promise.all(
      photos.map(async (photo) => {
        let room = null;
        if (photo.roomId) {
          room = await ctx.db.get(photo.roomId);
        }
        return {
          ...photo,
          room: room ? { title: room.title, image: room.image } : null,
        };
      })
    );
    return enriched;
  },
});

// ── Get a single photo by ID (company view) ──
export const getById = query({
  args: { photoId: v.id("standalonePhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;

    let room = null;
    if (photo.roomId) room = await ctx.db.get(photo.roomId);

    const company = await ctx.db.get(photo.companyId);

    return {
      ...photo,
      room: room ? { title: room.title, image: room.image } : null,
      company: company ? { name: company.name, logo: company.logo } : null,
    };
  },
});

// ── Public: Get photo for hosted page (no auth needed) ──
export const getPublicPhoto = query({
  args: { photoId: v.id("standalonePhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return null;

    let room = null;
    if (photo.roomId) room = await ctx.db.get(photo.roomId);

    const company = await ctx.db.get(photo.companyId);

    return {
      _id: photo._id,
      processedUrl: photo.processedUrl || photo.originalUrl,
      teamName: photo.teamName,
      escaped: photo.escaped,
      escapeTime: photo.escapeTime,
      createdAt: photo.createdAt,
      room: room ? { title: room.title } : null,
      company: company ? { name: company.name, logo: company.logo } : null,
    };
  },
});

// ── Track hosted page view ──
export const trackView = mutation({
  args: { photoId: v.id("standalonePhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return;
    await ctx.db.patch(args.photoId, {
      hostedPageViews: (photo.hostedPageViews || 0) + 1,
    });
  },
});

// ── Track download ──
export const trackDownload = mutation({
  args: { photoId: v.id("standalonePhotos") },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo) return;
    await ctx.db.patch(args.photoId, {
      downloads: (photo.downloads || 0) + 1,
    });
  },
});

// ── Record sent email ──
export const recordEmail = mutation({
  args: {
    photoId: v.id("standalonePhotos"),
    companyId: v.id("companies"),
    recipientEmail: v.string(),
    resendMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("photoEmails", {
      photoId: args.photoId,
      companyId: args.companyId,
      recipientEmail: args.recipientEmail,
      resendMessageId: args.resendMessageId,
      status: "sent",
      sentAt: Date.now(),
    });

    // Increment emailsSent counter
    const photo = await ctx.db.get(args.photoId);
    if (photo) {
      await ctx.db.patch(args.photoId, {
        emailsSent: (photo.emailsSent || 0) + 1,
        status: "sent",
      });
    }
  },
});

// ── Get emails for a photo ──
export const getEmailsByPhoto = query({
  args: { photoId: v.id("standalonePhotos") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("photoEmails")
      .withIndex("by_photo", (q) => q.eq("photoId", args.photoId))
      .order("desc")
      .collect();
  },
});

// ── Company stats (for dashboard) ──
export const getStats = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const allPhotos = await ctx.db
      .query("standalonePhotos")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const totalPhotos = allPhotos.length;
    const totalEmails = allPhotos.reduce((s, p) => s + (p.emailsSent || 0), 0);
    const totalViews = allPhotos.reduce((s, p) => s + (p.hostedPageViews || 0), 0);
    const totalDownloads = allPhotos.reduce((s, p) => s + (p.downloads || 0), 0);

    // Today's count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayPhotos = allPhotos.filter((p) => p.createdAt >= todayStart.getTime()).length;

    return { totalPhotos, totalEmails, totalViews, totalDownloads, todayPhotos };
  },
});

// ── Action: send photo to multiple emails ──
export const sendPhotoToEmails = action({
  args: {
    photoId: v.id("standalonePhotos"),
    companyId: v.id("companies"),
    emails: v.array(v.string()),
    photoPageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch photo + company + room data
    const photo = await ctx.runQuery(api.standalonePhotos.getById, {
      photoId: args.photoId,
    });
    if (!photo || photo.companyId.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized");
    }

    const photoUrl = photo.processedUrl || photo.originalUrl;
    const companyName = photo.company?.name || "Escape Room";
    const roomTitle = photo.room?.title;

    for (const email of args.emails) {
      // 1. Send via Resend
      const result = await ctx.runAction(internal.email.sendPhotoEmail, {
        recipientEmail: email,
        photoUrl,
        photoPageUrl: args.photoPageUrl,
        companyName,
        roomTitle,
        teamName: photo.teamName,
        escaped: photo.escaped,
        escapeTime: photo.escapeTime,
      });

      // 2. Record in DB
      await ctx.runMutation(api.standalonePhotos.recordEmail, {
        photoId: args.photoId,
        companyId: args.companyId,
        recipientEmail: email,
        resendMessageId: (result as any)?.messageId || undefined,
      });
    }

    return { sent: args.emails.length };
  },
});

// ════════════════════════════════════════════════════════════════
// Simple Room Management (for photos.unlocked.gr)
// ════════════════════════════════════════════════════════════════

// ── Create a simple room (photos app only needs name) ──
export const createSimpleRoom = mutation({
  args: {
    companyId: v.id("companies"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");

    return await ctx.db.insert("rooms", {
      companyId: args.companyId,
      title: args.title,
      location: company.city || "",
      image: "",
      rating: 0,
      reviews: 0,
      duration: 60,
      difficulty: 5,
      maxDifficulty: 10,
      players: "2-6",
      playersMin: 2,
      playersMax: 6,
      price: 0,
      theme: "mystery",
      tags: [],
      description: "",
      story: "",
      isActive: true,
      photosOnly: true,
    });
  },
});

// ── Delete a room (photos app) ──
export const deleteSimpleRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.companyId?.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized");
    }
    await ctx.db.delete(args.roomId);

    // Delete associated preset
    const preset = await ctx.db
      .query("roomPhotoPresets")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();
    if (preset) await ctx.db.delete(preset._id);
  },
});

// ── List photos by room ──
export const listByRoom = query({
  args: {
    roomId: v.id("rooms"),
    companyId: v.id("companies"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const photos = await ctx.db
      .query("standalonePhotos")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(args.limit ?? 50);

    // Filter by company + enrich with room info
    const room = await ctx.db.get(args.roomId);
    return photos
      .filter((p) => p.companyId.toString() === args.companyId.toString())
      .map((p) => ({
        ...p,
        room: room ? { title: room.title, image: room.image } : null,
      }));
  },
});

// ── Stats per room ──
export const getStatsByRoom = query({
  args: {
    roomId: v.id("rooms"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const allPhotos = await ctx.db
      .query("standalonePhotos")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const photos = allPhotos.filter(
      (p) => p.companyId.toString() === args.companyId.toString()
    );

    const totalPhotos = photos.length;
    const totalEmails = photos.reduce((s, p) => s + (p.emailsSent || 0), 0);
    const totalViews = photos.reduce((s, p) => s + (p.hostedPageViews || 0), 0);
    const totalDownloads = photos.reduce((s, p) => s + (p.downloads || 0), 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayPhotos = photos.filter((p) => p.createdAt >= todayStart.getTime()).length;

    return { totalPhotos, totalEmails, totalViews, totalDownloads, todayPhotos };
  },
});

// ════════════════════════════════════════════════════════════════
// Per-Room Photo Presets
// ════════════════════════════════════════════════════════════════

export const getRoomPreset = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roomPhotoPresets")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();
  },
});

export const saveRoomPreset = mutation({
  args: {
    roomId: v.id("rooms"),
    companyId: v.id("companies"),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    logoPosition: v.optional(v.union(
      v.literal("top-left"),
      v.literal("top-right"),
      v.literal("bottom-left"),
      v.literal("bottom-right"),
      v.literal("bottom-center")
    )),
    brandColor: v.optional(v.string()),
    watermarkOpacity: v.optional(v.number()),
    textTemplate: v.optional(v.string()),
    overlayUrl: v.optional(v.string()),
    overlayStorageId: v.optional(v.id("_storage")),
    useOverlay: v.optional(v.boolean()),
    defaultFilter: v.optional(v.string()),
    logoScale: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.companyId?.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized");
    }

    const existing = await ctx.db
      .query("roomPhotoPresets")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .first();

    const data = {
      roomId: args.roomId,
      companyId: args.companyId,
      logoUrl: args.logoUrl,
      logoStorageId: args.logoStorageId,
      logoPosition: args.logoPosition,
      logoScale: args.logoScale,
      brandColor: args.brandColor,
      watermarkOpacity: args.watermarkOpacity,
      textTemplate: args.textTemplate,
      overlayUrl: args.overlayUrl,
      overlayStorageId: args.overlayStorageId,
      useOverlay: args.useOverlay,
      defaultFilter: args.defaultFilter,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("roomPhotoPresets", data);
  },
});
