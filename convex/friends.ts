import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { nt } from "./notificationTexts";

// ─── Search users by name (for adding friends) ───
export const searchUsers = query({
  args: {
    currentUserId: v.id("users"),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.searchTerm.trim().length < 2) return [];

    const term = args.searchTerm.toLowerCase();

    // Get all users and filter by name (Convex doesn't have text search)
    const allUsers = await ctx.db.query("users").collect();

    const results = allUsers
      .filter(
        (u) =>
          u._id !== args.currentUserId &&
          (u.name.toLowerCase().includes(term) ||
            u.email.toLowerCase().includes(term))
      )
      .slice(0, 20);

    if (results.length === 0) return [];

    // Batch-load all friendships for current user (sent + received) in 2 queries
    const [sentRequests, receivedRequests, blockedUsers] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_requester", (q) => q.eq("requesterId", args.currentUserId))
        .collect(),
      ctx.db
        .query("friendships")
        .withIndex("by_receiver", (q) => q.eq("receiverId", args.currentUserId))
        .collect(),
      ctx.db
        .query("blockedUsers")
        .withIndex("by_blocker", (q) => q.eq("blockerId", args.currentUserId))
        .collect(),
    ]);

    // Build Maps for O(1) lookups
    const sentMap = new Map(sentRequests.map((f) => [f.receiverId, f]));
    const receivedMap = new Map(receivedRequests.map((f) => [f.requesterId, f]));
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

        // Check friendship status from pre-loaded maps
        const sentRequest = sentMap.get(u._id);
        const receivedRequest = receivedMap.get(u._id);
        const friendship = sentRequest || receivedRequest;
        let friendshipStatus: string | null = null;
        if (friendship) {
          if (friendship.status === "accepted") friendshipStatus = "friends";
          else if (friendship.status === "pending") {
            friendshipStatus =
              friendship.requesterId === args.currentUserId
                ? "request_sent"
                : "request_received";
          }
        }

        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          avatar,
          title: u.title,
          friendshipStatus,
          isBlocked: false,
        };
      })
    );

    return enriched.filter(Boolean);
  },
});

// ─── Send friend request ───
export const sendRequest = mutation({
  args: {
    requesterId: v.id("users"),
    receiverId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.requesterId === args.receiverId)
      throw new Error("Cannot send a friend request to yourself");

    // Check if already friends or request exists
    const existing1 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("requesterId", args.requesterId).eq("receiverId", args.receiverId)
      )
      .first();
    const existing2 = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("requesterId", args.receiverId).eq("receiverId", args.requesterId)
      )
      .first();

    if (existing1 || existing2)
      throw new Error("Friend request already exists");

    // Check if blocked
    const blocked = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocker_blocked", (q) =>
        q.eq("blockerId", args.receiverId).eq("blockedUserId", args.requesterId)
      )
      .first();
    if (blocked) throw new Error("Cannot send friend request");

    const id = await ctx.db.insert("friendships", {
      requesterId: args.requesterId,
      receiverId: args.receiverId,
      status: "pending",
      createdAt: Date.now(),
    });

    // Send notification to receiver
    const requester = await ctx.db.get(args.requesterId);
    const receiver = await ctx.db.get(args.receiverId);
    const lang = receiver?.language;
    await ctx.db.insert("notifications", {
      userId: args.receiverId,
      type: "friend_request",
      title: nt(lang, "friend_request.title"),
      message: nt(lang, "friend_request.message", { name: requester?.name ?? "Someone" }),
      read: false,
      createdAt: Date.now(),
      data: { friendshipId: id, requesterId: args.requesterId },
    });

    return id;
  },
});

// ─── Accept friend request ───
export const acceptRequest = mutation({
  args: {
    friendshipId: v.id("friendships"),
    userId: v.id("users"), // the receiver accepting
  },
  handler: async (ctx, args) => {
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) throw new Error("Friend request not found");
    if (friendship.receiverId !== args.userId)
      throw new Error("Only the receiver can accept");
    if (friendship.status !== "pending")
      throw new Error("Request already handled");

    await ctx.db.patch(args.friendshipId, {
      status: "accepted",
      respondedAt: Date.now(),
    });

    // Notify the requester
    const receiver = await ctx.db.get(args.userId);
    const requesterUser = await ctx.db.get(friendship.requesterId);
    const lang = requesterUser?.language;
    await ctx.db.insert("notifications", {
      userId: friendship.requesterId,
      type: "friend_accepted",
      title: nt(lang, "friend_accepted.title"),
      message: nt(lang, "friend_accepted.message", { name: receiver?.name ?? "Someone" }),
      read: false,
      createdAt: Date.now(),
      data: { friendshipId: args.friendshipId },
    });
  },
});

// ─── Decline friend request ───
export const declineRequest = mutation({
  args: {
    friendshipId: v.id("friendships"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) throw new Error("Friend request not found");
    if (friendship.receiverId !== args.userId)
      throw new Error("Only the receiver can decline");
    if (friendship.status !== "pending")
      throw new Error("Request already handled");

    await ctx.db.patch(args.friendshipId, {
      status: "declined",
      respondedAt: Date.now(),
    });
  },
});

