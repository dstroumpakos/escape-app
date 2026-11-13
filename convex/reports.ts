import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ADMIN_EMAILS } from "./companies";
import { sessionTokenV, requireCompany, requireBookingOf } from "./companySession";
import {
  COMPANY_REPORT_WINDOW_MS,
  PLAYER_REPLY_MAX_CHARS,
  PLAYER_REPORT_CATEGORIES,
  ROOM_REPORT_MAX_CHARS,
  ROOM_REPORT_MAX_PHOTOS,
  ROOM_REPORT_MIN_CHARS,
  ROOM_REPORT_WINDOW_MS,
  computeStanding,
  gameEndMs,
  playerReportCategoryV,
  roomReportKindV,
  roomReportStatusV,
  slotStartMs,
  type PlayerReportCategory,
} from "./reportRules";

// ═══════════════════════════════════════════════════════════════════════
// Two-way reporting (rules in reportRules.ts)
// ═══════════════════════════════════════════════════════════════════════
// Privacy rules enforced here:
//  • roomReports are returned only by the admin* functions. No company-facing
//    function reads that table, so a business never learns it was reported or by whom.
//  • playerReports.companyId (the reporter) is returned only to admins. Players
//    and businesses get categories, a count and the player's replies, and only
//    for reports inside the published snapshot (see computeStanding).

type Ctx = QueryCtx | MutationCtx;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function requireAdminEmail(adminEmail: string) {
  const email = adminEmail.toLowerCase().trim();
  if (!ADMIN_EMAILS.includes(email)) throw new ConvexError("Unauthorized");
  return email;
}

async function requirePlayer(ctx: Ctx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("User not found");
  return user;
}

/** Room duration lookups, cached per call. */
function roomCache(ctx: Ctx) {
  const cache = new Map<string, Doc<"rooms"> | null>();
  return async (roomId: Id<"rooms">) => {
    const key = String(roomId);
    if (!cache.has(key)) cache.set(key, await ctx.db.get(roomId));
    return cache.get(key)!;
  };
}

async function bookingGameEnd(
  getRoom: ReturnType<typeof roomCache>,
  booking: Doc<"bookings">
): Promise<number> {
  const room = await getRoom(booking.roomId);
  return gameEndMs(booking.date, booking.time, room?.duration);
}

/** The player's current standing: which reports are visible and how long they last. */
async function loadStanding(ctx: Ctx, userId: Id<"users">, getRoom = roomCache(ctx)) {
  const bookings = await ctx.db
    .query("bookings")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "completed"))
    .collect();
  const gameEnds: number[] = [];
  for (const b of bookings) gameEnds.push(await bookingGameEnd(getRoom, b));
  const reports = (
    await ctx.db
      .query("playerReports")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).filter((r) => !r.voidedAt);
  return computeStanding(gameEnds, reports, Date.now());
}

/** Stable order that says nothing about when or where a report was filed. */
function anonymousOrder<T extends { categories: string[] }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    [...a.categories].sort().join(",").localeCompare([...b.categories].sort().join(","))
  );
}

function categoryCounts(reports: { categories: PlayerReportCategory[] }[]) {
  const counts: Partial<Record<PlayerReportCategory, number>> = {};
  for (const r of reports) for (const c of r.categories) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}

// ═══════════════════════════════════════════════════════════════════════
// Player → room reports
// ═══════════════════════════════════════════════════════════════════════

/** The player's room reports, so ticket pages can show "Reported" instead of the button. */
export const myRoomReports = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("roomReports")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows.map((r) => ({
      _id: r._id,
      bookingId: r.bookingId,
      kind: r.kind,
      status: r.status,
      createdAt: r.createdAt,
    }));
  },
});

