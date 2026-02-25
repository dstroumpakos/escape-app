import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/* ════════════════════════════════════════════════════════════
   Content Moderation — Reports, Blocks, and Filtering
   ════════════════════════════════════════════════════════════ */

// ─── Profanity / content filter word list ───
// This is a basic list; extend as needed. Checks are case-insensitive.
const BLOCKED_WORDS = [
  // slurs and hate speech (abbreviated for brevity — extend in production)
  "nigger", "nigga", "faggot", "retard", "kike", "chink", "spic",
  "tranny", "wetback", "coon",
  // explicit sexual
  "fuck", "shit", "cunt", "dick", "pussy", "cock", "asshole",
  "bitch", "whore", "slut", "bastard",
];

const BLOCKED_PATTERN = new RegExp(
  BLOCKED_WORDS.map(w => `\\b${w}\\b`).join("|"),
  "i"
);

/**
 * Checks text for objectionable content. Returns the first matched word or null.
 */
export function filterContent(text: string): string | null {
  const match = text.match(BLOCKED_PATTERN);
  return match ? match[0] : null;
}

/* ── Report a Post ── */
export const reportPost = mutation({
  args: {
    postId: v.id("posts"),
    reporterId: v.id("users"),
    reason: v.union(
      v.literal("spam"),
      v.literal("harassment"),
      v.literal("hate_speech"),
      v.literal("inappropriate"),
      v.literal("other")
    ),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Prevent duplicate reports from same user on same post
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_reporter_post", q =>
        q.eq("reporterId", args.reporterId).eq("postId", args.postId)
      )
      .first();
    if (existing) throw new Error("You have already reported this post.");

    return await ctx.db.insert("reports", {
      postId: args.postId,
      reporterId: args.reporterId,
      reason: args.reason,
      details: args.details,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/* ── Report a Comment ── */
export const reportComment = mutation({
  args: {
    commentId: v.id("postComments"),
    reporterId: v.id("users"),
    reason: v.union(
      v.literal("spam"),
      v.literal("harassment"),
      v.literal("hate_speech"),
      v.literal("inappropriate"),
      v.literal("other")
    ),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_reporter_comment", q =>
        q.eq("reporterId", args.reporterId).eq("commentId", args.commentId)
      )
      .first();
    if (existing) throw new Error("You have already reported this comment.");

    return await ctx.db.insert("reports", {
      commentId: args.commentId,
      reporterId: args.reporterId,
      reason: args.reason,
      details: args.details,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

/* ── Block a User ── */
export const blockUser = mutation({
  args: {
    blockerId: v.id("users"),
    blockedUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (args.blockerId === args.blockedUserId) {
      throw new Error("Cannot block yourself.");
    }

    const existing = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocker_blocked", q =>
        q.eq("blockerId", args.blockerId).eq("blockedUserId", args.blockedUserId)
      )
      .first();
    if (existing) return existing._id; // already blocked

    return await ctx.db.insert("blockedUsers", {
      blockerId: args.blockerId,
      blockedUserId: args.blockedUserId,
      createdAt: Date.now(),
    });
  },
});

/* ── Unblock a User ── */
export const unblockUser = mutation({
  args: {
    blockerId: v.id("users"),
    blockedUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocker_blocked", q =>
        q.eq("blockerId", args.blockerId).eq("blockedUserId", args.blockedUserId)
      )
      .first();
    if (entry) await ctx.db.delete(entry._id);
  },
});

/* ── Get Blocked User IDs (for feed filtering) ── */
export const getBlockedUserIds = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const blocks = await ctx.db
      .query("blockedUsers")
      .withIndex("by_blocker", q => q.eq("blockerId", args.userId))
      .collect();
    return blocks.map(b => b.blockedUserId);
  },
});

/* ── Get Pending Reports (admin) ── */
export const getPendingReports = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("reports")
      .filter(q => q.eq(q.field("status"), "pending"))
      .order("desc")
      .take(100);
  },
});

/* ── Resolve a Report (admin) ── */
export const resolveReport = mutation({
  args: {
    reportId: v.id("reports"),
    resolution: v.union(v.literal("dismissed"), v.literal("removed")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reportId, {
      status: args.resolution,
    });

    if (args.resolution === "removed") {
      const report = await ctx.db.get(args.reportId);
      if (report?.postId) {
        // Delete the offending post
        const comments = await ctx.db
          .query("postComments")
          .withIndex("by_post", q => q.eq("postId", report.postId!))
          .collect();
        for (const c of comments) await ctx.db.delete(c._id);

        const likes = await ctx.db
          .query("postLikes")
          .withIndex("by_post", q => q.eq("postId", report.postId!))
          .collect();
        for (const l of likes) await ctx.db.delete(l._id);

        await ctx.db.delete(report.postId);
      }
      if (report?.commentId) {
        await ctx.db.delete(report.commentId);
      }
    }
  },
});
