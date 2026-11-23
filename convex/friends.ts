import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { areConnected, connectedIds } from "./connections";
import { notifyUser } from "./push";
import { v } from "convex/values";
import { nt } from "./notificationTexts";
import { requireUser, optionalUser, legacyUserIdV } from "./userSession";
import { rateLimit, HOUR } from "./rateLimit";

// No friend requests any more (players only follow each other; a message to
// someone who doesn't follow you is a message request, messages.ts). These
// functions keep their names so older app builds keep working:
// "friends" = players connected with you (connections.ts).

async function followOnce(ctx: MutationCtx, follower: Id<"users">, following: Id<"users">) {
  if (follower === following) return;
  const has = await ctx.db
    .query("follows")
    .withIndex("by_follower", (q) => q.eq("followerId", follower).eq("followingId", following))
    .first();
  if (!has) await ctx.db.insert("follows", { followerId: follower, followingId: following, createdAt: Date.now() });
}

// ─── Search players by name ───
export const searchUsers = query({
  args: {
    sessionToken: v.optional(v.string()), currentUserId: legacyUserIdV,
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken, args.currentUserId);
    if (!me) return [];
    const currentUserId = me._id;
    if (args.searchTerm.trim().length < 3) return [];

    const term = args.searchTerm.trim().toLowerCase();

    // Full-text search index on the name (schema.ts), so we never load every
    // user. It matches whole words and the start of the last word typed.
    const found = await ctx.db
      .query("users")
      .withSearchIndex("search_name", (q) => q.search("name", term))
      .take(25);

    const results = found.filter((u) => u._id !== currentUserId).slice(0, 20);

    if (results.length === 0) return [];

    const [following, followers, blockedUsers] = await Promise.all([
      ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", currentUserId)).take(2000),
      ctx.db.query("follows").withIndex("by_following", (q) => q.eq("followingId", currentUserId)).take(2000),
      ctx.db
        .query("blockedUsers")
        .withIndex("by_blocker", (q) => q.eq("blockerId", currentUserId))
        .collect(),
    ]);

    // Build Maps for O(1) lookups
    const followingSet = new Set(following.map((f) => f.followingId as string));
    const followerSet = new Set(followers.map((f) => f.followerId as string));
    const blockedSet = new Set(blockedUsers.map((b) => b.blockedUserId));

    // Enrich results (only storage URL calls remain as N+1, but they're fast)
    const enriched = await Promise.all(
      results.map(async (u) => {
        // Skip blocked users early
        if (blockedSet.has(u._id)) return null;

        // Resolve avatar
        let avatar = u.avatar;
        if (u.avatarStorageId) {
          const freshUrl = await ctx.storage.getUrl(u.avatarStorageId);
          if (freshUrl) avatar = freshUrl;
        }

        const isFollowing = followingSet.has(u._id);
        const followsYou = followerSet.has(u._id);
        // Old app builds read friendshipStatus: following each other = "friends"
        const friendshipStatus: string | null = isFollowing && followsYou ? "friends" : isFollowing ? "request_sent" : null;

        return {
          _id: u._id,
          name: u.name,
          avatar,
          title: u.title,
          friendshipStatus,
          isFollowing,
          followsYou,
          isBlocked: false,
        };
      })
    );

    return enriched.filter(Boolean);
  },
});

// ─── Old "add friend" button (older app builds): follows the player ───
export const sendRequest = mutation({
  args: {
    sessionToken: v.optional(v.string()), requesterId: legacyUserIdV,
    receiverId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken, args.requesterId);
    if (me._id === args.receiverId) throw new Error("You can't follow yourself");
    const blocked = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocker_blocked", (q) => q.eq("blockerId", args.receiverId).eq("blockedUserId", me._id))
      .first();
    if (blocked) throw new Error("You can't follow this player");
    await rateLimit(ctx, `follow:${me._id}`, 60, HOUR);
    await followOnce(ctx, me._id, args.receiverId);
    return null;
  },
});

