import { query } from "./_generated/server";
import { v } from "convex/values";

const EARLY_ACCESS_DAYS = 3;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const allRooms = await ctx.db.query("rooms").collect();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Default list: only show publicly released rooms (no releaseDate or already released)
    return allRooms.filter((r) => !r.releaseDate || r.releaseDate <= todayStr);
  },
});

export const getById = query({
  args: { id: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const featured = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_featured", (q) => q.eq("isFeatured", true))
      .collect();
  },
});

export const trending = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_trending", (q) => q.eq("isTrending", true))
      .collect();
  },
});

export const byTheme = query({
  args: { theme: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rooms")
      .withIndex("by_theme", (q) => q.eq("theme", args.theme))
      .collect();
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("rooms").collect();
    const q = args.query.toLowerCase();
    return all.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.theme.toLowerCase().includes(q)
    );
  },
});
