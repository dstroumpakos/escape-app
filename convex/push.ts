import { ConvexError, v } from "convex/values";
import { mutation, internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUser } from "./userSession";
import { requireCompany } from "./companySession";
import { rateLimit, MINUTE } from "./rateLimit";
import { nt } from "./notificationTexts";

/**
 * Push notifications to phones (Expo push service).
 *
 * The app registers its Expo push token after login (registerPlayer /
 * registerCompany) and removes it on logout (unregister). Everything the
 * server tells a player goes through notifyUser: it saves the in-app
 * notification and sends the push, unless the player turned that kind off in
 * the app's notification settings.
 *
 * Optional Convex env: EXPO_ACCESS_TOKEN (if "enhanced push security" is on
 * in the Expo project).
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_TOKENS_PER_OWNER = 10;

/** The app's notification settings. Types not listed here are always sent. */
export const PUSH_CATEGORIES = [
  "bookingConfirmations",
  "bookingReminders",
  "newRooms",
  "promotions",
  "slotAlerts",
  "systemUpdates",
] as const;
type Category = (typeof PUSH_CATEGORIES)[number];
// Promotions need an explicit opt-in (App Store guideline 4.5.4).
const DEFAULT_MUTED: Category[] = ["promotions"];

const categoryOf: Record<string, Category | undefined> = {
  booking: "bookingConfirmations",
  cancelled: "bookingConfirmations",
  reminder: "bookingReminders",
  new_room: "newRooms",
  promo: "promotions",
  slot_available: "slotAlerts",
  system: "systemUpdates",
  photos_ready: "systemUpdates",
  // friend_request, friend_accepted, booking_invite: always sent
};

function validToken(t: string): boolean {
  return (
    t.length < 200 &&
    (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")) &&
    t.endsWith("]")
  );
}

function cleanMuted(muted: string[] | undefined): string[] {
  if (!muted) return DEFAULT_MUTED;
  return muted.filter((m) => (PUSH_CATEGORIES as readonly string[]).includes(m));
}

const platformV = v.union(v.literal("ios"), v.literal("android"));

async function saveToken(
  ctx: MutationCtx,
  owner: { userId?: Id<"users">; companyId?: Id<"companies"> },
  token: string,
  platform: "ios" | "android",
  muted: string[] | undefined
) {
  if (!validToken(token)) throw new ConvexError("Invalid push token");
  const now = Date.now();
  const existing = await ctx.db
    .query("pushTokens")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  // A phone has at most one player and one company signed in. Logging in on
  // a phone moves that role's pushes to the new account; the other role stays.
  if (existing) {
    await ctx.db.replace(existing._id, {
      token,
      platform,
      userId: owner.userId ?? (owner.companyId ? existing.userId : undefined),
      companyId: owner.companyId ?? (owner.userId ? existing.companyId : undefined),
      muted: owner.userId ? cleanMuted(muted) : existing.muted,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("pushTokens", {
      token,
      platform,
      userId: owner.userId,
      companyId: owner.companyId,
      muted: owner.userId ? cleanMuted(muted) : DEFAULT_MUTED,
      updatedAt: now,
    });
  }
  // Keep only the newest few phones per account.
  const all = owner.userId
    ? await ctx.db.query("pushTokens").withIndex("by_user", (q) => q.eq("userId", owner.userId)).collect()
    : await ctx.db.query("pushTokens").withIndex("by_company", (q) => q.eq("companyId", owner.companyId)).collect();
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  for (const old of all.slice(MAX_TOKENS_PER_OWNER)) await dropRole(ctx, old, owner.userId ? "player" : "company");
}

export const registerPlayer = mutation({
  args: {
    sessionToken: v.string(),
    token: v.string(),
    platform: platformV,
    muted: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    await rateLimit(ctx, `pushRegister:${user._id}`, 30, 10 * MINUTE);
    await saveToken(ctx, { userId: user._id }, args.token, args.platform, args.muted);
  },
});

export const registerCompany = mutation({
  args: { sessionToken: v.string(), token: v.string(), platform: platformV },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, { sessionToken: args.sessionToken }, "push:registerCompany");
    await rateLimit(ctx, `pushRegister:${company._id}`, 30, 10 * MINUTE);
    // Companies get everything about their bookings.
    await saveToken(ctx, { companyId: company._id }, args.token, args.platform, []);
  },
});

/** Stops one role's pushes to a phone; deletes the row when no role is left. */
async function dropRole(ctx: MutationCtx, row: Doc<"pushTokens">, role: "player" | "company") {
  const userId = role === "player" ? undefined : row.userId;
  const companyId = role === "company" ? undefined : row.companyId;
  if (!userId && !companyId) await ctx.db.delete(row._id);
  else await ctx.db.patch(row._id, { userId, companyId });
}

/** On logout. Knowing the token is enough: it only stops pushes to that phone. */
export const unregister = mutation({
  args: { token: v.string(), role: v.optional(v.union(v.literal("player"), v.literal("company"))) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!row) return;
    if (args.role) await dropRole(ctx, row, args.role);
    else await ctx.db.delete(row._id);
  },
});