// ─── Old requests still waiting (from before): accepting = following each other ───
export const acceptRequest = mutation({
  args: {
    friendshipId: v.id("friendships"),
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken, args.userId);
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) return;
    if (friendship.receiverId !== me._id) throw new Error("Only the receiver can accept");
    await followOnce(ctx, friendship.requesterId, friendship.receiverId);
    await followOnce(ctx, friendship.receiverId, friendship.requesterId);
    await ctx.db.delete(friendship._id);
  },
});

export const declineRequest = mutation({
  args: {
    friendshipId: v.id("friendships"),
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken, args.userId);
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) return;
    if (friendship.receiverId !== me._id) throw new Error("Only the receiver can decline");
    await ctx.db.delete(friendship._id);
  },
});

// ─── Old friendship rows (before the migration) ───
export const removeFriend = mutation({
  args: {
    friendshipId: v.id("friendships"),
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken, args.userId);
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) return;
    if (friendship.requesterId !== user._id && friendship.receiverId !== user._id) {
      throw new Error("Not part of this friendship");
    }
    await ctx.db.delete(args.friendshipId);
  },
});

// ─── Players connected with me (follow each other, chat, old friends) ───
// The pickers for teammates, group chats and invites.
export const listFriends = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!me) return [];
    const ids = await connectedIds(ctx, me._id);
    const people = await Promise.all(
      ids.map(async (id) => {
        const u = await ctx.db.get(id);
        if (!u) return null;
        let avatar = u.avatar;
        if (u.avatarStorageId) {
          const freshUrl = await ctx.storage.getUrl(u.avatarStorageId);
          if (freshUrl) avatar = freshUrl;
        }
        // No email: only name and avatar (privacy).
        return { friendshipId: null, _id: u._id, name: u.name, avatar, title: u.title, memberSince: u.memberSince };
      })
    );
    return people.filter(Boolean).sort((a, b) => (a!.name || '').localeCompare(b!.name || ''));
  },
});

// ─── No friend requests any more (older app builds still ask) ───
export const pendingRequests = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async () => [],
});

/**
 * One-off: every accepted friendship becomes two follows (they follow each
 * other); open and turned-down requests go. Run once per deployment:
 *   npx convex run friends:migrateToFollows
 */
export const migrateToFollows = internalMutation({
  args: {},
  handler: async (ctx) => {
    let follows = 0, removed = 0;
    for (const f of await ctx.db.query("friendships").collect()) {
      if (f.status === "accepted") {
        await followOnce(ctx, f.requesterId, f.receiverId);
        await followOnce(ctx, f.receiverId, f.requesterId);
        follows++;
      }
      await ctx.db.delete(f._id);
      removed++;
    }
    return { friendshipsTurnedIntoFollows: follows, rowsRemoved: removed };
  },
});

// ─── Invite friend to booking ───
export const inviteToBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    sessionToken: v.optional(v.string()), inviterId: legacyUserIdV,
    inviteeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const inviter = await requireUser(ctx, args.sessionToken, args.inviterId);
    const inviterId = inviter._id;
    // Only the booking's owner can invite people to it
    const ownBooking = await ctx.db.get(args.bookingId);
    if (!ownBooking || ownBooking.userId !== inviterId)
      throw new Error("Booking not found");
    await rateLimit(ctx, `bookingInvite:${inviterId}`, 30, HOUR);
    // Only players you follow each other with (or chat with)
    if (!(await areConnected(ctx, inviterId, args.inviteeId))) throw new Error("You can only invite players you follow each other with");

    // Check if already invited
    const existing = await ctx.db
      .query("bookingInvites")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    if (existing.find((i) => i.inviteeId === args.inviteeId))
      throw new Error("Already invited");

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");

    const room = await ctx.db.get(booking.roomId);

    const id = await ctx.db.insert("bookingInvites", {
      bookingId: args.bookingId,
      inviterId,
      inviteeId: args.inviteeId,
      status: "pending",
      createdAt: Date.now(),
    });

    // Send notification
    const inviteeUser = await ctx.db.get(args.inviteeId);
    const lang = inviteeUser?.language;
    await notifyUser(ctx, {
      userId: args.inviteeId,
      type: "booking_invite",
      title: nt(lang, "booking_invite.title"),
      message: nt(lang, "booking_invite.message", {
        name: inviter?.name ?? "A friend",
        room: room?.title ?? "an escape room",
        date: booking.date,
        time: booking.time,
      }),
      read: false,
      createdAt: Date.now(),
      data: {
        bookingInviteId: id,
        bookingId: args.bookingId,
        roomId: booking.roomId,
        date: booking.date,
        time: booking.time,
      },
    });

    return id;
  },
});

