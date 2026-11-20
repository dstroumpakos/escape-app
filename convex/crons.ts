import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Pay-as-you-go invoices for last month. Runs every day: the 1st does the real
// work, later runs only retry failures or pick up companies approved since.
crons.daily(
  "bill pay-as-you-go fees",
  { hourUTC: 7, minuteUTC: 0 },
  internal.billingStripe.billPreviousMonth,
  {}
);

// Old rate-limit counters and expired login lockouts.
crons.daily(
  "clean up rate limits",
  { hourUTC: 3, minuteUTC: 0 },
  internal.rateLimit.cleanup,
  {}
);

// Pay-at-pickup merch orders that were never collected.
crons.daily(
  "expire uncollected merch orders",
  { hourUTC: 4, minuteUTC: 0 },
  internal.merch.expireReservations,
  {}
);

// Last-minute offers of past days (see slotOffers.ts).
crons.daily(
  "clean up old slot offers",
  { hourUTC: 5, minuteUTC: 0 },
  internal.slotOffers.cleanup,
  {}
);

// Leaderboard and homepage stats (see publicCache.ts).
crons.interval("refresh public cache", { minutes: 10 }, internal.publicCache.refresh, {});

// Companies' newest Instagram posts (see instagram.ts). One paid SearchApi call each.
crons.daily(
  "refresh instagram posts",
  { hourUTC: 6, minuteUTC: 0 },
  internal.instagram.refreshAll,
  {}
);

// Rooms Played: matching proof photos nobody answered in 14 days (see plays.ts).
crons.daily(
  "auto-verify played rooms",
  { hourUTC: 2, minuteUTC: 30 },
  internal.plays.autoVerify,
  {}
);

export default crons;
