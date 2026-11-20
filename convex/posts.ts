import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { filterContent } from "./moderation";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { avatarUrl } from "./avatars";
import { rateLimit, HOUR } from "./rateLimit";
import { assertUpload, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, UPLOADS_PER_HOUR_USER } from "./uploads";

/* ── Feed Queries ── */

export const getFeed = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db
      .query("posts")
      .order("desc")
      .take(50);

    if (posts.length === 0) return [];

    // Batch-load all unique authors and rooms to avoid N+1
    const userIds = Array.from(new Set(posts.filter((p) => p.authorType === "user" && p.authorUserId).map((p) => p.authorUserId!)));
    const companyIds = Array.from(new Set(posts.filter((p) => p.authorType === "company" && p.authorCompanyId).map((p) => p.authorCompanyId!)));
    const roomIds = Array.from(new Set(posts.filter((p) => p.roomId).map((p) => p.roomId!)));
    const [users, companies, rooms] = await Promise.all([
      Promise.all(userIds.map((id) => ctx.db.get(id))),
      Promise.all(companyIds.map((id) => ctx.db.get(id))),
      Promise.all(roomIds.map((id) => ctx.db.get(id))),
    ]);

    const userMap = new Map(userIds.map((id, i) => [id, users[i]]));
    const companyMap = new Map(companyIds.map((id, i) => [id, companies[i]]));
    const roomMap = new Map(roomIds.map((id, i) => [id, rooms[i]]));

    // Enrich posts
    const enriched = await Promise.all(
      posts.map(async (post) => {
        let authorName = "Unknown";
        let authorAvatar = "";
        let authorVerified = false;

        if (post.authorType === "user" && post.authorUserId) {
          const user = userMap.get(post.authorUserId);
          if (user) {
            authorName = user.name;
            authorAvatar = await avatarUrl(ctx, user);
          }
        } else if (post.authorType === "company" && post.authorCompanyId) {
          const company = companyMap.get(post.authorCompanyId);
          if (company) {
            authorName = company.name;
            authorAvatar = company.logo;
            authorVerified = company.verified;
          }
        }

        let roomTitle = "";
        let roomImage = "";
        if (post.roomId) {
          const room = roomMap.get(post.roomId);
          if (room) {
            roomTitle = room.title;
            roomImage = room.image;
          }
        }

        // Count comments (indexed query, fast)
        const comments = await ctx.db
          .query("postComments")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect();

        // Re-resolve media storage URLs (they expire, so refresh each query)
        const freshMedia = await Promise.all(
          (post.media || []).map(async (m) => {
            if (m.storageId) {
              const freshUrl = await ctx.storage.getUrl(m.storageId);
              return { ...m, url: freshUrl || m.url };
            }
            return m;
          })
        );

        return {
          ...post,
          media: freshMedia,
          authorName,
          authorAvatar,
          authorVerified,
          roomTitle,
          roomImage,
          commentCount: comments.length,
        };
      })
    );

    return enriched;
  },
});

export const getUserLikes = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!user) return [];
    const likes = await ctx.db
      .query("postLikes")
      .withIndex("by_user_post", (q) => q.eq("userId", user._id))
      .collect();
    return likes.map((l) => l.postId);
  },
});

export const getComments = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("postComments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("asc")
      .collect();

    const enriched = await Promise.all(
      comments.map(async (comment) => {
        const user = await ctx.db.get(comment.userId);
        return {
          ...comment,
          userName: user?.name || "Unknown",
          userAvatar: await avatarUrl(ctx, user),
        };
      })
    );

    return enriched;
  },
});

/* ── Mutations ── */

export const createPost = mutation({
  args: {
    sessionToken: v.optional(v.string()), authorUserId: legacyUserIdV, authorType: v.optional(v.string()), authorCompanyId: v.optional(v.id("companies")),
    text: v.string(),
    mediaStorageIds: v.array(v.object({
      type: v.union(v.literal("image"), v.literal("video")),
      storageId: v.id("_storage"),
    })),
    roomId: v.optional(v.id("rooms")),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Old app builds also sent authorType/authorCompanyId: only player posts are accepted that way.
    if (!args.sessionToken && args.authorType && args.authorType !== "user") throw new Error("Please update the UNLOCKED app.");
    const user = await requireUser(ctx, args.sessionToken, args.authorUserId);
    if (args.text.length > 5000) throw new Error("Your post is too long.");
    if (args.mediaStorageIds.length > 10) throw new Error("A post can have at most 10 photos or videos.");
    if (args.rating !== undefined && (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5)) {
      throw new Error("Rating must be between 1 and 5.");
    }
    if (args.roomId && !(await ctx.db.get(args.roomId))) throw new Error("Room not found");
    for (const m of args.mediaStorageIds) {
      if (m.type === "image") await assertUpload(ctx, m.storageId, "image", MAX_IMAGE_BYTES);
      else await assertUpload(ctx, m.storageId, "video", MAX_VIDEO_BYTES);
    }
    // Content filtering (Apple Guideline 1.2 — filter objectionable material)
    const blockedWord = filterContent(args.text);
    if (blockedWord) {
      throw new Error("Your post contains inappropriate language. Please revise and try again.");
    }

    // Resolve storage URLs
    const media = await Promise.all(
      args.mediaStorageIds.map(async (m) => {
        const url = await ctx.storage.getUrl(m.storageId);
        return {
          type: m.type,
          url: url || "",
          storageId: m.storageId,
        };
      })
    );

    const postId = await ctx.db.insert("posts", {
      authorType: "user" as const,
      authorUserId: user._id,
      text: args.text,
      media,
      roomId: args.roomId,
      rating: args.rating,
      likes: 0,
      createdAt: Date.now(),
    });

    return postId;
  },
});

export const toggleLike = mutation({
  args: {
    postId: v.id("posts"),
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    const existing = await ctx.db
      .query("postLikes")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", user._id).eq("postId", args.postId)
      )
      .unique();

    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");

    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.postId, { likes: Math.max(0, post.likes - 1) });
      return false;
    } else {
      await ctx.db.insert("postLikes", {
        postId: args.postId,
        userId: user._id,
        createdAt: Date.now(),
      });
      await ctx.db.patch(args.postId, { likes: post.likes + 1 });
      return true;
    }
  },
});

export const addComment = mutation({
  args: {
    postId: v.id("posts"),
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    if (!(await ctx.db.get(args.postId))) throw new Error("Post not found");
    if (args.text.length > 2000) throw new Error("Your comment is too long.");
    // Content filtering (Apple Guideline 1.2)
    const blockedWord = filterContent(args.text);
    if (blockedWord) {
      throw new Error("Your comment contains inappropriate language. Please revise and try again.");
    }

    return await ctx.db.insert("postComments", {
      postId: args.postId,
      userId: user._id,
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

export const deletePost = mutation({
  args: { postId: v.id("posts"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const existingPost = await ctx.db.get(args.postId);
    if (!existingPost) return;
    if (existingPost.authorUserId !== user._id) throw new Error("You can only delete your own posts");
    // Delete comments
    const comments = await ctx.db
      .query("postComments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);

    // Delete likes
    const likes = await ctx.db
      .query("postLikes")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    for (const l of likes) await ctx.db.delete(l._id);

    // Delete post
    await ctx.db.delete(args.postId);
  },
});

export const generateUploadUrl = mutation({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    await rateLimit(ctx, `upload:user:${user._id}`, UPLOADS_PER_HOUR_USER, HOUR);
    return await ctx.storage.generateUploadUrl();
  },
});
