import { v } from "convex/values";

// ═══════════════════════════════════════════════════════════════════════
// Cancellation reasons and late-cancel rules (pure, safe to import on the client)
// ═══════════════════════════════════════════════════════════════════════
// Every cancellation stores who cancelled, a reason and an optional note.
// A cancellation is "late" when it happens less than LATE_CANCEL_WINDOW_MS
// before the slot starts (or after it started). Late cancellations count
// against the player when:
//  • the player cancels an upcoming booking themselves, or
//  • the business cancels with a reason that is the player's doing
//    (COMPANY_REASONS_AGAINST_PLAYER), e.g. a no-show.
// A player with LATE_CANCEL_FLAG_THRESHOLD or more counted late cancellations
// in the last LATE_CANCEL_LOOKBACK_MS is flagged to the businesses they book
// with next (see cancellations.ts). Unpaid checkouts that expire never count.

export const PLAYER_CANCEL_REASONS = [
  "schedule_change", // plans changed
  "illness",         // someone in the group is ill
  "group_changed",   // not enough players any more
  "travel",          // travel, weather or transport problems
  "booked_elsewhere",// found another game or time
  "other",
] as const;
export type PlayerCancelReason = (typeof PLAYER_CANCEL_REASONS)[number];

export const COMPANY_CANCEL_REASONS = [
  "player_request",    // the player asked the business to cancel
  "no_show",           // the player didn't show up
  "room_issue",        // room broken or under maintenance
  "staff_unavailable", // no game master available
  "duplicate",         // duplicate or test booking
  "other",
] as const;
export type CompanyCancelReason = (typeof COMPANY_CANCEL_REASONS)[number];

export type CancelReason = PlayerCancelReason | CompanyCancelReason;

/** Business reasons that are the player's doing, so a late one counts against them. */
export const COMPANY_REASONS_AGAINST_PLAYER: readonly CompanyCancelReason[] = ["player_request", "no_show"];

export const cancelReasonV = v.union(
  v.literal("schedule_change"),
  v.literal("illness"),
  v.literal("group_changed"),
  v.literal("travel"),
  v.literal("booked_elsewhere"),
  v.literal("player_request"),
  v.literal("no_show"),
  v.literal("room_issue"),
  v.literal("staff_unavailable"),
  v.literal("duplicate"),
  v.literal("other")
);

export const cancelledByV = v.union(v.literal("player"), v.literal("company"), v.literal("system"));

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Cancelling less than this long before the slot starts is a late cancellation. */
export const LATE_CANCEL_WINDOW_MS = 24 * HOUR_MS;
/** Late cancellations older than this no longer count. */
export const LATE_CANCEL_LOOKBACK_MS = 180 * DAY_MS;
export const LATE_CANCEL_LOOKBACK_DAYS = 180;
/** This many counted late cancellations in the lookback period flags the player. */
export const LATE_CANCEL_FLAG_THRESHOLD = 2;
export const CANCEL_NOTE_MAX_CHARS = 300;

/** True when cancelling now, for a slot starting at `slotStartMs`, is late. */
export function isLateCancel(slotStartMs: number, now: number): boolean {
  return slotStartMs - now < LATE_CANCEL_WINDOW_MS;
}

/** Whether a business cancellation with this reason counts against the player when late. */
export function companyReasonCountsAgainstPlayer(reason: CancelReason | undefined): boolean {
  return !!reason && (COMPANY_REASONS_AGAINST_PLAYER as readonly string[]).includes(reason);
}

/** Trim and cap a free-text cancellation note; empty becomes undefined. */
export function cleanCancelNote(note: string | undefined): string | undefined {
  const s = (note ?? "").trim().slice(0, CANCEL_NOTE_MAX_CHARS);
  return s || undefined;
}
