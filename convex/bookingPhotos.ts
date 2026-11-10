import { query, mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { nt } from "./notificationTexts";

// ════════════════════════════════════════════════
// Company Photo Presets
// ════════════════════════════════════════════════

// ── Get photo preset for a company ──
export const getPreset = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("companyPhotoPresets")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .first();
  },
});

// ── Save (upsert) photo preset ──
export const savePreset = mutation({
  args: {
    companyId: v.id("companies"),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    logoPosition: v.union(
      v.literal("top-left"),
      v.literal("top-right"),
      v.literal("bottom-left"),
      v.literal("bottom-right"),
      v.literal("bottom-center")
    ),
    brandColor: v.string(),
    watermarkOpacity: v.number(),
    textTemplate: v.optional(v.string()),
    overlayUrl: v.optional(v.string()),
    overlayStorageId: v.optional(v.id("_storage")),
    useOverlay: v.optional(v.boolean()),
    logoScale: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("companyPhotoPresets")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .first();

    const data = {
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
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("companyPhotoPresets", data);
    }
  },
});

// ════════════════════════════════════════════════
// Booking Photos — Upload & Management
// ════════════════════════════════════════════════

// ── Upload photos for a booking (called after files are stored) ──
export const addPhoto = mutation({
  args: {
    bookingId: v.id("bookings"),
    companyId: v.id("companies"),
    storageId: v.id("_storage"),
    url: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    // Verify the booking belongs to this company
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.companyId?.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized: booking does not belong to this company");
    }

    return await ctx.db.insert("bookingPhotos", {
      bookingId: args.bookingId,
      companyId: args.companyId,
      originalStorageId: args.storageId,
      originalUrl: args.url,
      status: "pending",
      order: args.order,
      uploadedAt: Date.now(),
    });
  },
});

// ── Get all photos for a booking (company view — sees all statuses) ──
export const getByBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const photos = await ctx.db
      .query("bookingPhotos")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    return photos.sort((a, b) => a.order - b.order);
  },
});

// ── Get photos for a booking (player view — only ready photos) ──
export const getReadyByBooking = query({
  args: { bookingId: v.id("bookings"), userId: v.id("users") },
  handler: async (ctx, args) => {
    // Verify this user owns this booking
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.userId?.toString() !== args.userId.toString()) {
      return [];
    }

    const photos = await ctx.db
      .query("bookingPhotos")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();

    return photos
      .filter((p) => p.status === "ready")
      .sort((a, b) => a.order - b.order);
  },
});

// ── Delete a photo ──
export const deletePhoto = mutation({
  args: {
    photoId: v.id("bookingPhotos"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.companyId.toString() !== args.companyId.toString()) {
      throw new Error("Unauthorized");
    }
    // Delete stored files
    await ctx.storage.delete(photo.originalStorageId);
    if (photo.processedStorageId) {
      await ctx.storage.delete(photo.processedStorageId);
    }
    await ctx.db.delete(args.photoId);
  },
});

// ── Count photos by booking (for badge display) ──
export const countByBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const photos = await ctx.db
      .query("bookingPhotos")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    return {
      total: photos.length,
      ready: photos.filter((p) => p.status === "ready").length,
      pending: photos.filter((p) => p.status === "pending" || p.status === "processing").length,
    };
  },
});

// ════════════════════════════════════════════════
// Image Processing Pipeline
// ════════════════════════════════════════════════

// ── Internal mutation: update photo status after processing ──
export const updatePhotoStatus = internalMutation({
  args: {
    photoId: v.id("bookingPhotos"),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed")
    ),
    processedStorageId: v.optional(v.id("_storage")),
    processedUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = { status: args.status };
    if (args.processedStorageId) updates.processedStorageId = args.processedStorageId;
    if (args.processedUrl) updates.processedUrl = args.processedUrl;
    if (args.status === "ready" || args.status === "failed") {
      updates.processedAt = Date.now();
    }
    await ctx.db.patch(args.photoId, updates);
  },
});

// ── Action: process a single photo (applies branding overlay) ──
export const processPhoto = action({
  args: { photoId: v.id("bookingPhotos") },
  handler: async (ctx, args) => {
    // 1. Get the photo record
    const photo: any = await ctx.runQuery(api.bookingPhotos.getPhotoById, { photoId: args.photoId });
    if (!photo) throw new Error("Photo not found");

    // 2. Mark as processing
    await ctx.runMutation(internal.bookingPhotos.updatePhotoStatus, {
      photoId: args.photoId,
      status: "processing",
    });

    try {
      // 3. Get the company's photo preset
      const preset: any = await ctx.runQuery(api.bookingPhotos.getPreset, {
        companyId: photo.companyId,
      });

      // 4. Fetch the original image
      const originalUrl = photo.originalUrl;
      const imageResponse = await fetch(originalUrl);
      if (!imageResponse.ok) throw new Error("Failed to fetch original image");
      const imageBuffer = await imageResponse.arrayBuffer();

      // 5. Apply branding using Canvas API (via server-side processing)
      // Since Convex actions run in Node.js-like environment, we'll compose
      // a branded image using a lightweight approach:
      // - For MVP, we store the original as "processed" with metadata
      // - The branding overlay is applied client-side with CSS/Canvas
      // - For production, integrate a service like Cloudinary or Sharp

      // For now: mark as ready with original URL (branding applied via CSS overlay on client)
      // This keeps the pipeline async-ready for future server-side processing
      const processedUrl = originalUrl;

      // 6. Update photo as ready
      await ctx.runMutation(internal.bookingPhotos.updatePhotoStatus, {
        photoId: args.photoId,
        status: "ready",
        processedUrl,
      });

      // 7. Check if all photos for this booking are now ready
      const allPhotos: any[] = await ctx.runQuery(api.bookingPhotos.getByBooking, {
        bookingId: photo.bookingId,
      });
      const allReady = allPhotos.every((p: any) => p.status === "ready");

      if (allReady) {
        // Notify the player
        await ctx.runMutation(api.bookingPhotos.notifyPhotosReady, {
          bookingId: photo.bookingId,
        });
      }
    } catch (error: any) {
      // Mark as failed
      await ctx.runMutation(internal.bookingPhotos.updatePhotoStatus, {
        photoId: args.photoId,
        status: "failed",
      });
      console.error("Photo processing failed:", error);
    }
  },
});

