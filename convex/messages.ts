import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser, optionalUser } from "./userSession";
import { rateLimit, HOUR, MINUTE } from "./rateLimit";
import { filterContent } from "./moderation";
import { avatarUrl } from "./avatars";
import { areConnected, follows } from "./connections";

// ═══════════════════════════════════════════════════════════════════════
// Encrypted chat: direct messages and groups
// ═══════════════════════════════════════════════════════════════════════
// End-to-end encrypted. The server never sees a message or a key:
//
//  - Every device (browser or phone) makes an ECDH P-256 key pair. The private
//    key never leaves the device; the public key is registered here.
//  - Every conversation has a random AES-256-GCM key. The member who makes it
//    encrypts ("wraps") it for each member device with ECDH + HKDF + AES-GCM
//    and uploads only those wrapped copies (conversationKeys).
//  - Messages are encrypted on the device with the conversation key. The
//    server stores ciphertext and checks only who may read and write.
//  - When members are added or removed, the conversation is flagged
//    needsRotation and nobody can send until a member's device makes a new
//    key. Removed members never get the new key; new members never get old ones.
//  - A member's new device (a new browser) gets the keys from any other member
//    device that opens the chat (shareKeys).
//
// The client side is src/lib/chatCrypto.ts on the website.
// Not encrypted: group names, who is in a chat, and when messages were sent.

const MAX_DEVICES_PER_USER = 10;
const MAX_GROUP_MEMBERS = 50;
const MAX_GROUP_NAME = 60;
const MAX_CIPHERTEXT = 16_384; // base64; the site caps a message at 2000 characters
const MAX_WRAPS = MAX_GROUP_MEMBERS * MAX_DEVICES_PER_USER;
const MAX_CONVERSATIONS = 200;

/** Clients match on these to fetch the key state again and retry. */
const KEY_CHANGED = "KEY_CHANGED";
const DEVICES_CHANGED = "DEVICES_CHANGED";

// ─── Validation ───────────────────────────────────────────────────────

const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const B64URL = /^[A-Za-z0-9_-]{20,64}$/;

function assertB64(s: string, max: number, what: string) {
  if (!s || s.length > max || !B64.test(s)) throw new ConvexError(`Invalid ${what}`);
}

function assertDeviceId(id: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new ConvexError("Invalid device");
}

/** A public ECDH P-256 key as JWK. Never a private key ("d"). */
function assertPublicJwk(s: string) {
  if (s.length > 400) throw new ConvexError("Invalid key");
  let k: any;
  try {
    k = JSON.parse(s);
  } catch {
    throw new ConvexError("Invalid key");
  }
  if (
    !k || typeof k !== "object" || k.kty !== "EC" || k.crv !== "P-256" ||
    typeof k.x !== "string" || typeof k.y !== "string" ||
    !B64URL.test(k.x) || !B64URL.test(k.y) || "d" in k
  ) {
    throw new ConvexError("Invalid key");
  }
}

const wrapV = v.object({
  userId: v.id("users"),
  deviceId: v.string(),
  ephemeralPublicKey: v.string(),
  iv: v.string(),
  wrappedKey: v.string(),
});

function assertWrap(w: { deviceId: string; ephemeralPublicKey: string; iv: string; wrappedKey: string }) {
  assertDeviceId(w.deviceId);
  assertPublicJwk(w.ephemeralPublicKey);
  assertB64(w.iv, 24, "iv");
  assertB64(w.wrappedKey, 128, "key");
}

// ─── Helpers ──────────────────────────────────────────────────────────

type Ctx = QueryCtx | MutationCtx;

async function getMember(ctx: Ctx, conversationId: Id<"conversations">, userId: Id<"users">) {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation_user", (q) => q.eq("conversationId", conversationId).eq("userId", userId))
    .first();
}

/** The conversation and the caller's membership, or throws (same error whether it exists or not). */
async function requireMember(ctx: Ctx, conversationId: Id<"conversations">, userId: Id<"users">) {
  const [conv, member] = await Promise.all([ctx.db.get(conversationId), getMember(ctx, conversationId, userId)]);
  if (!conv || !member) throw new ConvexError("Chat not found");
  return { conv, member };
}

