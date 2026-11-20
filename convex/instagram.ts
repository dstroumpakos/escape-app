import { ConvexError, v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireCompany, sessionTokenV } from "./companySession";
import { companyIsPublic } from "./companyRules";
import { underCap } from "./rateLimit";

/**
 * A company's latest Instagram posts, shown on its room pages.
 *
 * The company opts in from the portal (Settings: Instagram username + switch).
 * Once a day (and right after they switch it on) we ask SearchApi
 * (searchapi.io, engine "instagram_profile", key in SEARCHAPI_KEY) for the
 * public profile, keep the newest MAX_POSTS posts and copy their thumbnails
 * into our storage: Instagram's image links expire after a few days.
 * Each post links back to the post on Instagram.
 */

const MAX_POSTS = 9;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

/** "@name", "name" or an instagram.com profile link → "name". "" clears. Throws on anything else. */
export function cleanInstagramUsername(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (s === "") return "";
  if (/instagram\.com/i.test(s)) {
    try {
      const u = new URL(s.includes("://") ? s : "https://" + s);
      s = u.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      s = "";
    }
  }
  s = s.replace(/^@/, "");
  if (!USERNAME_RE.test(s)) throw new ConvexError("Enter your Instagram username, like @yourescaperoom");
  return s.toLowerCase();
}

// ─── Public ───

/** Posts for a company's room pages, or null when it has none / hasn't opted in. */
export const forCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const company = await ctx.db.get(companyId);
    if (!companyIsPublic(company) || !company?.instagramEnabled || !company.instagramUsername) return null;
    const posts = await ctx.db
      .query("instagramPosts")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    if (posts.length === 0) return null;
    posts.sort((a, b) => a.position - b.position);
    return {
      username: company.instagramUsername,
      profileUrl: `https://www.instagram.com/${company.instagramUsername}/`,
      posts: posts.map((p) => ({
        id: p.postId,
        permalink: p.permalink,
        imageUrl: p.imageUrl,
        type: p.type,
        caption: p.caption,
      })),
    };
  },
});

// ─── Portal ───

export const settingsForCompany = query({
  args: { companyId: v.id("companies"), sessionToken: sessionTokenV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "instagram:settingsForCompany");
    const posts = await ctx.db
      .query("instagramPosts")
      .withIndex("by_company", (q) => q.eq("companyId", company._id))
      .collect();
    return {
      username: company.instagramUsername ?? "",
      enabled: !!company.instagramEnabled,
      syncedAt: company.instagramSyncedAt ?? null,
      error: company.instagramSyncError ?? null,
      postCount: posts.length,
    };
  },
});

/** Save the username / switch. Turning it on (or changing the name) fetches the posts right away. */
export const setForCompany = mutation({
  args: {
    companyId: v.id("companies"),
    sessionToken: sessionTokenV,
    username: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "instagram:setForCompany");
    const cleaned = cleanInstagramUsername(args.username);
    const username = cleaned === undefined ? company.instagramUsername : cleaned || undefined;
    const enabled = args.enabled ?? !!company.instagramEnabled;
    const changed = username !== company.instagramUsername;

    await ctx.db.patch(company._id, {
      instagramUsername: username,
      instagramEnabled: enabled && !!username,
      ...(changed ? { instagramSyncedAt: undefined, instagramSyncError: undefined } : {}),
    });

    if (!enabled || !username) {
      await removePosts(ctx, company._id, new Set());
      return { syncing: false };
    }
    if (changed) await removePosts(ctx, company._id, new Set());
    // Each sync is a paid request: a few per hour per company is plenty.
    if (changed || !company.instagramEnabled || (await underCap(ctx, `igSync:${company._id}`, 4))) {
      await ctx.scheduler.runAfter(0, internal.instagram.refreshCompany, { companyId: company._id });
      return { syncing: true };
    }
    return { syncing: false };
  },
});

// ─── Sync ───

/** Daily: every company that has the feed switched on, a few seconds apart. */
export const refreshAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids: Id<"companies">[] = await ctx.runQuery(internal.instagram.enabledCompanies, {});
    for (const [i, companyId] of ids.entries()) {
      await ctx.scheduler.runAfter(i * 15_000, internal.instagram.refreshCompany, { companyId });
    }
    return ids.length;
  },
});

export const enabledCompanies = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("companies").collect();
    return all.filter((c) => c.instagramEnabled && c.instagramUsername && companyIsPublic(c)).map((c) => c._id);
  },
});

export const syncTarget = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const c = await ctx.db.get(companyId);
    if (!c || !c.instagramEnabled || !c.instagramUsername || !companyIsPublic(c)) return null;
    const posts = await ctx.db
      .query("instagramPosts")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    return {
      username: c.instagramUsername,
      have: posts.map((p) => ({ postId: p.postId, storageId: p.storageId })),
    };
  },
});