// ── Helper query: get a single photo by ID ──
export const getPhotoById = query({
  args: { photoId: v.id("bookingPhotos") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.photoId);
  },
});

// ── Public mutation: mark a photo as processed (called from client after canvas compositing) ──
export const markPhotoProcessed = mutation({
  args: {
    photoId: v.id("bookingPhotos"),
    companyId: v.id("companies"),
    processedStorageId: v.id("_storage"),
    processedUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const photo = await ctx.db.get(args.photoId);
    if (!photo || photo.companyId !== args.companyId) {
      throw new Error("Not authorized");
    }
    await ctx.db.patch(args.photoId, {
      status: "ready",
      processedStorageId: args.processedStorageId,
      processedUrl: args.processedUrl,
      processedAt: Date.now(),
    });
  },
});

// ── Public mutation: check if all booking photos are ready and notify player ──
export const checkAndNotifyBooking = mutation({
  args: { bookingId: v.id("bookings"), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const photos = await ctx.db
      .query("bookingPhotos")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();

    const allReady = photos.length > 0 && photos.every((p) => p.status === "ready");
    if (!allReady) return false;

    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !booking.userId) return false;

    const room = await ctx.db.get(booking.roomId);
    const roomName = room?.title || "Escape Room";
    const recipientUser = await ctx.db.get(booking.userId);
    const lang = recipientUser?.language;

    await ctx.db.insert("notifications", {
      userId: booking.userId,
      type: "photos_ready",
      title: nt(lang, "photos_ready.title"),
      message: nt(lang, "photos_ready.message", { room: roomName }),
      read: false,
      createdAt: Date.now(),
      data: { bookingId: args.bookingId, roomName },
    });

    return true;
  },
});

// ── Notify player that booking photos are ready ──
export const notifyPhotosReady = mutation({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || !booking.userId) return;

    // Get the room name for the notification
    const room = await ctx.db.get(booking.roomId);
    const roomName = room?.title || "Escape Room";
    const recipientUser2 = await ctx.db.get(booking.userId);
    const lang2 = recipientUser2?.language;

    // Create in-app notification
    await ctx.db.insert("notifications", {
      userId: booking.userId,
      type: "photos_ready",
      title: nt(lang2, "photos_ready.title"),
      message: nt(lang2, "photos_ready.message", { room: roomName }),
      read: false,
      createdAt: Date.now(),
      data: {
        bookingId: args.bookingId,
        roomName,
      },
    });
  },
});

// ── Trigger processing for all pending photos in a booking ──
export const processAllForBooking = action({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const photos: any[] = await ctx.runQuery(api.bookingPhotos.getByBooking, {
      bookingId: args.bookingId,
    });

    const pending = photos.filter((p: any) => p.status === "pending");

    // Process each photo
    for (const photo of pending) {
      await ctx.runAction(api.bookingPhotos.processPhoto, {
        photoId: photo._id,
      });
    }
  },
});

// ── Get completed bookings for a company (for photo upload selection) ──
export const getCompletedBookings = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .collect();

    const completed = bookings
      .filter((b) => b.status === "completed")
      .sort((a, b) => b.createdAt - a.createdAt);

    // Enrich with room + player data + photo count
    const enriched = await Promise.all(
      completed.map(async (b) => {
        const room = await ctx.db.get(b.roomId);
        let playerName: string | undefined;
        if (b.userId) {
          const user = await ctx.db.get(b.userId);
          playerName = user?.name;
        }
        // Count existing photos
        const photos = await ctx.db
          .query("bookingPhotos")
          .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
          .collect();
        return {
          ...b,
          room,
          playerName: playerName || b.playerName,
          photoCount: photos.length,
        };
      })
    );

    return enriched;
  },
});

// ── Get bookings with photos for a player ──
export const getBookingsWithPhotos = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const withPhotos = [];
    for (const b of bookings) {
      const photos = await ctx.db
        .query("bookingPhotos")
        .withIndex("by_booking", (q) => q.eq("bookingId", b._id))
        .collect();
      const readyPhotos = photos.filter((p) => p.status === "ready");
      if (readyPhotos.length > 0) {
        const room = await ctx.db.get(b.roomId);
        withPhotos.push({
          ...b,
          room,
          photos: readyPhotos.sort((a, b) => a.order - b.order),
          photoCount: readyPhotos.length,
        });
      }
    }

    return withPhotos.sort((a, b) => b.createdAt - a.createdAt);
  },
});