async function members(ctx: Ctx, conversationId: Id<"conversations">) {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .collect();
}

/** True if either player blocked the other. */
async function blockedEitherWay(ctx: Ctx, a: Id<"users">, b: Id<"users">): Promise<boolean> {
  const [x, y] = await Promise.all([
    ctx.db.query("blockedUsers").withIndex("by_blocker_blocked", (q) => q.eq("blockerId", a).eq("blockedUserId", b)).first(),
    ctx.db.query("blockedUsers").withIndex("by_blocker_blocked", (q) => q.eq("blockerId", b).eq("blockedUserId", a)).first(),
  ]);
  return !!(x || y);
}

async function devicesOf(ctx: Ctx, userId: Id<"users">) {
  return await ctx.db.query("chatDevices").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
}

/** Deletes every wrapped key a player's devices hold for one conversation. */
async function deleteUserKeys(ctx: MutationCtx, conversationId: Id<"conversations">, userId: Id<"users">) {
  for (const d of await devicesOf(ctx, userId)) {
    const rows = await ctx.db
      .query("conversationKeys")
      .withIndex("by_device", (q) => q.eq("userId", userId).eq("deviceId", d.deviceId).eq("conversationId", conversationId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  }
}

async function addEvent(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  senderId: Id<"users">,
  type: "created" | "added" | "removed" | "left" | "renamed",
  userIds?: Id<"users">[]
) {
  const now = Date.now();
  await ctx.db.insert("chatMessages", {
    conversationId,
    senderId,
    kind: "event",
    event: { type, userIds },
    createdAt: now,
  });
  await ctx.db.patch(conversationId, { lastMessageAt: now });
}

/** Removes one member. Deletes the chat when nobody is left; otherwise a new key is needed. */
async function dropMember(ctx: MutationCtx, conv: Doc<"conversations">, member: Doc<"conversationMembers">) {
  await ctx.db.delete(member._id);
  await deleteUserKeys(ctx, conv._id, member.userId);
  const rest = await members(ctx, conv._id);
  if (rest.length === 0) {
    await deleteConversation(ctx, conv._id);
    return false;
  }
  if (!rest.some((m) => m.role === "admin")) {
    const oldest = rest.reduce((a, b) => (a.joinedAt <= b.joinedAt ? a : b));
    await ctx.db.patch(oldest._id, { role: "admin" });
  }
  await ctx.db.patch(conv._id, { needsRotation: true });
  return true;
}

async function deleteConversation(ctx: MutationCtx, conversationId: Id<"conversations">) {
  const msgs = await ctx.db
    .query("chatMessages")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .take(4000);
  for (const m of msgs) await ctx.db.delete(m._id);
  const keys = await ctx.db
    .query("conversationKeys")
    .withIndex("by_conversation_version", (q) => q.eq("conversationId", conversationId))
    .take(4000);
  for (const k of keys) await ctx.db.delete(k._id);
  for (const m of await members(ctx, conversationId)) await ctx.db.delete(m._id);
  await ctx.db.delete(conversationId);
}

function cleanGroupName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Give the group a name.");
  if (name.length > MAX_GROUP_NAME) throw new ConvexError(`The group name can be at most ${MAX_GROUP_NAME} characters.`);
  if (filterContent(name)) throw new ConvexError("The group name contains inappropriate language.");
  return name;
}

async function publicUser(ctx: Ctx, userId: Id<"users">) {
  const u = await ctx.db.get(userId);
  return { _id: userId, name: u?.name ?? "", avatar: await avatarUrl(ctx, u), deleted: !u };
}

// ─── Devices ──────────────────────────────────────────────────────────

/** Registers (or refreshes) this device's public key. */
export const registerDevice = mutation({
  args: { sessionToken: v.string(), deviceId: v.string(), publicKey: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    assertDeviceId(args.deviceId);
    assertPublicJwk(args.publicKey);
    const now = Date.now();
    const existing = await ctx.db
      .query("chatDevices")
      .withIndex("by_user_device", (q) => q.eq("userId", me._id).eq("deviceId", args.deviceId))
      .first();
    if (existing) {
      if (existing.publicKey === args.publicKey) {
        if (now - existing.lastSeenAt > HOUR * 24) await ctx.db.patch(existing._id, { lastSeenAt: now });
        return null;
      }
      // Same device, new key (its storage was reset): its old wrapped keys are useless.
      const old = await ctx.db
        .query("conversationKeys")
        .withIndex("by_device", (q) => q.eq("userId", me._id).eq("deviceId", args.deviceId))
        .collect();
      for (const k of old) await ctx.db.delete(k._id);
      await ctx.db.patch(existing._id, { publicKey: args.publicKey, lastSeenAt: now });
      return null;
    }

    await rateLimit(ctx, `chat:device:${me._id}`, 20, HOUR);
    await ctx.db.insert("chatDevices", {
      userId: me._id,
      deviceId: args.deviceId,
      publicKey: args.publicKey,
      createdAt: now,
      lastSeenAt: now,
    });
    // Keep the newest devices only.
    const all = await devicesOf(ctx, me._id);
    if (all.length > MAX_DEVICES_PER_USER) {
      const stale = all.sort((a, b) => a.lastSeenAt - b.lastSeenAt).slice(0, all.length - MAX_DEVICES_PER_USER);
      for (const d of stale) {
        const keys = await ctx.db
          .query("conversationKeys")
          .withIndex("by_device", (q) => q.eq("userId", me._id).eq("deviceId", d.deviceId))
          .collect();
        for (const k of keys) await ctx.db.delete(k._id);
        await ctx.db.delete(d._id);
      }
    }
    return null;
  },
});

// ─── Conversations ───────────────────────────────────────────────────

/**
 * Opens the direct chat with a player (creates it the first time). Anyone can
 * write to anyone they haven't blocked; if the other player doesn't follow you
 * (and you aren't connected), the chat waits in their Requests until they accept.
 */
export const startDirect = mutation({
  args: { sessionToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    if (args.userId === me._id) throw new ConvexError("You can't message yourself.");
    const other = await ctx.db.get(args.userId);
    if (!other) throw new ConvexError("Player not found");
    if (await blockedEitherWay(ctx, me._id, other._id)) throw new ConvexError("You can't message this player.");

    const directKey = [me._id, other._id].sort().join(":");
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_direct_key", (q) => q.eq("directKey", directKey))
      .first();
    if (existing) {
      // A player who deleted their account and came back... or a member row
      // lost: put both back in.
      for (const uid of [me._id, other._id]) {
        if (!(await getMember(ctx, existing._id, uid))) {
          const now = Date.now();
          await ctx.db.insert("conversationMembers", {
            conversationId: existing._id,
            userId: uid,
            role: "admin",
            fromKeyVersion: existing.keyVersion + 1,
            joinedAt: now,
            lastReadAt: now,
          });
          await ctx.db.patch(existing._id, { needsRotation: true });
        }
      }
      // I chose to write to them myself: any request of mine in this chat is accepted
      const myRow = await getMember(ctx, existing._id, me._id);
      if (myRow?.request) await ctx.db.patch(myRow._id, { request: undefined });
      // They follow me now: an open or turned-down request of theirs becomes a normal chat
      const theirs = await getMember(ctx, existing._id, other._id);
      if (theirs?.request && (await follows(ctx, other._id, me._id))) await ctx.db.patch(theirs._id, { request: undefined });
      return existing._id;
    }

    await rateLimit(ctx, `chat:start:${me._id}`, 60, HOUR);
    const asRequest = !(await follows(ctx, other._id, me._id)) && !(await areConnected(ctx, me._id, other._id));
    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      kind: "direct",
      directKey,
      createdBy: me._id,
      keyVersion: 0,
      needsRotation: true,
      lastMessageAt: now,
      createdAt: now,
    });
    for (const uid of [me._id, other._id]) {
      await ctx.db.insert("conversationMembers", {
        conversationId: id,
        userId: uid,
        role: "admin",
        fromKeyVersion: 1,
        joinedAt: now,
        lastReadAt: now,
        ...(uid === other._id && asRequest ? { request: "pending" as const } : {}),
      });
    }
    return id;
  },
});

