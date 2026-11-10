import { useEffect, useState } from 'react';

/**
 * When a slot stops taking bookings. Same rule as the website
 * (escape-web src/lib/slotTime.ts) and the server (convex/slotRules.ts):
 *  - a slot can't be booked once it has started;
 *  - a free slot closes 1 hour before it starts, unless the slot right before
 *    it is booked (staff are already on site); then it stays open until it starts.
 * Times are "HH:MM"; times before 06:00 belong to the late-night end of the date.
 */
export const SLOT_CUTOFF_MS = 60 * 60 * 1000;

const TIME_RE = /^\d{1,2}:\d{2}$/;

export function slotSortKey(time: string) {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  return ((h < 6 ? h + 24 : h) || 0) * 60 + (m || 0);
}

/** Local start moment of a slot. */
export function slotStart(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map((n) => parseInt(n, 10));
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  const start = new Date(y, (mo || 1) - 1, d || 1, h || 0, m || 0, 0, 0);
  if ((h || 0) < 6) start.setDate(start.getDate() + 1);
  return start;
}

/** Why a free slot can't be booked any more, or null when it still can. */
export function slotClosedReason(
  date: string,
  time: string,
  allTimes: Iterable<string>,
  bookedTimes: Set<string>,
  now: Date = new Date()
): 'past' | 'cutoff' | null {
  if (!TIME_RE.test(time)) return null; // e.g. "10:00 AM" placeholder slots
  const start = slotStart(date, time).getTime();
  if (start <= now.getTime()) return 'past';
  const key = slotSortKey(time);
  let prev: string | null = null;
  for (const t of allTimes) {
    if (!TIME_RE.test(t)) continue;
    const k = slotSortKey(t);
    if (k < key && (prev === null || k > slotSortKey(prev))) prev = t;
  }
  if (prev && bookedTimes.has(prev)) return null;
  return start - SLOT_CUTOFF_MS <= now.getTime() ? 'cutoff' : null;
}

/** Current time, refreshed every `intervalMs` so closed times drop off on their own. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