export const generateRoomReportUploadUrl = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requirePlayer(ctx, args.userId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submitRoomReport = mutation({
  args: {
    userId: v.id("users"),
    bookingId: v.id("bookings"),
    kind: roomReportKindV,
    description: v.string(),
    photoStorageIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    await requirePlayer(ctx, args.userId);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.userId !== args.userId) throw new ConvexError("Booking not found");
    if (booking.status !== "completed") throw new ConvexError("You can only report a room you have played");
    const room = await ctx.db.get(booking.roomId);
    const end = gameEndMs(booking.date, booking.time, room?.duration);
    if (Date.now() > end + ROOM_REPORT_WINDOW_MS) {
      throw new ConvexError("Reports can be sent up to 30 days after the game");
    }
    const existing = await ctx.db
      .query("roomReports")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .collect();
    if (existing.some((r) => r.userId === args.userId)) {
      throw new ConvexError("You have already reported this game");
    }

    const description = args.description.trim();
    if (description.length < ROOM_REPORT_MIN_CHARS) throw new ConvexError("Please describe what happened");
    if (description.length > ROOM_REPORT_MAX_CHARS) throw new ConvexError("Description is too long");

    const photos = [...new Set(args.photoStorageIds)];
    if (photos.length > ROOM_REPORT_MAX_PHOTOS) throw new ConvexError(`Up to ${ROOM_REPORT_MAX_PHOTOS} photos`);
    for (const sid of photos) {
      const meta = await ctx.db.system.get(sid);
      if (!meta) throw new ConvexError("Photo upload not found");
      if (!meta.contentType?.startsWith("image/") || meta.size > MAX_PHOTO_BYTES) {
        throw new ConvexError("Photos must be images up to 10 MB");
      }
    }

    const now = Date.now();
    const companyId = booking.companyId ?? room?.companyId;
    const id = await ctx.db.insert("roomReports", {
      userId: args.userId,
      bookingId: args.bookingId,
      roomId: booking.roomId,
      companyId,
      kind: args.kind,
      description,
      photoStorageIds: photos,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });

    const company = companyId ? await ctx.db.get(companyId) : null;
    await ctx.scheduler.runAfter(0, internal.email.sendRoomReportAlert, {
      roomTitle: room?.title ?? "Unknown room",
      companyName: company?.name ?? "Unknown business",
      kind: args.kind,
      photoCount: photos.length,
    });
    return id;
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Business → player reports
// ═══════════════════════════════════════════════════════════════════════

type ReportBlock = "no_player" | "cancelled" | "not_started" | "window_closed" | "already_reported";

async function reportWindow(ctx: Ctx, booking: Doc<"bookings">) {
  const room = await ctx.db.get(booking.roomId);
  const start = slotStartMs(booking.date, booking.time);
  const end = gameEndMs(booking.date, booking.time, room?.duration);
  const deadline = end + COMPANY_REPORT_WINDOW_MS;
  const now = Date.now();
  let block: ReportBlock | null = null;
  if (!booking.userId) block = "no_player";
  else if (booking.status === "cancelled" || booking.status === "pending_payment") block = "cancelled";
  else if (now < start) block = "not_started";
  else if (now > deadline) block = "window_closed";
  return { block, gameEnd: end, deadline };
}

/** Whether the calling business may report the player of this booking right now. */
export const companyReportStatus = query({
  args: {
    sessionToken: sessionTokenV,
    companyId: v.optional(v.id("companies")),
    bookingId: v.id("bookings"),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "reports:companyReportStatus");
    const booking = await requireBookingOf(ctx, company, args.bookingId);
    const existing = await ctx.db
      .query("playerReports")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();
    const { block, deadline } = await reportWindow(ctx, booking);
    return {
      canReport: !existing && block === null,
      block: existing ? ("already_reported" as ReportBlock) : block,
      deadline,
      existing: existing
        ? { categories: existing.categories, createdAt: existing.createdAt, voided: !!existing.voidedAt }
        : null,
    };
  },
});

export const reportPlayer = mutation({
  args: {
    sessionToken: sessionTokenV,
    companyId: v.optional(v.id("companies")),
    bookingId: v.id("bookings"),
    categories: v.array(playerReportCategoryV),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "reports:reportPlayer");
    const booking = await requireBookingOf(ctx, company, args.bookingId);
    const categories = PLAYER_REPORT_CATEGORIES.filter((c) => args.categories.includes(c));
    if (categories.length === 0) throw new ConvexError("Pick at least one category");

    const existing = await ctx.db
      .query("playerReports")
      .withIndex("by_booking", (q) => q.eq("bookingId", args.bookingId))
      .first();
    if (existing) throw new ConvexError("This booking has already been reported");

    const { block, gameEnd } = await reportWindow(ctx, booking);
    if (block === "no_player") throw new ConvexError("This booking has no UNLOCKED player to report");
    if (block === "cancelled") throw new ConvexError("This booking was not played");
    if (block === "not_started") throw new ConvexError("You can report a player once the game has started");
    if (block === "window_closed") throw new ConvexError("Reports can only be sent within 24 hours after the game");

    return await ctx.db.insert("playerReports", {
      userId: booking.userId!,
      bookingId: booking._id,
      roomId: booking.roomId,
      companyId: company._id,
      categories,
      gameEndAt: gameEnd,
      createdAt: Date.now(),
    });
  },
});

/**
 * Report flags for a business's upcoming bookings. Only bookings of the
 * calling business, only upcoming ones, only reports in the published snapshot.
 */
export const flagsForBookings = query({
  args: {
    sessionToken: sessionTokenV,
    companyId: v.optional(v.id("companies")),
    bookingIds: v.array(v.id("bookings")),
  },
  handler: async (ctx, args) => {
    const company = await requireCompany(ctx, args, "reports:flagsForBookings");
    const getRoom = roomCache(ctx);
    const byUser = new Map<string, Awaited<ReturnType<typeof loadStanding>>>();
    const out: {
      bookingId: Id<"bookings">;
      count: number;
      categories: Partial<Record<PlayerReportCategory, number>>;
      replies: string[];
      gamesRemaining: number;
    }[] = [];

    for (const bookingId of [...new Set(args.bookingIds)].slice(0, 300)) {
      const booking = await ctx.db.get(bookingId);
      if (!booking?.userId) continue;
      if (booking.status !== "upcoming" && booking.status !== "pending_payment") continue;
      if (booking.companyId !== company._id) {
        const room = await getRoom(booking.roomId);
        if (room?.companyId !== company._id) continue;
      }
      const key = String(booking.userId);
      if (!byUser.has(key)) byUser.set(key, await loadStanding(ctx, booking.userId, getRoom));
      const standing = byUser.get(key)!;
      if (standing.active.length === 0) continue;
      const active = anonymousOrder(standing.active);
      out.push({
        bookingId,
        count: active.length,
        categories: categoryCounts(active),
        replies: active.map((r) => r.reply).filter((r): r is string => !!r),
        gamesRemaining: standing.gamesRemaining,
      });
    }
    return out;
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Player view of reports about them
// ═══════════════════════════════════════════════════════════════════════

export const myStanding = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const standing = await loadStanding(ctx, args.userId);
    return {
      active: standing.active.length > 0,
      gamesRemaining: standing.gamesRemaining,
      window: standing.window,
      reports: anonymousOrder(standing.active).map((r) => ({
        _id: r._id,
        categories: r.categories,
        reply: r.reply ?? null,
      })),
    };
  },
});

export const replyToReport = mutation({
  args: { userId: v.id("users"), reportId: v.id("playerReports"), reply: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId);
    if (!report || report.userId !== args.userId || report.voidedAt) throw new ConvexError("Report not found");
    const standing = await loadStanding(ctx, args.userId);
    if (!standing.active.some((r) => r._id === report._id)) throw new ConvexError("Report not found");
    const reply = args.reply.trim();
    if (reply.length > PLAYER_REPLY_MAX_CHARS) throw new ConvexError("Reply is too long");
    await ctx.db.patch(report._id, {
      reply: reply || undefined,
      repliedAt: reply ? Date.now() : undefined,
    });
  },
});