/** Creates a group with some of your friends. */
export const createGroup = mutation({
  args: { sessionToken: v.string(), name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const name = cleanGroupName(args.name);
    const others = [...new Set(args.memberIds.filter((id) => id !== me._id))];
    if (others.length === 0) throw new ConvexError("Add at least one player.");
    if (others.length + 1 > MAX_GROUP_MEMBERS) throw new ConvexError(`A group can have at most ${MAX_GROUP_MEMBERS} members.`);
    for (const id of others) {
      if (!(await areConnected(ctx, me._id, id))) throw new ConvexError("You can add players you follow each other with only.");
    }
    await rateLimit(ctx, `chat:group:${me._id}`, 20, HOUR);

    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      kind: "group",
      name,
      createdBy: me._id,
      keyVersion: 0,
      needsRotation: true,
      lastMessageAt: now,
      createdAt: now,
    });
    for (const uid of [me._id, ...others]) {
      await ctx.db.insert("conversationMembers", {
        conversationId: id,
        userId: uid,
        role: uid === me._id ? "admin" : "member",
        fromKeyVersion: 1,
        joinedAt: now,
        lastReadAt: now,
      });
    }
    await addEvent(ctx, id, me._id, "created", others);
    return id;
  },
});

/**
 * My chats, newest first, with the last message (still encrypted) and this
 * device's wrapped key for it, so the list can show a preview.
 */
