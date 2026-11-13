import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════════════
// Reporting rules (pure helpers, no database access)
// ═══════════════════════════════════════════════════════════════════════
// Two report flows live in reports.ts:
//  • roomReports   — a player reports a room they played (safety / behaviour).
//                    Only the UNLOCKED team sees these; the business never does.
//  • playerReports — a business reports a player's behaviour with fixed
//                    categories, within 24h of the game ending.
//
// Player reports are shown to the player and to businesses the player books
// with next, but only as a "snapshot" refreshed every 3 games, so nobody can
// tell which business filed a report. Reports expire after the player plays a
// number of clean games: 3, doubled for every repeat report (6, 12), max 12.

export const PLAYER_REPORT_CATEGORIES = [
  "damage",            // damage to the room or props
  "abusive_to_staff",  // aggressive or abusive behaviour towards staff
  "harassment",        // harassment of staff or other players
  "intoxicated",       // under the influence of alcohol or drugs
  "safety_rules",      // ignored safety rules or instructions
  "filming_spoilers",  // filmed the room or posted spoilers
] as const;
export type PlayerReportCategory = (typeof PLAYER_REPORT_CATEGORIES)[number];

export const playerReportCategoryV = v.union(
  v.literal("damage"),
  v.literal("abusive_to_staff"),
  v.literal("harassment"),
  v.literal("intoxicated"),
  v.literal("safety_rules"),
  v.literal("filming_spoilers")
);

export const roomReportKindV = v.union(v.literal("safety"), v.literal("behaviour"));
export const roomReportStatusV = v.union(
  v.literal("new"),
  v.literal("in_review"),
  v.literal("resolved")
);

/** A business can report a player until this long after the game ends. */
export const COMPANY_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A player can report a room until this long after the game ends. */
export const ROOM_REPORT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Snapshot batch size: what players and businesses see refreshes every N games. */
export const REPORT_BATCH_GAMES = 3;
/** Clean games needed for a report streak to expire, by streak level (1, 2, 3+). */
export const EXPIRY_WINDOWS = [3, 6, 12] as const;

export const ROOM_REPORT_MAX_PHOTOS = 5;
export const ROOM_REPORT_MIN_CHARS = 10;
export const ROOM_REPORT_MAX_CHARS = 2000;
export const PLAYER_REPLY_MAX_CHARS = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_MIN = 60;

/** Offset of Greek time from UTC (ms) at a given instant. */
function athensOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Athens",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Start of a slot as a UTC timestamp. Slots are Greek local "YYYY-MM-DD" +
 * "HH:MM"; times before 06:00 belong to the night after that date (same rule
 * as the booking pages, see src/lib/slotTime.ts).
 */
export function slotStartMs(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map((n) => parseInt(n, 10));
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  let naive = Date.UTC(y || 1970, (mo || 1) - 1, d || 1, h || 0, m || 0);
  if ((h || 0) < 6) naive += DAY_MS;
  const off1 = athensOffsetMs(naive);
  let ts = naive - off1;
  const off2 = athensOffsetMs(ts);
  if (off2 !== off1) ts = naive - off2;
  return ts;
}

/** End of a game: slot start + room duration (minutes). */
export function gameEndMs(date: string, time: string, durationMin?: number): number {
  const dur = durationMin && durationMin > 0 ? durationMin : DEFAULT_DURATION_MIN;
  return slotStartMs(date, time) + dur * 60 * 1000;
}

function expiryWindow(level: number): number {
  return EXPIRY_WINDOWS[Math.min(Math.max(level, 1), EXPIRY_WINDOWS.length) - 1];
}

export interface StandingReport {
  _id: string;
  gameEndAt: number;
}

export interface Standing<R extends StandingReport> {
  /** End of the last game included in the current snapshot (0 = nothing published yet). */
  publishedUntil: number;
  /** Reports of the current active streak (empty when the player is clear). */
  active: R[];
  /** Streak level: 1 = first report, 2 = repeat, 3+ = capped. */
  level: number;
  /** Clean games needed for the streak to expire. */
  window: number;
  /** Clean games still needed before the streak expires. */
  gamesRemaining: number;
  /** Ids of reports that are not yet in the snapshot (only for admins). */
  pendingIds: string[];
}

/**
 * Works out what the player and businesses currently see.
 *
 * @param gameEnds end timestamps of the player's completed games
 * @param reports  the player's non-voided reports
 * @param now      current time
 *
 * Games are grouped in batches of 3 in the order they were played. A batch
 * is published once it has 3 games and the last one's 24h report window has
 * closed. Only reports on games up to the last published game count, and the
 * expiry counter only counts published games, so the picture changes at most
 * once every 3 games.
 */
export function computeStanding<R extends StandingReport>(
  gameEnds: number[],
  reports: R[],
  now: number
): Standing<R> {
  const games = [...gameEnds].sort((a, b) => a - b);
  let publishedUntil = 0;
  for (let k = REPORT_BATCH_GAMES; k <= games.length; k += REPORT_BATCH_GAMES) {
    const end = games[k - 1];
    if (now >= end + COMPANY_REPORT_WINDOW_MS) publishedUntil = end;
    else break;
  }
  const publishedGames = games.filter((g) => g <= publishedUntil);

  const sorted = [...reports].sort((a, b) => a.gameEndAt - b.gameEndAt);
  const visible = sorted.filter((r) => publishedUntil > 0 && r.gameEndAt <= publishedUntil);
  const pendingIds = sorted.filter((r) => !visible.includes(r)).map((r) => r._id);

  const cleanAfter = (t: number, until: number) =>
    publishedGames.filter((g) => g > t && g < until).length;

  let level = 0;
  let streak: R[] = [];
  for (const r of visible) {
    if (streak.length > 0) {
      const last = streak[streak.length - 1].gameEndAt;
      const clean = cleanAfter(last, r.gameEndAt);
      if (clean < expiryWindow(level)) {
        level += 1;
        streak.push(r);
        continue;
      }
    }
    level = 1;
    streak = [r];
  }

  if (streak.length === 0) {
    return { publishedUntil, active: [], level: 0, window: 0, gamesRemaining: 0, pendingIds };
  }
  const window = expiryWindow(level);
  const lastEnd = streak[streak.length - 1].gameEndAt;
  const clean = cleanAfter(lastEnd, Infinity);
  if (clean >= window) {
    return { publishedUntil, active: [], level: 0, window: 0, gamesRemaining: 0, pendingIds };
  }
  // The snapshot only refreshes every 3 games, so the streak can only disappear
  // at a refresh: round up to whole batches, minus games already played since
  // the last refresh.
  const unpublished = games.length - publishedGames.length;
  const toRefresh = REPORT_BATCH_GAMES * Math.ceil((window - clean) / REPORT_BATCH_GAMES) - unpublished;
  return { publishedUntil, active: streak, level, window, gamesRemaining: Math.max(1, toRefresh), pendingIds };
}