// ═══════════════════════════════════════════════════════════════════════
// Admin
// ═══════════════════════════════════════════════════════════════════════

export const adminRoomReports = query({
  args: { adminEmail: v.string(), status: v.optional(roomReportStatusV) },
  handler: async (ctx, args) => {
    requireAdminEmail(args.adminEmail);
    const rows = args.status
      ? await ctx.db.query("roomReports").withIndex("by_status", (q) => q.eq("status", args.status!)).collect()
      : await ctx.db.query("roomReports").collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);

    return await Promise.all(
      rows.map(async (r) => {
        const [user, room, booking, company] = await Promise.all([
          ctx.db.get(r.userId),
          ctx.db.get(r.roomId),
          ctx.db.get(r.bookingId),
          r.companyId ? ctx.db.get(r.companyId) : null,
        ]);
        const photoUrls = (
          await Promise.all(r.photoStorageIds.map((sid) => ctx.storage.getUrl(sid)))
        ).filter((u): u is string => !!u);
        return {
          _id: r._id,
          kind: r.kind,
          description: r.description,
          status: r.status,
          adminNotes: r.adminNotes ?? "",
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          photoUrls,
          reporter: user ? { name: user.name, email: user.email, phone: user.phone ?? "" } : null,
          room: room ? { title: room.title } : null,
          company: company ? { name: company.name, email: company.email, phone: company.phone } : null,
          booking: booking ? { date: booking.date, time: booking.time, bookingCode: booking.bookingCode } : null,
        };
      })
    );
  },
});