export const listConversations = query({
  args: { sessionToken: v.optional(v.string()), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return [];
    const mine = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .take(MAX_CONVERSATIONS);

    const rows = await Promise.all(
      mine.map(async (m) => {
        if (m.request === "declined") return null;
        const conv = await ctx.db.get(m.conversationId);
        if (!conv) return null;
        const all = await members(ctx, conv._id);
        const last = await ctx.db
          .query("chatMessages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id).gte("createdAt", m.joinedAt))
          .order("desc")
          .first();
        const unreadRows = await ctx.db
          .query("chatMessages")
          .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id).gt("createdAt", m.lastReadAt))
          .take(100);
        const unread = unreadRows.filter((r) => r.senderId !== me._id && r.kind === "text").length;

        let lastKey = null;
        if (last?.kind === "text" && args.deviceId && last.keyVersion) {
          const deviceId = args.deviceId;
          const k = await ctx.db
            .query("conversationKeys")
            .withIndex("by_device", (q) => q.eq("userId", me._id).eq("deviceId", deviceId).eq("conversationId", conv._id))
            .filter((q) => q.eq(q.field("keyVersion"), last.keyVersion!))
            .first();
          if (k) lastKey = { keyVersion: k.keyVersion, ephemeralPublicKey: k.ephemeralPublicKey, iv: k.iv, wrappedKey: k.wrappedKey };
        }

        const other = conv.kind === "direct" ? all.find((x) => x.userId !== me._id) : null;
        const otherUser = other ? await publicUser(ctx, other.userId) : null;
        return {
          _id: conv._id,
          kind: conv.kind,
          name: conv.kind === "group" ? conv.name ?? "" : otherUser?.name ?? "",
          avatar: otherUser?.avatar ?? "",
          otherUserId: otherUser?._id ?? null,
          memberCount: all.length,
          lastMessageAt: conv.lastMessageAt,
          unread,
          // "pending": someone I don't follow wrote to me (Requests tab)
          request: m.request ?? null,
          // I wrote to someone who hasn't accepted yet
          awaiting: other?.request === "pending",
          lastMessage: last
            ? {
                senderId: last.senderId,
                kind: last.kind,
                event: last.event ?? null,
                keyVersion: last.keyVersion ?? null,
                iv: last.iv ?? null,
                ciphertext: last.ciphertext ?? null,
              }
            : null,
          lastKey,
        };
      })
    );
    return rows
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  },
});

/** How many chats have messages I haven't read (the badge in the menu). */
export const unreadCount = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return 0;
    const mine = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .take(MAX_CONVERSATIONS);
    let n = 0;
    for (const m of mine) {
      if (m.request === "declined") continue;
      const newer = await ctx.db
        .query("chatMessages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", m.conversationId).gt("createdAt", m.lastReadAt))
        .filter((q) => q.and(q.neq(q.field("senderId"), me._id), q.eq(q.field("kind"), "text")))
        .first();
      if (newer) n++;
    }
    return n;
  },
});

