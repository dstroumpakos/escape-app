import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { optionalUser } from "./userSession";

/**
 * The Community page (Facebook style): the feed ("for you" or only people
 * you follow / your friends), one post for shared links, and players to follow.
 * Posts by people you blocked, or who blocked you, never show.
 */

const FEED_SIZE = 50;

async function hiddenAuthors(ctx: QueryCtx, me: Doc<"users"> | null): Promise<Set<string>> {
  if (!me) return new Set();
  const [mine, theirs] = await Promise.all([
    ctx.db.query("blockedUsers").withIndex("by_blocker", (q) => q.eq("blockerId", me._id)).collect(),
    ctx.db.query("blockedUsers").withIndex("by_blocked", (q) => q.eq("blockedUserId", me._id)).collect(),
  ]);
  return new Set([...mine.map((b) => b.blockedUserId as string), ...theirs.map((b) => b.blockerId as string)]);
}

async function enrich(ctx: QueryCtx, posts: Doc<"posts">[], me: Doc<"users"> | null) {
  const likedIds = new Set<string>();
  if (me) {
    const likes = await ctx.db
      .query("postLikes")
      .withIndex("by_user_post", (q) => q.eq("userId", me._id))
      .collect();
    for (const l of likes) likedIds.add(l.postId);
  }
  return Promise.all(
    posts.map(async (p) => {
      const [author, company, room, comments, media] = await Promise.all([
        p.authorUserId ? ctx.db.get(p.authorUserId) : null,
        p.authorCompanyId ? ctx.db.get(p.authorCompanyId) : null,
        p.roomId ? ctx.db.get(p.roomId) : null,
        ctx.db.query("postComments").withIndex("by_post", (q) => q.eq("postId", p._id)).collect(),
        Promise.all(
          (p.media || []).map(async (m) => {
            if (!m.storageId) return m;
            const url = await ctx.storage.getUrl(m.storageId);
            return { ...m, url: url || m.url };
          })
        ),
      ]);
      return {
        _id: p._id,
        text: p.text,
        media,
        likes: p.likes,
        createdAt: p.createdAt,
        rating: p.rating ?? null,
        commentCount: comments.length,
        likedByMe: likedIds.has(p._id),
        isMine: !!me && p.authorUserId === me._id,
        author:
          p.authorType === "company"
            ? { kind: "company" as const, id: p.authorCompanyId ?? null, name: company?.name ?? "", avatar: company?.logo ?? "", verified: !!company?.verified }
            : { kind: "user" as const, id: p.authorUserId ?? null, name: author?.name ?? "", avatar: author?.avatar ?? "", verified: false },
        room: room ? { id: room._id, title: room.title, image: room.image } : null,
      };
    })
  );
}

export const feed = query({
  args: {
    sessionToken: v.optional(v.string()),
    mode: v.union(v.literal("all"), v.literal("following")),
  },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    const hidden = await hiddenAuthors(ctx, me);
    let posts: Doc<"posts">[] = [];

    if (args.mode === "following") {
      if (!me) return [];
      const [follows, asRequester, asReceiver] = await Promise.all([
        ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", me._id)).collect(),
        ctx.db.query("friendships").withIndex("by_requester", (q) => q.eq("requesterId", me._id)).collect(),
        ctx.db.query("friendships").withIndex("by_receiver", (q) => q.eq("receiverId", me._id)).collect(),
      ]);
      const ids = new Set<string>([me._id]);
      for (const f of follows) ids.add(f.followingId);
      for (const f of [...asRequester, ...asReceiver]) {
        if (f.status === "accepted") ids.add(f.requesterId === me._id ? f.receiverId : f.requesterId);
      }
      const perAuthor = await Promise.all(
        [...ids].slice(0, 300).map((id) =>
          ctx.db
            .query("posts")
            .withIndex("by_author_user", (q) => q.eq("authorUserId", id as Id<"users">))
            .order("desc")
            .take(20)
        )
      );
      posts = perAuthor.flat().sort((a, b) => b.createdAt - a.createdAt);
    } else {
      posts = await ctx.db.query("posts").withIndex("by_created").order("desc").take(FEED_SIZE * 2);
    }

    posts = posts.filter((p) => !p.authorUserId || !hidden.has(p.authorUserId)).slice(0, FEED_SIZE);
    return enrich(ctx, posts, me);
  },
});

/** One post (for a shared link). */
export const post = query({
  args: { postId: v.id("posts"), sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.postId);
    if (!p) return null;
    const me = await optionalUser(ctx, args.sessionToken);
    const hidden = await hiddenAuthors(ctx, me);
    if (p.authorUserId && hidden.has(p.authorUserId)) return null;
    return (await enrich(ctx, [p], me))[0];
  },
});

/** Players worth following: recent posters you don't follow yet. */
export const suggestions = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    const hidden = await hiddenAuthors(ctx, me);
    const following = new Set<string>();
    if (me) {
      const rows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", me._id)).collect();
      for (const r of rows) following.add(r.followingId);
    }
    const recent = await ctx.db.query("posts").withIndex("by_created").order("desc").take(200);
    const out: { _id: Id<"users">; name: string; avatar: string; posts: number }[] = [];
    const counts = new Map<string, number>();
    for (const p of recent) if (p.authorUserId) counts.set(p.authorUserId, (counts.get(p.authorUserId) ?? 0) + 1);
    for (const [id, n] of [...counts].sort((a, b) => b[1] - a[1])) {
      if (out.length >= 5) break;
      if (me && id === me._id) continue;
      if (following.has(id) || hidden.has(id)) continue;
      const u = await ctx.db.get(id as Id<"users">);
      if (u) out.push({ _id: u._id, name: u.name, avatar: u.avatar, posts: n });
    }
    return out;
  },
});