export const adminUpdateRoomReport = mutation({
  args: {
    adminEmail: v.string(),
    reportId: v.id("roomReports"),
    status: v.optional(roomReportStatusV),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminEmail(args.adminEmail);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new ConvexError("Report not found");
    const patch: Partial<Doc<"roomReports">> = { updatedAt: Date.now() };
    if (args.status) patch.status = args.status;
    if (args.adminNotes !== undefined) patch.adminNotes = args.adminNotes.trim().slice(0, 4000) || undefined;
    await ctx.db.patch(report._id, patch);
  },
});

export const adminPlayerReports = query({
  args: { adminEmail: v.string() },
  handler: async (ctx, args) => {
    requireAdminEmail(args.adminEmail);
    const rows = await ctx.db.query("playerReports").collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);

    const getRoom = roomCache(ctx);
    const standings = new Map<string, Awaited<ReturnType<typeof loadStanding>>>();
    for (const r of rows) {
      const key = String(r.userId);
      if (!standings.has(key)) standings.set(key, await loadStanding(ctx, r.userId, getRoom));
    }

    return await Promise.all(
      rows.map(async (r) => {
        const standing = standings.get(String(r.userId))!;
        const state = r.voidedAt
          ? "voided"
          : standing.active.some((a) => a._id === r._id)
            ? "active"
            : standing.pendingIds.includes(r._id)
              ? "pending"
              : "expired";
        const [user, company, booking, room] = await Promise.all([
          ctx.db.get(r.userId),
          ctx.db.get(r.companyId),
          ctx.db.get(r.bookingId),
          getRoom(r.roomId),
        ]);
        return {
          _id: r._id,
          categories: r.categories,
          reply: r.reply ?? null,
          createdAt: r.createdAt,
          voidedNote: r.voidedNote ?? null,
          state: state as "active" | "pending" | "expired" | "voided",
          gamesRemaining: state === "active" ? standing.gamesRemaining : null,
          player: user ? { name: user.name, email: user.email } : null,
          company: company ? { name: company.name } : null,
          room: room ? { title: room.title } : null,
          booking: booking ? { date: booking.date, time: booking.time, bookingCode: booking.bookingCode } : null,
        };
      })
    );
  },
});

export const adminSetPlayerReportVoided = mutation({
  args: {
    adminEmail: v.string(),
    reportId: v.id("playerReports"),
    voided: v.boolean(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireAdminEmail(args.adminEmail);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new ConvexError("Report not found");
    await ctx.db.patch(report._id, args.voided
      ? { voidedAt: Date.now(), voidedNote: args.note?.trim().slice(0, 1000) || undefined }
      : { voidedAt: undefined, voidedNote: undefined });
  },
});