/** One chat: its name, members and my role. Null if I'm not in it. */
export const getConversation = query({
  args: { sessionToken: v.optional(v.string()), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return null;
    const conv = await ctx.db.get(args.conversationId);
    const mine = conv ? await getMember(ctx, conv._id, me._id) : null;
    if (!conv || !mine) return null;
    const all = await members(ctx, conv._id);
    const people = await Promise.all(
      all.map(async (m) => ({ ...(await publicUser(ctx, m.userId)), role: m.role, isMe: m.userId === me._id }))
    );
    const other = conv.kind === "direct" ? people.find((p) => !p.isMe) ?? null : null;
    const otherRow = conv.kind === "direct" ? all.find((m) => m.userId !== me._id) : undefined;
    return {
      request: mine.request ?? null,
      awaiting: otherRow?.request === "pending",
      _id: conv._id,
      kind: conv.kind,
      name: conv.kind === "group" ? conv.name ?? "" : other?.name ?? "",
      avatar: other?.avatar ?? "",
      otherUserId: other?._id ?? null,
      blocked: other ? await blockedEitherWay(ctx, me._id, other._id) : false,
      myRole: mine.role,
      members: people,
    };
  },
});

// ─── Keys ─────────────────────────────────────────────────────────────

/**
 * Everything a device needs to read and write in a chat: its own wrapped keys,
 * the public keys of every member device (to make a new key), and which member
 * devices are still missing a key (to share it with them).
 */
export const keyState = query({
  args: { sessionToken: v.optional(v.string()), conversationId: v.id("conversations"), deviceId: v.string() },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return null;
    const conv = await ctx.db.get(args.conversationId);
    const mine = conv ? await getMember(ctx, conv._id, me._id) : null;
    if (!conv || !mine) return null;

    const all = await members(ctx, conv._id);
    const devices = (
      await Promise.all(
        all.map(async (m) =>
          (await devicesOf(ctx, m.userId)).map((d) => ({
            userId: m.userId,
            deviceId: d.deviceId,
            publicKey: d.publicKey,
            fromKeyVersion: m.fromKeyVersion,
          }))
        )
      )
    ).flat();

    const keys = conv.keyVersion
      ? await ctx.db
          .query("conversationKeys")
          .withIndex("by_conversation_version", (q) => q.eq("conversationId", conv._id).gte("keyVersion", 1))
          .collect()
      : [];
    const have = new Set(keys.map((k) => `${k.userId}|${k.deviceId}|${k.keyVersion}`));

    const myKeys = keys
      .filter((k) => k.userId === me._id && k.deviceId === args.deviceId && k.keyVersion >= mine.fromKeyVersion)
      .map((k) => ({ keyVersion: k.keyVersion, ephemeralPublicKey: k.ephemeralPublicKey, iv: k.iv, wrappedKey: k.wrappedKey }));

    const missing: { userId: Id<"users">; deviceId: string; keyVersion: number }[] = [];
    for (const d of devices) {
      for (let ver = Math.max(1, d.fromKeyVersion); ver <= conv.keyVersion; ver++) {
        if (!have.has(`${d.userId}|${d.deviceId}|${ver}`)) missing.push({ userId: d.userId, deviceId: d.deviceId, keyVersion: ver });
      }
    }

    return {
      keyVersion: conv.keyVersion,
      needsRotation: conv.needsRotation || conv.keyVersion === 0,
      myFromKeyVersion: mine.fromKeyVersion,
      myKeys,
      devices: devices.map(({ fromKeyVersion: _f, ...d }) => d),
      missing: missing.slice(0, MAX_WRAPS),
    };
  },
});

/**
 * Across all my chats: member devices missing a key this device holds. The
 * site checks this on every page, so a friend's new browser gets its keys
 * whenever any member is online, not only when they open that chat.
 */