// ─── Remove friend ───
export const removeFriend = mutation({
  args: {
    friendshipId: v.id("friendships"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const friendship = await ctx.db.get(args.friendshipId);
    if (!friendship) throw new Error("Friendship not found");
    if (
      friendship.requesterId !== args.userId &&
      friendship.receiverId !== args.userId
    )
      throw new Error("Not part of this friendship");

    await ctx.db.delete(args.friendshipId);
  },
});

// ─── Get friends list ───
export const listFriends = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Friendships where current user is requester
    const asSender = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", args.userId))
      .collect();
    // Friendships where current user is receiver
    const asReceiver = await ctx.db
      .query("friendships")
      .withIndex("by_receiver", (q) => q.eq("receiverId", args.userId))
      .collect();

    const accepted = [...asSender, ...asReceiver].filter(
      (f) => f.status === "accepted"
    );

    const friends = await Promise.all(
      accepted.map(async (f) => {
        const friendId =
          f.requesterId === args.userId ? f.receiverId : f.requesterId;
        const friend = await ctx.db.get(friendId);
        if (!friend) return null;

        let avatar = friend.avatar;
        if (friend.avatarStorageId) {
          const freshUrl = await ctx.storage.getUrl(friend.avatarStorageId);
          if (freshUrl) avatar = freshUrl;
        }

        return {
          friendshipId: f._id,
          _id: friend._id,
          name: friend.name,
          email: friend.email,
          avatar,
          title: friend.title,
          memberSince: friend.memberSince,
        };
      })
    );

    return friends.filter(Boolean);
  },
});

// ─── Get pending requests (incoming) ───
export const pendingRequests = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("friendships")
      .withIndex("by_receiver_status", (q) =>
        q.eq("receiverId", args.userId).eq("status", "pending")
      )
      .collect();

    const enriched = await Promise.all(
      pending.map(async (f) => {
        const requester = await ctx.db.get(f.requesterId);
        if (!requester) return null;

        let avatar = requester.avatar;
        if (requester.avatarStorageId) {
          const freshUrl = await ctx.storage.getUrl(requester.avatarStorageId);
          if (freshUrl) avatar = freshUrl;
        }

        return {
          friendshipId: f._id,
          _id: requester._id,
          name: requester.name,
          email: requester.email,
          avatar,
          title: requester.title,
          createdAt: f.createdAt,
        };
      })
    );

    return enriched.filter(Boolean);
  },
});

// ─── Invite friend to booking ───
export const inviteToBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    inviterId: v.id("users"),
    inviteeId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify they are friends
    const asReq = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("requesterId", args.inviterId).eq("receiverId", args.inviteeId)
      )
      .first();
    const asRec = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) =>
        q.eq("requesterId", args.inviteeId).eq("receiverId", args.inviterId)
      )
      .first();
    const friendship = asReq || asRec;
    if (!friendship || friendship.status !== "accepted")
      throw new Error("You can only invite friends");

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
    const inviter = await ctx.db.get(args.inviterId);

    const id = await ctx.db.insert("bookingInvites", {
      bookingId: args.bookingId,
      inviterId: args.inviterId,
      inviteeId: args.inviteeId,
      status: "pending",
      createdAt: Date.now(),
    });

    // Send notification
    const inviteeUser = await ctx.db.get(args.inviteeId);
    const lang = inviteeUser?.language;
    await ctx.db.insert("notifications", {
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
    userId: v.id("users"),
    response: v.union(v.literal("accepted"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found");
    if (invite.inviteeId !== args.userId)
      throw new Error("Not your invite");
    if (invite.status !== "pending")
      throw new Error("Already responded");

    await ctx.db.patch(args.inviteId, {
      status: args.response,
      respondedAt: Date.now(),
    });

    // Notify the inviter
    const invitee = await ctx.db.get(args.userId);
    const booking = await ctx.db.get(invite.bookingId);
    const room = booking ? await ctx.db.get(booking.roomId) : null;
    const inviterUser = await ctx.db.get(invite.inviterId);
    const lang = inviterUser?.language;

    const titleKey = args.response === "accepted" ? "invite_accepted.title" : "invite_declined.title";
    const msgKey = args.response === "accepted" ? "invite_accepted.message" : "invite_declined.message";

    await ctx.db.insert("notifications", {
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
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const invites = await ctx.db
      .query("bookingInvites")
      .withIndex("by_invitee", (q) => q.eq("inviteeId", args.userId))
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
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
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
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const asSender = await ctx.db
      .query("friendships")
      .withIndex("by_requester", (q) => q.eq("requesterId", args.userId))
      .collect();
    const asReceiver = await ctx.db
      .query("friendships")
      .withIndex("by_receiver", (q) => q.eq("receiverId", args.userId))
      .collect();
    return [...asSender, ...asReceiver].filter((f) => f.status === "accepted")
      .length;
  },
});
