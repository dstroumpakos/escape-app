import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/* ── Feed Queries ── */

export const getFeed = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db
      .query("posts")
      .order("desc")
      .take(50);

    // Enrich posts with author info + room info
    const enriched = await Promise.all(
      posts.map(async (post) => {
        let authorName = "Unknown";
        let authorAvatar = "";
        let authorVerified = false;

        if (post.authorType === "user" && post.authorUserId) {
          const user = await ctx.db.get(post.authorUserId);
          if (user) {
            authorName = user.name;
            authorAvatar = user.avatar;
          }
        } else if (post.authorType === "company" && post.authorCompanyId) {
          const company = await ctx.db.get(post.authorCompanyId);
          if (company) {
            authorName = company.name;
            authorAvatar = company.logo;
            authorVerified = company.verified;
          }
        }

        let roomTitle = "";
        let roomImage = "";
        if (post.roomId) {
          const room = await ctx.db.get(post.roomId);
          if (room) {
            roomTitle = room.title;
            roomImage = room.image;
          }
        }

        // Count comments
        const comments = await ctx.db
          .query("postComments")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect();

        return {
          ...post,
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
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const likes = await ctx.db
      .query("postLikes")
      .withIndex("by_user_post")
      .filter((q) => q.eq(q.field("userId"), args.userId))
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
          userAvatar: user?.avatar || "",
        };
      })
    );

    return enriched;
  },
});

/* ── Mutations ── */

export const createPost = mutation({
  args: {
    authorType: v.union(v.literal("user"), v.literal("company")),
    authorUserId: v.optional(v.id("users")),
    authorCompanyId: v.optional(v.id("companies")),
    text: v.string(),
    mediaStorageIds: v.array(v.object({
      type: v.union(v.literal("image"), v.literal("video")),
      storageId: v.id("_storage"),
    })),
    roomId: v.optional(v.id("rooms")),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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
      authorType: args.authorType,
      authorUserId: args.authorUserId,
      authorCompanyId: args.authorCompanyId,
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
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("postLikes")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", args.userId).eq("postId", args.postId)
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
        userId: args.userId,
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
    userId: v.id("users"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("postComments", {
      postId: args.postId,
      userId: args.userId,
      text: args.text,
      createdAt: Date.now(),
    });
  },
});

export const deletePost = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
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
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