export const pendingKeyShares = query({
  args: { sessionToken: v.optional(v.string()), deviceId: v.string() },
  handler: async (ctx, args) => {
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return [];
    const mine = await ctx.db
      .query("conversationMembers")
      .withIndex("by_user", (q) => q.eq("userId", me._id))
      .take(MAX_CONVERSATIONS);
    const out = [];
    for (const m of mine) {
      const conv = await ctx.db.get(m.conversationId);
      if (!conv || conv.keyVersion === 0) continue;
      const keys = await ctx.db
        .query("conversationKeys")
        .withIndex("by_conversation_version", (q) => q.eq("conversationId", conv._id).gte("keyVersion", 1))
        .collect();
      const myKeys = keys.filter((k) => k.userId === me._id && k.deviceId === args.deviceId);
      if (myKeys.length === 0) continue;
      const canShare = new Set(myKeys.map((k) => k.keyVersion));
      const have = new Set(keys.map((k) => `${k.userId}|${k.deviceId}|${k.keyVersion}`));
      const missing: { userId: Id<"users">; deviceId: string; publicKey: string; keyVersion: number }[] = [];
      for (const member of await members(ctx, conv._id)) {
        for (const d of await devicesOf(ctx, member.userId)) {
          for (let ver = Math.max(1, member.fromKeyVersion); ver <= conv.keyVersion; ver++) {
            if (canShare.has(ver) && !have.has(`${member.userId}|${d.deviceId}|${ver}`)) {
              missing.push({ userId: member.userId, deviceId: d.deviceId, publicKey: d.publicKey, keyVersion: ver });
            }
          }
        }
      }
      if (missing.length === 0) continue;
      const needed = new Set(missing.map((x) => x.keyVersion));
      out.push({
        conversationId: conv._id,
        myKeys: myKeys
          .filter((k) => needed.has(k.keyVersion))
          .map((k) => ({ keyVersion: k.keyVersion, ephemeralPublicKey: k.ephemeralPublicKey, iv: k.iv, wrappedKey: k.wrappedKey })),
        missing: missing.slice(0, MAX_WRAPS),
      });
    }
    return out;
  },
});

/**
 * Starts a new conversation key. `wraps` must hold the new key for every
 * device of every member (DEVICES_CHANGED otherwise: fetch keyState and retry).
 * Allowed when the members changed, or when the calling device doesn't have
 * the current key (a new browser, so it can send without waiting).
 */
export const rotateKey = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    deviceId: v.string(),
    expectedVersion: v.number(),
    wraps: v.array(wrapV),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const { conv } = await requireMember(ctx, args.conversationId, me._id);
    if (conv.keyVersion !== args.expectedVersion) throw new ConvexError(KEY_CHANGED);
    if (conv.keyVersion !== 0 && !conv.needsRotation) {
      const deviceId = args.deviceId;
      const hasCurrent = await ctx.db
        .query("conversationKeys")
        .withIndex("by_device", (q) => q.eq("userId", me._id).eq("deviceId", deviceId).eq("conversationId", conv._id))
        .filter((q) => q.eq(q.field("keyVersion"), conv.keyVersion))
        .first();
      if (hasCurrent) throw new ConvexError(KEY_CHANGED);
    }
    if (args.wraps.length > MAX_WRAPS) throw new ConvexError("Too many keys");
    await rateLimit(ctx, `chat:rotate:${me._id}`, 120, HOUR);

    const all = await members(ctx, conv._id);
    const expected = new Set<string>();
    for (const m of all) for (const d of await devicesOf(ctx, m.userId)) expected.add(`${m.userId}|${d.deviceId}`);
    const given = new Set<string>();
    for (const w of args.wraps) {
      assertWrap(w);
      const k = `${w.userId}|${w.deviceId}`;
      if (!expected.has(k) || given.has(k)) throw new ConvexError(DEVICES_CHANGED);
      given.add(k);
    }
    if (given.size !== expected.size) throw new ConvexError(DEVICES_CHANGED);

    const keyVersion = conv.keyVersion + 1;
    const now = Date.now();
    for (const w of args.wraps) {
      await ctx.db.insert("conversationKeys", { conversationId: conv._id, keyVersion, ...w, createdAt: now });
    }
    await ctx.db.patch(conv._id, { keyVersion, needsRotation: false });
    return keyVersion;
  },
});