type SearchApiPost = {
  id?: string;
  permalink?: string;
  type?: string;
  link?: string;
  thumbnail?: string;
  caption?: string;
};

/** Fetch one company's profile from SearchApi and store its newest posts. */
export const refreshCompany = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (ctx, { companyId }) => {
    const target = await ctx.runQuery(internal.instagram.syncTarget, { companyId });
    if (!target) return "skipped";
    const key = process.env.SEARCHAPI_KEY;
    if (!key) {
      await ctx.runMutation(internal.instagram.recordError, { companyId, error: "not_configured" });
      return "no key";
    }

    const url = new URL("https://www.searchapi.io/api/v1/search");
    url.searchParams.set("engine", "instagram_profile");
    url.searchParams.set("username", target.username);
    let data: { profile?: { username?: string }; posts?: SearchApiPost[]; error?: string };
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
      data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    } catch (e: any) {
      console.error("[instagram] fetch failed", target.username, e?.message);
      await ctx.runMutation(internal.instagram.recordError, { companyId, error: "fetch_failed" });
      return "fetch failed";
    }
    if (!data.profile) {
      await ctx.runMutation(internal.instagram.recordError, { companyId, error: "not_found" });
      return "not found";
    }

    const have = new Map(target.have.map((p) => [p.postId, p.storageId]));
    const keep: {
      postId: string;
      permalink: string;
      type: string;
      caption?: string;
      storageId: Id<"_storage">;
      position: number;
    }[] = [];
    const fresh: Id<"_storage">[] = [];
    for (const p of (data.posts ?? []).slice(0, MAX_POSTS)) {
      if (!p.id || !/^[\w-]{5,40}$/.test(p.id)) continue;
      const permalink = `https://www.instagram.com/p/${p.id}/`;
      let storageId = have.get(p.id);
      if (!storageId) {
        const img = p.thumbnail || p.link;
        if (!img || !/^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//.test(img)) continue;
        try {
          const r = await fetch(img);
          const type = r.headers.get("content-type") ?? "";
          if (!r.ok || !type.startsWith("image/")) continue;
          const blob = await r.blob();
          if (blob.size > MAX_IMAGE_BYTES) continue;
          storageId = await ctx.storage.store(blob);
          fresh.push(storageId);
        } catch {
          continue;
        }
      }
      keep.push({
        postId: p.id,
        permalink,
        type: (p.type ?? "image").slice(0, 20),
        caption: p.caption ? p.caption.slice(0, 300) : undefined,
        storageId,
        position: keep.length,
      });
    }

    try {
      await ctx.runMutation(internal.instagram.replacePosts, { companyId, posts: keep });
    } catch (e) {
      for (const id of fresh) await ctx.storage.delete(id);
      throw e;
    }
    return `${keep.length} posts (${fresh.length} new)`;
  },
});

export const replacePosts = internalMutation({
  args: {
    companyId: v.id("companies"),
    posts: v.array(
      v.object({
        postId: v.string(),
        permalink: v.string(),
        type: v.string(),
        caption: v.optional(v.string()),
        storageId: v.id("_storage"),
        position: v.number(),
      })
    ),
  },
  handler: async (ctx, { companyId, posts }) => {
    const now = Date.now();
    const keepIds = new Set(posts.map((p) => p.postId));
    await removePosts(ctx, companyId, keepIds);
    const existing = await ctx.db
      .query("instagramPosts")
      .withIndex("by_company", (q) => q.eq("companyId", companyId))
      .collect();
    const byPost = new Map(existing.map((p) => [p.postId, p]));
    for (const p of posts) {
      const row = byPost.get(p.postId);
      if (row) {
        await ctx.db.patch(row._id, { position: p.position, caption: p.caption, fetchedAt: now });
      } else {
        const imageUrl = await ctx.storage.getUrl(p.storageId);
        if (!imageUrl) continue;
        await ctx.db.insert("instagramPosts", { companyId, ...p, imageUrl, fetchedAt: now });
      }
    }
    await ctx.db.patch(companyId, { instagramSyncedAt: now, instagramSyncError: undefined });
  },
});

export const recordError = internalMutation({
  args: { companyId: v.id("companies"), error: v.string() },
  handler: async (ctx, { companyId, error }) => {
    await ctx.db.patch(companyId, { instagramSyncError: error });
  },
});

/** Deletes the company's posts (and their images) except those in `keep`. */
async function removePosts(ctx: any, companyId: Id<"companies">, keep: Set<string>) {
  const rows = await ctx.db
    .query("instagramPosts")
    .withIndex("by_company", (q: any) => q.eq("companyId", companyId))
    .collect();
  for (const r of rows) {
    if (keep.has(r.postId)) continue;
    await ctx.storage.delete(r.storageId);
    await ctx.db.delete(r._id);
  }
}
