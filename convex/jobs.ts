import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireCompany } from "./companySession";
import { companyIsPublic } from "./companyRules";
import { rateLimit, HOUR } from "./rateLimit";

/**
 * Job ads. A company writes an ad ("we are looking for a game master"), picks
 * the roles and, when the part needs it (an actor for a female character),
 * the gender. Players see every open ad of a public company on /jobs and on
 * the company's profile. Contact goes straight to the company (email/phone the
 * company chose to show); UNLOCKED stores no applications.
 */

export const JOB_ROLES = ["gm", "actor", "host", "technician", "other"] as const;
export const JOB_GENDERS = ["male", "female"] as const;
export const JOB_EMPLOYMENT = ["full", "part", "freelance", "seasonal"] as const;

const MAX_OPEN_PER_COMPANY = 10;
const MAX_LIST = 200;
const LIMITS = { title: 90, description: 3000, city: 60, email: 120, phone: 30 };

const postArgs = {
  title: v.string(),
  description: v.string(),
  roles: v.array(v.string()),
  genders: v.array(v.string()),
  employment: v.optional(v.string()),
  city: v.string(),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
};

type PostInput = {
  title: string;
  description: string;
  roles: string[];
  genders: string[];
  employment?: string;
  city: string;
  contactEmail?: string;
  contactPhone?: string;
};

const only = <T extends readonly string[]>(list: string[], allowed: T) =>
  [...new Set(list)].filter((x): x is T[number] => (allowed as readonly string[]).includes(x));

/** Trims and checks what the company typed; throws a readable error. */
function clean(input: PostInput, company: Doc<"companies">) {
  const title = input.title.trim();
  const description = input.description.trim();
  const city = (input.city.trim() || company.city || "").trim();
  const contactEmail = (input.contactEmail ?? "").trim().toLowerCase();
  const contactPhone = (input.contactPhone ?? "").trim();
  const roles = only(input.roles, JOB_ROLES);
  const genders = only(input.genders, JOB_GENDERS);
  const employment = input.employment && (JOB_EMPLOYMENT as readonly string[]).includes(input.employment) ? input.employment : undefined;

  if (title.length < 3 || title.length > LIMITS.title) throw new ConvexError(`The title needs 3 to ${LIMITS.title} characters.`);
  if (description.length < 20 || description.length > LIMITS.description) {
    throw new ConvexError(`The description needs 20 to ${LIMITS.description} characters.`);
  }
  if (roles.length === 0) throw new ConvexError("Pick at least one role.");
  if (city.length > LIMITS.city) throw new ConvexError("The city is too long.");
  if (contactEmail && (contactEmail.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
    throw new ConvexError("The contact email doesn't look right.");
  }
  if (contactPhone && (contactPhone.length > LIMITS.phone || !/^[+\d][\d\s().-]{5,}$/.test(contactPhone))) {
    throw new ConvexError("The contact phone doesn't look right.");
  }
  if (!contactEmail && !contactPhone) throw new ConvexError("Add an email or a phone so people can reach you.");
  // Genders: both ticked means anyone
  return {
    title,
    description,
    roles,
    genders: genders.length === JOB_GENDERS.length ? [] : genders,
    employment,
    city,
    contactEmail: contactEmail || undefined,
    contactPhone: contactPhone || undefined,
  };
}

async function ownPost(ctx: QueryCtx, company: Doc<"companies">, postId: Id<"jobPosts">) {
  const post = await ctx.db.get(postId);
  if (!post || post.companyId !== company._id) throw new ConvexError("Job ad not found.");
  return post;
}

async function openCount(ctx: QueryCtx, companyId: Id<"companies">) {
  const rows = await ctx.db.query("jobPosts").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(200);
  return rows.filter((r) => r.status === "open").length;
}

// ── Company portal ─────────────────────────────────────────

/** The company's own ads, newest first. */
export const mine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "jobs:mine");
    const rows = await ctx.db.query("jobPosts").withIndex("by_company", (q) => q.eq("companyId", company._id)).take(200);
    return {
      defaults: { city: company.city || "", contactEmail: company.email || "", contactPhone: company.phone || "" },
      posts: rows.sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

export const create = mutation({
  args: { sessionToken: v.string(), ...postArgs },
  handler: async (ctx, { sessionToken, ...input }) => {
    const company = await requireCompany(ctx, { sessionToken }, "jobs:create");
    const data = clean(input, company);
    if ((await openCount(ctx, company._id)) >= MAX_OPEN_PER_COMPANY) {
      throw new ConvexError(`You can have up to ${MAX_OPEN_PER_COMPANY} open job ads. Close an old one first.`);
    }
    await rateLimit(ctx, `jobPost:${company._id}`, 20, HOUR);
    const now = Date.now();
    return await ctx.db.insert("jobPosts", { companyId: company._id, ...data, status: "open", createdAt: now, updatedAt: now });
  },
});

export const update = mutation({
  args: { sessionToken: v.string(), postId: v.id("jobPosts"), ...postArgs },
  handler: async (ctx, { sessionToken, postId, ...input }) => {
    const company = await requireCompany(ctx, { sessionToken }, "jobs:update");
    await ownPost(ctx, company, postId);
    await rateLimit(ctx, `jobPostEdit:${company._id}`, 60, HOUR);
    await ctx.db.patch(postId, { ...clean(input, company), updatedAt: Date.now() });
  },
});

/** Close an ad (position filled) or open it again. */
export const setStatus = mutation({
  args: { sessionToken: v.string(), postId: v.id("jobPosts"), status: v.union(v.literal("open"), v.literal("closed")) },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "jobs:setStatus");
    const post = await ownPost(ctx, company, args.postId);
    if (post.status === args.status) return;
    if (args.status === "open" && (await openCount(ctx, company._id)) >= MAX_OPEN_PER_COMPANY) {
      throw new ConvexError(`You can have up to ${MAX_OPEN_PER_COMPANY} open job ads. Close an old one first.`);
    }
    await ctx.db.patch(args.postId, { status: args.status, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), postId: v.id("jobPosts") },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "jobs:remove");
    await ownPost(ctx, company, args.postId);
    await ctx.db.delete(args.postId);
  },
});

// ── Public ─────────────────────────────────────────────────

function publicPost(p: Doc<"jobPosts">, c: Doc<"companies">) {
  return {
    _id: p._id,
    title: p.title,
    description: p.description,
    roles: p.roles,
    genders: p.genders,
    employment: p.employment ?? "",
    city: p.city,
    contactEmail: p.contactEmail ?? "",
    contactPhone: p.contactPhone ?? "",
    createdAt: p.createdAt,
    company: { _id: c._id, name: c.name, logo: c.logo || "", city: c.city || "" },
  };
}

/** Every open ad of a public company, newest first (/jobs). */
export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db.query("jobPosts").withIndex("by_status", (q) => q.eq("status", "open")).order("desc").take(MAX_LIST);
    const companies = new Map<string, Doc<"companies"> | null>();
    const out: ReturnType<typeof publicPost>[] = [];
    for (const p of posts) {
      if (!companies.has(p.companyId)) companies.set(p.companyId, await ctx.db.get(p.companyId));
      const c = companies.get(p.companyId);
      if (c && companyIsPublic(c)) out.push(publicPost(p, c));
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** One company's open ads (its profile page). */
export const byCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.companyId);
    if (!c || !companyIsPublic(c)) return [];
    const rows = await ctx.db.query("jobPosts").withIndex("by_company", (q) => q.eq("companyId", c._id)).take(200);
    return rows
      .filter((p) => p.status === "open")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => publicPost(p, c));
  },
});