/** Gives keys this device holds to member devices that don't have them yet (a new browser, say). */
export const shareKeys = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    wraps: v.array(v.object({
      keyVersion: v.number(),
      userId: v.id("users"),
      deviceId: v.string(),
      ephemeralPublicKey: v.string(),
      iv: v.string(),
      wrappedKey: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const { conv } = await requireMember(ctx, args.conversationId, me._id);
    if (args.wraps.length > MAX_WRAPS) throw new ConvexError("Too many keys");
    const now = Date.now();
    const memberCache = new Map<string, Doc<"conversationMembers"> | null>();
    let added = 0;
    for (const w of args.wraps) {
      assertWrap(w);
      if (!memberCache.has(w.userId)) memberCache.set(w.userId, await getMember(ctx, conv._id, w.userId));
      const m = memberCache.get(w.userId);
      // Only for current members, and only versions from when they joined.
      if (!m || w.keyVersion < Math.max(1, m.fromKeyVersion) || w.keyVersion > conv.keyVersion) continue;
      const device = await ctx.db
        .query("chatDevices")
        .withIndex("by_user_device", (q) => q.eq("userId", w.userId).eq("deviceId", w.deviceId))
        .first();
      if (!device) continue;
      const exists = await ctx.db
        .query("conversationKeys")
        .withIndex("by_device", (q) => q.eq("userId", w.userId).eq("deviceId", w.deviceId).eq("conversationId", conv._id))
        .filter((q) => q.eq(q.field("keyVersion"), w.keyVersion))
        .first();
      if (exists) continue;
      await ctx.db.insert("conversationKeys", { conversationId: conv._id, ...w, createdAt: now });
      added++;
    }
    return added;
  },
});

// ─── Messages ─────────────────────────────────────────────────────────

/** Messages, newest first (paginated). Members only see messages from after they joined. */
export const listMessages = query({
  args: {
    sessionToken: v.optional(v.string()),
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const empty = { page: [], isDone: true, continueCursor: "" };
    const me = await optionalUser(ctx, args.sessionToken);
    if (!me) return empty;
    const mine = await getMember(ctx, args.conversationId, me._id);
    if (!mine) return empty;
    const res = await ctx.db
      .query("chatMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId).gte("createdAt", mine.joinedAt))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...res,
      page: res.page.map((m) => ({
        _id: m._id,
        senderId: m.senderId,
        kind: m.kind,
        keyVersion: m.keyVersion ?? null,
        iv: m.iv ?? null,
        ciphertext: m.ciphertext ?? null,
        event: m.event ?? null,
        createdAt: m.createdAt,
      })),
    };
  },
});

export const sendMessage = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    keyVersion: v.number(),
    iv: v.string(),
    ciphertext: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const { conv, member } = await requireMember(ctx, args.conversationId, me._id);
    // Always the newest key: after a member change nobody sends until there is a new one.
    if (conv.needsRotation || args.keyVersion !== conv.keyVersion) throw new ConvexError(KEY_CHANGED);
    assertB64(args.iv, 24, "message");
    assertB64(args.ciphertext, MAX_CIPHERTEXT, "message");
    if (conv.kind === "direct") {
      const other = (await members(ctx, conv._id)).find((m) => m.userId !== me._id);
      if (other && (await blockedEitherWay(ctx, me._id, other.userId))) throw new ConvexError("You can't message this player.");
    }
    await rateLimit(ctx, `chat:send:${me._id}`, 60, MINUTE);

    const now = Date.now();
    const id = await ctx.db.insert("chatMessages", {
      conversationId: conv._id,
      senderId: me._id,
      kind: "text",
      keyVersion: args.keyVersion,
      iv: args.iv,
      ciphertext: args.ciphertext,
      createdAt: now,
    });
    await ctx.db.patch(conv._id, { lastMessageAt: now });
    // Replying to a message request accepts it
    await ctx.db.patch(member._id, { lastReadAt: now, ...(member.request ? { request: undefined } : {}) });
    return id;
  },
});

/** Accept a message request: it becomes a normal chat. */
export const acceptMessageRequest = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const { member } = await requireMember(ctx, args.conversationId, me._id);
    if (member.request) await ctx.db.patch(member._id, { request: undefined, lastReadAt: Date.now() });
    return null;
  },
});

