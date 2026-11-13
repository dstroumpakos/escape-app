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

export default crons;
