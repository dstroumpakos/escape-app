import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, optionalUser } from "./userSession";
import { rateLimit, HOUR } from "./rateLimit";
import { filterContent } from "./moderation";
import { assertUpload, MAX_IMAGE_BYTES } from "./uploads";
import { notifyUser } from "./push";

/**
 * Player profiles (Instagram + Facebook style): public profile, posts grid,
 * follow / unfollow, bio and cover photo.
 *
 * A public profile never shows email, phone or exact location.
 */

const MAX_BIO = 300;

async function countFollows(ctx: QueryCtx, userId: Id<"users">) {
  const [followers, following] = await Promise.all([
    ctx.db.query("follows").withIndex("by_following", (q) => q.eq("followingId", userId)).collect(),
    ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", userId)).collect(),
  ]);
  return { followers: followers.length, following: following.length };
}

async function freshMedia(ctx: QueryCtx, post: Doc<"posts">) {
  return Promise.all(
    (post.media || []).map(async (m) => {
      if (!m.storageId) return m;
      const url = await ctx.storage.getUrl(m.storageId);
      return { ...m, url: url || m.url };
    })
  );
}

/** Public profile of a player. */
export const profile = query({
  args: { userId: v.id("users"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const viewer = await optionalUser(ctx, args.sessionToken);
    // Profiles are part of the community: logged-in players only.
    if (!viewer) return null;
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author_user", (q) => q.eq("authorUserId", user._id))
      .collect();
    const counts = await countFollows(ctx, user._id);
    const badges = await ctx.db
      .query("badges")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    let isFollowing = false;
    let isFriend = false;
    if (viewer && viewer._id !== user._id) {
      isFollowing = !!(await ctx.db
        .query("follows")
        .withIndex("by_follower", (q) => q.eq("followerId", viewer._id).eq("followingId", user._id))
        .first());
      const [a, b] = await Promise.all([
        ctx.db.query("friendships").withIndex("by_requester", (q) => q.eq("requesterId", viewer._id)).collect(),
        ctx.db.query("friendships").withIndex("by_receiver", (q) => q.eq("receiverId", viewer._id)).collect(),
      ]);
      isFriend = [...a, ...b].some(
        (f) => f.status === "accepted" && (f.requesterId === user._id || f.receiverId === user._id)
      );
    }

    const coverUrl = user.coverStorageId ? await ctx.storage.getUrl(user.coverStorageId) : null;
    return {
      _id: user._id,
      name: user.name,
      avatar: user.avatar,
      cover: coverUrl || null,
      bio: user.bio ?? "",
      city: user.city ?? "",
      title: user.title,
      memberSince: user.memberSince,
      isPremium: !!user.isPremium,
      stats: {
        posts: posts.length,
        followers: counts.followers,
        following: counts.following,
        played: user.played ?? 0,
        escaped: user.escaped ?? 0,
      },
      badges: badges.map((b) => ({ key: b.badgeKey, title: b.title, icon: (b as any).icon ?? null })),
      viewer: {
        loggedIn: !!viewer,
        isMe: viewer?._id === user._id,
        isFollowing,
        isFriend,
      },
    };
  },
});

/** A player's posts, newest first (the grid on the profile). */
export const userPosts = query({
  args: { userId: v.id("users"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!(await optionalUser(ctx, args.sessionToken))) return [];
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author_user", (q) => q.eq("authorUserId", args.userId))
      .order("desc")
      .take(60);
    return Promise.all(
      posts.map(async (p) => {
        const [media, comments, room] = await Promise.all([
          freshMedia(ctx, p),
          ctx.db.query("postComments").withIndex("by_post", (q) => q.eq("postId", p._id)).collect(),
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
          rating: p.rating ?? null,
        };
      })
    );
  },
});

/** Rooms the player reviewed in their posts (the "Rooms" tab). */
export const userRooms = query({
  args: { userId: v.id("users"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!(await optionalUser(ctx, args.sessionToken))) return [];
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_author_user", (q) => q.eq("authorUserId", args.userId))
      .collect();
    const seen = new Map<string, { rating: number | null; at: number }>();
    for (const p of posts) {
      if (!p.roomId) continue;
      const prev = seen.get(p.roomId);
      if (!prev || p.createdAt > prev.at) seen.set(p.roomId, { rating: p.rating ?? null, at: p.createdAt });
    }
    const out = [];
    for (const [roomId, info] of seen) {
      const room = await ctx.db.get(roomId as Id<"rooms">);
      if (!room) continue;
      out.push({ roomId: room._id, title: room.title, image: room.image, theme: room.theme, rating: info.rating, at: info.at });
    }
    return out.sort((a, b) => b.at - a.at);
  },
});

export const follow = mutation({
  args: { sessionToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    if (me._id === args.userId) throw new ConvexError("You can't follow yourself.");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new ConvexError("Player not found");
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", me._id).eq("followingId", target._id))
      .first();
    if (existing) return;
    await rateLimit(ctx, `follow:${me._id}`, 60, HOUR);
    await ctx.db.insert("follows", { followerId: me._id, followingId: target._id, createdAt: Date.now() });
    // One notification per follower, not one per follow/unfollow/follow.
    const notifiedKey = `followNotified:${me._id}:${target._id}`;
    const already = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", notifiedKey)).first();
    if (!already) {
      await ctx.db.insert("rateLimits", { key: notifiedKey, count: 1, windowStart: Date.now() });
      const el = target.language === "el";
      await notifyUser(ctx, {
        userId: target._id,
        type: "friend_accepted",
        title: el ? "Νέος follower" : "New follower",
        message: el ? `Ο/Η ${me.name} σε ακολουθεί.` : `${me.name} started following you.`,
        read: false,
        createdAt: Date.now(),
        data: { kind: "follow", userId: me._id },
      });
    }
  },
});

export const unfollow = mutation({
  args: { sessionToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", me._id).eq("followingId", args.userId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Bio and cover photo (the rest of the profile is edited in users.updateProfile). */
export const updateProfileInfo = mutation({
  args: {
    sessionToken: v.string(),
    bio: v.optional(v.string()),
    coverStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const patch: Partial<Doc<"users">> = {};
    if (args.bio !== undefined) {
      const bio = args.bio.trim();
      if (bio.length > MAX_BIO) throw new ConvexError(`Your bio can be at most ${MAX_BIO} characters.`);
      if (filterContent(bio)) throw new ConvexError("Your bio contains inappropriate language.");
      patch.bio = bio || undefined;
    }
    if (args.coverStorageId !== undefined) {
      if (args.coverStorageId === null) {
        patch.coverStorageId = undefined;
      } else {
        await assertUpload(ctx, args.coverStorageId, "image", MAX_IMAGE_BYTES);
        patch.coverStorageId = args.coverStorageId;
      }
    }
    await ctx.db.patch(me._id, patch);
  },
});

/** People a player follows / who follow them (small lists for the profile). */
export const followList = query({
  args: { userId: v.id("users"), which: v.union(v.literal("followers"), v.literal("following")) },
  handler: async (ctx, args) => {
    const rows =
      args.which === "followers"
        ? await ctx.db.query("follows").withIndex("by_following", (q) => q.eq("followingId", args.userId)).take(200)
        : await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", args.userId)).take(200);
    const ids = rows.map((r) => (args.which === "followers" ? r.followerId : r.followingId));
    const users = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return users.filter((u): u is Doc<"users"> => !!u).map((u) => ({ _id: u._id, name: u.name, avatar: u.avatar }));
  },
});