// ─── Respond to booking invite ───
export const respondToBookingInvite = mutation({
  args: {
    inviteId: v.id("bookingInvites"),
    sessionToken: v.optional(v.string()), userId: legacyUserIdV,
    response: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const invitee = await requireUser(ctx, args.sessionToken, args.userId);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.inviteeId !== invitee._id)
      throw new Error("Not your invite");
    if (invite.status !== "pending")
      throw new Error("Already responded");

    await ctx.db.patch(args.inviteId, {
      status: args.response,
      respondedAt: Date.now(),
    });

    // Notify the inviter
    const booking = await ctx.db.get(invite.bookingId);
    const room = booking ? await ctx.db.get(booking.roomId) : null;
    const inviterUser = await ctx.db.get(invite.inviterId);
    const lang = inviterUser?.language;

    const titleKey = args.response === "accepted" ? "invite_accepted.title" : "invite_declined.title";
    const msgKey = args.response === "accepted" ? "invite_accepted.message" : "invite_declined.message";

    await notifyUser(ctx, {
      userId: invite.inviterId,
      type: "booking",
      title: nt(lang, titleKey),
      message: nt(lang, msgKey, {
        name: invitee?.name ?? "Your friend",
        room: room?.title ?? "the escape room",
      }),
      read: false,
      createdAt: Date.now(),
      data: {
        bookingId: invite.bookingId,
      },
    });
  },
});

// ─── Get booking invites for a user (incoming pending) ───
export const getBookingInvites = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return [];
    const invites = await ctx.db
      .query("bookingInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", me._id))
      .collect();

    const enriched = await Promise.all(
      invites.map(async (inv) => {
        const booking = await ctx.db.get(inv.bookingId);
        const room = booking ? await ctx.db.get(booking.roomId) : null;
        const inviter = await ctx.db.get(inv.inviterId);

        let inviterAvatar = inviter?.avatar ?? "";
        if (inviter?.avatarStorageId) {
          const freshUrl = await ctx.storage.getUrl(inviter.avatarStorageId);
          if (freshUrl) inviterAvatar = freshUrl;
        }

        return {
          ...inv,
          booking: booking
            ? {
                date: booking.date,
                time: booking.time,
                players: booking.players,
                status: booking.status,
              }
            : null,
          room: room
            ? {
                _id: room._id,
                title: room.title,
                image: room.image,
                location: room.location,
              }
            : null,
          inviter: inviter
            ? {
                _id: inviter._id,
                name: inviter.name,
                avatar: inviterAvatar,
              }
            : null,
        };
      })
    );

    return enriched;
  },
});

// ─── Get invites sent for a specific booking (for the booking owner) ───
export const getBookingInvitesByBooking = query({
  args: { bookingId: v.id("bookings"), sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!me) return [];
    const ownBooking = await ctx.db.get(args.bookingId);
    if (!ownBooking || ownBooking.userId !== me._id) return [];
    const invites = await ctx.db
      .query("bookingInvites")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();

    const enriched = await Promise.all(
      invites.map(async (inv) => {
        const invitee = await ctx.db.get(inv.inviteeId);
        let avatar = invitee?.avatar ?? "";
        if (invitee?.avatarStorageId) {
          const freshUrl = await ctx.storage.getUrl(invitee.avatarStorageId);
          if (freshUrl) avatar = freshUrl;
        }
        return {
          ...inv,
          invitee: invitee
            ? { _id: invitee._id, name: invitee.name, avatar }
            : null,
        };
      })
    );

    return enriched;
  },
});

// ─── Get friend count ───
export const friendCount = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return 0;
    return (await connectedIds(ctx, me._id)).length;
  },
});
