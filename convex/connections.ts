import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Who is "connected" with whom, now that there are no friend requests.
 * Players only follow each other (one way, like Instagram). Two players are
 * connected when they follow each other, already chat (an accepted direct
 * chat), or were friends before friend requests went away (old rows, until
 * friends:migrateToFollows has run).
 *
 * Connected players can tag each other as teammates, add each other to group
 * chats and invite each other. A message to someone who doesn't follow you
 * arrives as a message request (messages.ts).
 */

type Ctx = QueryCtx | MutationCtx;

/** True if `a` follows `b`. */
export async function follows(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<boolean> {
  return !!(await ctx.db
    .query("follows")
    .withIndex("by_follower", (q) => q.eq("followerId", a).eq("followingId", b))
    .first());
}

async function legacyFriends(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    ctx.db.query("friendships").withIndex("by_pair", (q) => q.eq("requesterId", a).eq("receiverId", b)).first(),
    ctx.db.query("friendships").withIndex("by_pair", (q) => q.eq("requesterId", b).eq("receiverId", a)).first(),
  ]);
  return ab?.status === "accepted" || ba?.status === "accepted";
}

/** A direct chat both players are in, with no open or turned-down request. */
async function acceptedDirect(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<boolean> {
  const directKey = [a, b].sort().join(":");
  const conv = await ctx.db
    .query("conversations")
    .withIndex("by_direct_key", (q) => q.eq("directKey", directKey))
    .first();
  if (!conv) return false;
  const rows = await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
    .collect();
  const ra = rows.find((r) => r.userId === a);
  const rb = rows.find((r) => r.userId === b);
  return !!ra && !!rb && !ra.request && !rb.request;
}

export async function areConnected(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<boolean> {
  if (a === b) return false;
  const [ab, ba] = await Promise.all([follows(ctx, a, b), follows(ctx, b, a)]);
  if (ab && ba) return true;
  if (await legacyFriends(ctx, a, b)) return true;
  return await acceptedDirect(ctx, a, b);
}

/** Every player connected with `me` (the pickers for teammates, groups and invites). */
export async function connectedIds(ctx: Ctx, me: Id<"users">): Promise<Id<"users">[]> {
  const [following, followers, sent, received, mine] = await Promise.all([
    ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", me)).take(2000),
    ctx.db.query("follows").withIndex("by_following", (q) => q.eq("followingId", me)).take(2000),
    ctx.db.query("friendships").withIndex("by_requester", (q) => q.eq("requesterId", me)).collect(),
    ctx.db.query("friendships").withIndex("by_receiver", (q) => q.eq("receiverId", me)).collect(),
    ctx.db.query("conversationMembers").withIndex("by_user", (q) => q.eq("userId", me)).take(300),
  ]);
  const followerSet = new Set(followers.map((f) => f.followerId));
  const out = new Set<Id<"users">>();
  for (const f of following) if (followerSet.has(f.followingId)) out.add(f.followingId);
  for (const f of [...sent, ...received]) {
    if (f.status === "accepted") out.add(f.requesterId === me ? f.receiverId : f.requesterId);
  }
  for (const m of mine) {
    if (m.request) continue;
    const conv = await ctx.db.get(m.conversationId);
    if (!conv || conv.kind !== "direct") continue;
    const rows = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
      .collect();
    const other = rows.find((r) => r.userId !== me);
    if (other && !other.request) out.add(other.userId);
  }
  out.delete(me);
  return [...out];
}

export type MemberRow = Doc<"conversationMembers">;