/** Turn down a message request: it disappears for me. The sender isn't told. */
export const declineMessageRequest = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const { member } = await requireMember(ctx, args.conversationId, me._id);
    if (member.request === "pending") await ctx.db.patch(member._id, { request: "declined" });
    return null;
  },
});

export const markRead = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const { conv, member } = await requireMember(ctx, args.conversationId, me._id);
    if (conv.lastMessageAt > member.lastReadAt) await ctx.db.patch(member._id, { lastReadAt: Date.now() });
    return null;
  },
});

// ─── Groups ───────────────────────────────────────────────────────────

async function requireGroupAdmin(ctx: MutationCtx, conversationId: Id<"conversations">, userId: Id<"users">) {
  const { conv, member } = await requireMember(ctx, conversationId, userId);
  if (conv.kind !== "group") throw new ConvexError("Only groups have members to manage.");
  if (member.role !== "admin") throw new ConvexError("Only group admins can do this.");
  return conv;
}

export const addMembers = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations"), userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const conv = await requireGroupAdmin(ctx, args.conversationId, me._id);
    const current = await members(ctx, conv._id);
    const inGroup = new Set(current.map((m) => m.userId as string));
    const toAdd = [...new Set(args.userIds)].filter((id) => !inGroup.has(id));
    if (toAdd.length === 0) return null;
    if (current.length + toAdd.length > MAX_GROUP_MEMBERS) throw new ConvexError(`A group can have at most ${MAX_GROUP_MEMBERS} members.`);
    for (const id of toAdd) {
      if (!(await areConnected(ctx, me._id, id))) throw new ConvexError("You can add players you follow each other with only.");
    }
    const now = Date.now();
    for (const id of toAdd) {
      await ctx.db.insert("conversationMembers", {
        conversationId: conv._id,
        userId: id,
        role: "member",
        fromKeyVersion: conv.keyVersion + 1, // the next key, made before anyone can send again
        joinedAt: now,
        lastReadAt: now,
      });
    }
    await ctx.db.patch(conv._id, { needsRotation: true });
    await addEvent(ctx, conv._id, me._id, "added", toAdd);
    return null;
  },
});

export const removeMember = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    if (args.userId === me._id) throw new ConvexError("Use Leave group instead.");
    const conv = await requireGroupAdmin(ctx, args.conversationId, me._id);
    const target = await getMember(ctx, conv._id, args.userId);
    if (!target) return null;
    await dropMember(ctx, conv, target);
    await addEvent(ctx, conv._id, me._id, "removed", [args.userId]);
    return null;
  },
});

export const leaveGroup = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const { conv, member } = await requireMember(ctx, args.conversationId, me._id);
    if (conv.kind !== "group") throw new ConvexError("You can only leave groups.");
    if (await dropMember(ctx, conv, member)) await addEvent(ctx, conv._id, me._id, "left");
    return null;
  },
});

export const renameGroup = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations"), name: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx, args.sessionToken);
    const conv = await requireGroupAdmin(ctx, args.conversationId, me._id);
    const name = cleanGroupName(args.name);
    if (name === conv.name) return null;
    await ctx.db.patch(conv._id, { name });
    await addEvent(ctx, conv._id, me._id, "renamed");
    return null;
  },
});

// ─── Account deletion ─────────────────────────────────────────────────

/** Called from users.deleteAccount: leaves every chat and forgets the player's devices. */
export async function removeUserFromChats(ctx: MutationCtx, userId: Id<"users">) {
  const mine = await ctx.db.query("conversationMembers").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
  for (const m of mine) {
    const conv = await ctx.db.get(m.conversationId);
    if (!conv) {
      await ctx.db.delete(m._id);
      continue;
    }
    await dropMember(ctx, conv, m);
  }
  const keys = await ctx.db.query("conversationKeys").withIndex("by_device", (q) => q.eq("userId", userId)).collect();
  for (const k of keys) await ctx.db.delete(k._id);
  for (const d of await devicesOf(ctx, userId)) await ctx.db.delete(d._id);
}