/** After a password reset or account deletion: no more pushes to old phones. */
export async function removeOwnerTokens(
  ctx: MutationCtx,
  owner: { userId?: Id<"users">; companyId?: Id<"companies"> }
) {
  const rows = owner.userId
    ? await ctx.db.query("pushTokens").withIndex("by_user", (q) => q.eq("userId", owner.userId)).collect()
    : owner.companyId
      ? await ctx.db.query("pushTokens").withIndex("by_company", (q) => q.eq("companyId", owner.companyId)).collect()
      : [];
  for (const r of rows) await dropRole(ctx, r, owner.userId ? "player" : "company");
}

// ─── Sending ───────────────────────────────────────────────

type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

async function queue(ctx: MutationCtx, tokens: Doc<"pushTokens">[], msg: PushMessage) {
  if (tokens.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.push.send, {
    messages: tokens.map((t) => ({
      to: t.token,
      title: msg.title.slice(0, 200),
      body: msg.body.slice(0, 1000),
      data: msg.data ?? {},
    })),
  });
}

/** Push to a player's phones, unless they turned that kind of notification off. */
export async function pushToUser(ctx: MutationCtx, userId: Id<"users">, type: string, msg: PushMessage) {
  const category = categoryOf[type];
  const tokens = (
    await ctx.db.query("pushTokens").withIndex("by_user", (q) => q.eq("userId", userId)).collect()
  ).filter((t) => !category || !t.muted.includes(category));
  await queue(ctx, tokens, msg);
}

export async function pushToCompany(ctx: MutationCtx, companyId: Id<"companies">, msg: PushMessage) {
  const tokens = await ctx.db
    .query("pushTokens")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  await queue(ctx, tokens, msg);
}

/**
 * Saves an in-app notification and pushes it to the player's phones.
 * Takes the same fields as ctx.db.insert("notifications", ...).
 */
export async function notifyUser(
  ctx: MutationCtx,
  row: Omit<Doc<"notifications">, "_id" | "_creationTime">,
  opts: { skipInForeground?: boolean } = {}
) {
  const id = await ctx.db.insert("notifications", row);
  await pushToUser(ctx, row.userId, row.type, {
    title: row.title,
    body: row.message,
    data: {
      ...(row.data && typeof row.data === "object" ? row.data : {}),
      type: row.type,
      notificationId: id,
      // The app already shows these itself while open (useNotificationWatcher).
      skipInForeground: opts.skipInForeground === true,
    },
  });
  return id;
}

