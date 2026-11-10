/**
 * When a slot stops taking bookings. Same rule as the website
 * (escape-web src/lib/slotTime.ts) and the app (src/utils/slotTime.ts):
 *  - a slot can't be booked once it has started;
 *  - a free slot closes 1 hour before it starts, unless the slot right before
 *    it is booked (staff are already on site); then it stays open until it starts.
 *
 * Slot dates/times are Greek wall-clock time ("YYYY-MM-DD" + "HH:MM"; times
 * before 06:00 belong to the late-night end of that date). Convex runs in UTC,
 * so "now" is converted to Europe/Athens wall-clock before comparing.
 */

import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const TIME_ZONE = "Europe/Athens";
export const SLOT_CUTOFF_MINUTES = 60;

const TIME_RE = /^\d{1,2}:\d{2}$/;

function sortKey(time: string) {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  return ((h < 6 ? h + 24 : h) || 0) * 60 + (m || 0);
}

/** Wall-clock minutes (as if UTC) of a slot's start. */
function slotStartMinutes(date: string, time: string) {
  const [y, mo, d] = date.split("-").map((n) => parseInt(n, 10));
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const dayMs = Date.UTC(y, (mo || 1) - 1, d || 1, 0, 0);
  return dayMs / 60000 + sortKey(`${h}:${m}`);
}

/** Greek wall-clock minutes (as if UTC) of `nowMs`. */
function athensNowMinutes(nowMs: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) / 60000;
}

/**
 * Why a free slot can't be booked any more, or null when it still can.
 * `allTimes` = every time on that day (slots + booked times),
 * `bookedTimes` = times with a non-cancelled booking.
 */
export function slotClosedReason(
  date: string,
  time: string,
  allTimes: Iterable<string>,
  bookedTimes: Set<string>,
  nowMs: number = Date.now()
): "past" | "cutoff" | null {
  if (!TIME_RE.test(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const now = athensNowMinutes(nowMs);
  const start = slotStartMinutes(date, time);
  if (start <= now) return "past";

  const key = sortKey(time);
  let prev: string | null = null;
  for (const t of allTimes) {
    if (!TIME_RE.test(t)) continue;
    const k = sortKey(t);
    if (k < key && (prev === null || k > sortKey(prev))) prev = t;
  }
  if (prev && bookedTimes.has(prev)) return null;
  return start - SLOT_CUTOFF_MINUTES <= now ? "cutoff" : null;
}

/**
 * Throws when a player tries to book a time that has started or is inside its
 * last-hour cutoff. `existing` = that room+date's bookings (any status).
 */
export async function assertSlotStillBookable(
  ctx: QueryCtx,
  room: Doc<"rooms"> | null,
  date: string,
  time: string,
  existing: Doc<"bookings">[]
) {
  const booked = new Set(existing.filter((b) => b.status !== "cancelled").map((b) => b.time));
  let dayTimes: string[] = [];
  if (room) {
    const custom = await ctx.db
      .query("timeSlots")
      .withIndex("by_room_date", (q) => q.eq("roomId", room._id).eq("date", date))
      .collect();
    dayTimes =
      custom.length > 0
        ? custom.map((s) => s.time)
        : (room.defaultTimeSlots || []).map((s) => s.time);
  }
  if (slotClosedReason(date, time, [...dayTimes, ...booked, time], booked)) {
    throw new Error("This time slot is no longer available");
  }
}
