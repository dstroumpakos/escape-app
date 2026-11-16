import { ConvexError, v } from "convex/values";
import { removeOwnerTokens } from "./push";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { rateLimit, HOUR, MINUTE } from "./rateLimit";
import { hashPassword, verifyPassword } from "./passwordUtils";
import { validatePassword } from "./validation";
import { requireUser } from "./userSession";
import { requireCompany, sessionTokenV } from "./companySession";

// ═══════════════════════════════════════════════════════════════════════
// Forgot password (6-digit email code) and change password
// ═══════════════════════════════════════════════════════════════════════
// - start: always answers { ok: true }, so it can't be used to find out
//   which emails have an account. A code is only sent if one exists.
// - finish: right code + new password. Every session of that account is
//   signed out and any login lockout is cleared.
// - change*: logged in, needs the current password; other devices are
//   signed out, this one stays.

const kindV = v.union(v.literal("player"), v.literal("company"));
type Kind = "player" | "company";

const CODE_TTL_MS = 15 * MINUTE;
const MAX_TRIES = 5;

function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

async function hashCode(code: string, kind: Kind, email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`reset:${kind}:${email}:${code}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function findAccount(
  ctx: MutationCtx,
  kind: Kind,
  email: string
): Promise<{ id: Id<"users"> | Id<"companies">; lang?: string } | null> {
  if (kind === "player") {
    const u = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    return u ? { id: u._id, lang: u.language } : null;
  }
  const c = await ctx.db
    .query("companies")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return c ? { id: c._id } : null;
}

function passwordErrorCode(pw: string): string | null {
  const e = validatePassword(pw);
  if (!e) return null;
  if (e.includes("8 characters")) return "PASSWORD_LENGTH";
  if (e.includes("uppercase")) return "PASSWORD_UPPERCASE";
  if (e.includes("number")) return "PASSWORD_NUMBER";
  return "PASSWORD_INVALID";
}

/** Signs out every session of the account, except `keepTokenHash` if given. */
async function signOutEverywhere(ctx: MutationCtx, kind: Kind, id: string, keepSessionId?: string) {
  // Phones that were signed in stop getting pushes too (the current one registers again).
  await removeOwnerTokens(ctx, kind === "player" ? { userId: id as Id<"users"> } : { companyId: id as Id<"companies"> });
  if (kind === "player") {
    const rows = await ctx.db
      .query("userSessions")
      .withIndex("by_user", (q) => q.eq("userId", id as Id<"users">))
      .collect();
    for (const r of rows) if (r._id !== keepSessionId) await ctx.db.delete(r._id);
  } else {
    const rows = await ctx.db
      .query("companySessions")
      .withIndex("by_company", (q) => q.eq("companyId", id as Id<"companies">))
      .collect();
    for (const r of rows) if (r._id !== keepSessionId) await ctx.db.delete(r._id);
  }
}

async function clearLoginLock(ctx: MutationCtx, kind: Kind, email: string) {
  const key = kind === "player" ? email : `company:${email}`;
  const row = await ctx.db
    .query("loginAttempts")
    .withIndex("by_email", (q) => q.eq("email", key))
    .first();
  if (row) await ctx.db.delete(row._id);
}

async function setPassword(ctx: MutationCtx, kind: Kind, id: string, newPassword: string) {
  const hashed = await hashPassword(newPassword);
  if (kind === "player") await ctx.db.patch(id as Id<"users">, { password: hashed });
  else await ctx.db.patch(id as Id<"companies">, { password: hashed });
}

/** Step 1: email a code (only if the account exists; same answer either way). */
export const start = mutation({
  args: { kind: kindV, email: v.string(), lang: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email || email.length > 200) return { ok: true };
    // Limits who can be emailed, and how often, before we even look.
    await rateLimit(ctx, `resetCode:${args.kind}:${email}`, 5, HOUR);
    await rateLimit(ctx, "emails:resetCode", 300, HOUR); // site-wide cap
    const account = await findAccount(ctx, args.kind, email);
    if (!account) return { ok: true };

    const code = newCode();
    const old = await ctx.db
      .query("passwordResets")
      .withIndex("by_kind_email", (q) => q.eq("kind", args.kind).eq("email", email))
      .first();
    if (old) await ctx.db.delete(old._id);
    await ctx.db.insert("passwordResets", {
      kind: args.kind,
      email,
      codeHash: await hashCode(code, args.kind, email),
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    });
    await ctx.scheduler.runAfter(0, internal.email.sendSignupCode, {
      to: email,
      code,
      lang: args.lang ?? account.lang,
      kind: args.kind,
      purpose: "reset",
    });
    return { ok: true };
  },
});

/**
 * Step 2: code + new password. Returns { ok: true } or { error } (returned,
 * not thrown, so a wrong code is counted).
 */
export const finish = mutation({
  args: { kind: kindV, email: v.string(), code: v.string(), newPassword: v.string() },
  handler: async (ctx, args): Promise<{ ok: true } | { error: string }> => {
    const email = args.email.trim().toLowerCase();
    const pwError = passwordErrorCode(args.newPassword);
    if (pwError) return { error: pwError };

    const row = await ctx.db
      .query("passwordResets")
      .withIndex("by_kind_email", (q) => q.eq("kind", args.kind).eq("email", email))
      .first();
    if (!row || row.expiresAt < Date.now()) return { error: "CODE_EXPIRED" };
    if (row.attempts >= MAX_TRIES) return { error: "TOO_MANY_ATTEMPTS" };
    const code = args.code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(code) || (await hashCode(code, args.kind, email)) !== row.codeHash) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      return { error: row.attempts + 1 >= MAX_TRIES ? "TOO_MANY_ATTEMPTS" : "CODE_INVALID" };
    }
    await ctx.db.delete(row._id);

    const account = await findAccount(ctx, args.kind, email);
    if (!account) return { error: "CODE_EXPIRED" };
    await setPassword(ctx, args.kind, account.id, args.newPassword);
    // Whoever had the old password is signed out everywhere.
    await signOutEverywhere(ctx, args.kind, account.id);
    await clearLoginLock(ctx, args.kind, email);
    return { ok: true };
  },
});

async function checkCurrent(
  ctx: MutationCtx,
  key: string,
  stored: string | undefined,
  current: string
): Promise<string | null> {
  await rateLimit(ctx, key, 10, HOUR);
  if (!stored || !(await verifyPassword(current, stored))) return "WRONG_PASSWORD";
  return null;
}

async function currentSessionId(ctx: MutationCtx, table: "userSessions" | "companySessions", token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const row = await ctx.db
    .query(table)
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  return row?._id as string | undefined;
}

/** Logged-in player: change password. Other devices are signed out. */
export const changePlayerPassword = mutation({
  args: { sessionToken: v.string(), currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, args): Promise<{ ok: true } | { error: string }> => {
    const user: Doc<"users"> = await requireUser(ctx, args.sessionToken);
    const wrong = await checkCurrent(ctx, `changePw:user:${user._id}`, user.password, args.currentPassword);
    if (wrong) return { error: wrong };
    const pwError = passwordErrorCode(args.newPassword);
    if (pwError) return { error: pwError };
    await setPassword(ctx, "player", user._id, args.newPassword);
    await signOutEverywhere(ctx, "player", user._id, await currentSessionId(ctx, "userSessions", args.sessionToken));
    return { ok: true };
  },
});

/** Logged-in company: change password. Other devices are signed out. */
export const changeCompanyPassword = mutation({
  args: { sessionToken: sessionTokenV, currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, args): Promise<{ ok: true } | { error: string }> => {
    if (!args.sessionToken) throw new ConvexError("Your session has expired. Please log in again.");
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "passwordReset:changeCompanyPassword");
    const wrong = await checkCurrent(ctx, `changePw:company:${company._id}`, company.password, args.currentPassword);
    if (wrong) return { error: wrong };
    const pwError = passwordErrorCode(args.newPassword);
    if (pwError) return { error: pwError };
    await setPassword(ctx, "company", company._id, args.newPassword);
    await signOutEverywhere(ctx, "company", company._id, await currentSessionId(ctx, "companySessions", args.sessionToken));
    return { ok: true };
  },
});