/** New or cancelled booking: tell the company's phones. */
export async function pushBookingToCompany(
  ctx: MutationCtx,
  booking: { companyId?: Id<"companies">; roomId: Id<"rooms">; date: string; time: string; players: number },
  kind: "new" | "cancelled"
) {
  if (!booking.companyId) return;
  const company = await ctx.db.get(booking.companyId);
  if (!company) return;
  const room = await ctx.db.get(booking.roomId);
  const lang = (company as any).language;
  const vars = {
    room: room?.title ?? "Escape room",
    date: booking.date,
    time: booking.time,
    players: String(booking.players),
  };
  await pushToCompany(ctx, company._id, {
    title: nt(lang, `company_${kind}.title`, vars),
    body: nt(lang, `company_${kind}.message`, vars),
    data: { type: `company_booking_${kind}`, skipInForeground: true },
  });
}

/**
 * A booked time became free again: tell everyone who asked to be told
 * (in-app + push + email), once.
 */
export async function slotFreed(ctx: MutationCtx, roomId: Id<"rooms">, date: string, time: string) {
  const sameDay = await ctx.db
    .query("bookings")
    .withIndex("by_room_date", (q) => q.eq("roomId", roomId).eq("date", date))
    .collect();
  if (sameDay.some((b) => b.time === time && b.status !== "cancelled")) return;

  const room = await ctx.db.get(roomId);
  const alerts = await ctx.db
    .query("slotAlerts")
    .withIndex("by_slot", (q) => q.eq("roomId", roomId).eq("date", date).eq("time", time))
    .collect();
  for (const alert of alerts) {
    if (alert.notified) continue;
    await ctx.db.patch(alert._id, { notified: true });
    const user = await ctx.db.get(alert.userId);
    if (!user || !room) continue;
    const lang = (user as any).language;
    await notifyUser(
      ctx,
      {
        userId: user._id,
        type: "slot_available",
        title: nt(lang, "slot_available.title"),
        message: nt(lang, "slot_available.message", { room: room.title, date, time }),
        read: false,
        createdAt: Date.now(),
        data: { roomId, date, time },
      },
      { skipInForeground: true }
    );
    if (user.email) {
      await ctx.scheduler.runAfter(0, internal.email.sendSlotAvailableEmail, {
        playerName: user.name || "Player",
        playerEmail: user.email,
        roomTitle: room.title,
        date,
        time,
        roomId,
        lang: lang || "en",
      });
    }
  }

  // Widget (guest) alerts are emailed elsewhere; just mark them.
  const guestAlerts = await ctx.db
    .query("guestSlotAlerts")
    .withIndex("by_slot", (q) => q.eq("roomId", roomId).eq("date", date).eq("time", time))
    .collect();
  for (const ga of guestAlerts) {
    if (!ga.notified) await ctx.db.patch(ga._id, { notified: true });
  }
}

/** Sends to Expo in batches of 100 and forgets phones Expo says are gone. */
export const send = internalAction({
  args: {
    messages: v.array(
      v.object({ to: v.string(), title: v.string(), body: v.string(), data: v.any() })
    ),
  },
  handler: async (ctx, args) => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const gone: string[] = [];
    for (let i = 0; i < args.messages.length; i += 100) {
      const batch = args.messages.slice(i, i + 100).map((m) => ({ ...m, sound: "default" }));
      try {
        const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(batch) });
        if (!res.ok) {
          console.error("[push] Expo answered", res.status);
          continue;
        }
        const json: any = await res.json();
        const tickets: any[] = Array.isArray(json?.data) ? json.data : [];
        tickets.forEach((t, j) => {
          if (t?.status === "error" && t?.details?.error === "DeviceNotRegistered") gone.push(batch[j].to);
          else if (t?.status === "error") console.warn("[push] ticket error", t?.details?.error ?? t?.message);
        });
      } catch (e) {
        console.error("[push] send failed", e);
      }
    }
    if (gone.length > 0) await ctx.runMutation(internal.push.forgetTokens, { tokens: gone });
  },
});

export const forgetTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const token of args.tokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (row) await ctx.db.delete(row._id);
    }
  },
});
