"use node";

// Stripe side of pay-as-you-go billing (UNLOCKED's own Stripe account).
// The database side is billing.ts.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getStripe } from "./stripe";
import { PAYG_FEE_CENTS, currentMonthAthens, previousMonth } from "./plans";

const DAYS_UNTIL_DUE = 14;

type LegacyCompany = {
  companyId: Id<"companies">;
  name: string;
  plan: string | null;
  stripeSubscriptionId: string | null;
};

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Runs daily (crons.ts). Invoices every pay-as-you-go company for last
 * month's bookings, once. Repeat runs skip months already invoiced and retry
 * ones that failed, so a missed or failed run catches up the next day.
 * Pass `month` ("YYYY-MM") to bill a specific past month by hand.
 */
export const billPreviousMonth = internalAction({
  args: { month: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ month: string; results: { companyId: string; outcome: string }[] }> => {
    const month = args.month ?? previousMonth(currentMonthAthens());
    const companyIds = await ctx.runQuery(internal.billing.paygCompanyIds, {});
    const results: { companyId: string; outcome: string }[] = [];

    for (const companyId of companyIds) {
      const claim = await ctx.runMutation(internal.billing.claimInvoice, { companyId, month });
      if (!claim) continue;
      try {
        const stripe = getStripe();

        let customerId = claim.stripeCustomerId;
        if (!customerId) {
          const customer = await stripe.customers.create(
            { email: claim.companyEmail, name: claim.companyName, metadata: { companyId } },
            { idempotencyKey: `payg-customer-${companyId}` }
          );
          customerId = customer.id;
          await ctx.runMutation(internal.companies.updateStripeCustomer, {
            companyId,
            stripeCustomerId: customerId,
          });
        }

        let invoiceId = claim.stripeInvoiceId;
        if (!invoiceId) {
          const created = await stripe.invoices.create(
            {
              customer: customerId,
              collection_method: "send_invoice",
              days_until_due: DAYS_UNTIL_DUE,
              currency: "eur",
              auto_advance: false,
              pending_invoice_items_behavior: "exclude",
              description: `UNLOCKED pay-as-you-go: ${monthLabel(month)}`,
              metadata: { type: "payg_fee", companyId, month },
            },
            { idempotencyKey: `payg-invoice-${companyId}-${month}` }
          );
          invoiceId = created.id!;
          // Saved straight away so a retry reuses this invoice instead of making another.
          await ctx.runMutation(internal.billing.recordInvoice, {
            invoiceDocId: claim.invoiceDocId,
            stripeInvoiceId: invoiceId,
          });
        }

        let invoice = await stripe.invoices.retrieve(invoiceId);
        if (invoice.status === "draft") {
          if ((invoice.lines?.data.length ?? 0) === 0) {
            const capped = claim.amountCents < claim.bookingCount * PAYG_FEE_CENTS;
            await stripe.invoiceItems.create(
              {
                customer: customerId,
                invoice: invoiceId,
                amount: claim.amountCents,
                currency: "eur",
                description:
                  `${claim.bookingCount} bookings × €${(PAYG_FEE_CENTS / 100).toFixed(2)}` +
                  (capped ? ` (capped at €${(claim.amountCents / 100).toFixed(2)})` : ""),
              } as any,
              { idempotencyKey: `payg-item-${companyId}-${month}` }
            );
          }
          invoice = await stripe.invoices.finalizeInvoice(invoiceId);
          invoice = await stripe.invoices.sendInvoice(invoiceId);
        }

        const status =
          invoice.status === "paid" ? "paid" : invoice.status === "void" ? "void" : "open";
        await ctx.runMutation(internal.billing.recordInvoice, {
          invoiceDocId: claim.invoiceDocId,
          status,
          hostedInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
        });
        results.push({ companyId, outcome: `${status} €${(claim.amountCents / 100).toFixed(2)}` });
      } catch (e: any) {
        console.error(`[billing] PAYG invoice failed for ${companyId} ${month}:`, e);
        await ctx.runMutation(internal.billing.recordInvoice, {
          invoiceDocId: claim.invoiceDocId,
          status: "failed",
          error: String(e?.message ?? e).slice(0, 500),
        });
        results.push({ companyId, outcome: "failed" });
      }
    }

    if (results.length) console.log(`[billing] PAYG ${month}:`, JSON.stringify(results));
    return { month, results };
  },
});

/**
 * One-off: move every free/starter/pro/enterprise company to the new plans.
 * Companies whose legacy Stripe subscription is still running get
 * cancel_at_period_end and switch to pay-as-you-go when Stripe ends it (the
 * webhook does that); everyone else moves now. Defaults to a dry run.
 *
 *   npx convex run billingStripe:migrateLegacyPlans '{"dryRun": true}'
 */
export const migrateLegacyPlans = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (
    ctx,
    { dryRun = true }
  ): Promise<{ dryRun: boolean; movedToPaygNow: string[]; subscriptionEndsThenPayg: string[] }> => {
    const legacy: LegacyCompany[] = await ctx.runQuery(internal.billing.legacyPlanCompanies, {});
    const stripe = legacy.some((c) => c.stripeSubscriptionId) ? getStripe() : null;

    const moveNow: LegacyCompany[] = [];
    const cancelAtPeriodEnd: (LegacyCompany & { endsAt: string })[] = [];

    for (const c of legacy) {
      if (c.stripeSubscriptionId && stripe) {
        const sub = await stripe.subscriptions.retrieve(c.stripeSubscriptionId);
        if (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") {
          const end = (sub as any).current_period_end ?? sub.items?.data?.[0]?.current_period_end;
          cancelAtPeriodEnd.push({ ...c, endsAt: end ? new Date(end * 1000).toISOString() : "?" });
          if (!dryRun && !sub.cancel_at_period_end) {
            await stripe.subscriptions.update(c.stripeSubscriptionId, {
              cancel_at_period_end: true,
              metadata: { cancelledBy: "plan-migration-2026-11" },
            });
          }
          continue;
        }
      }
      moveNow.push(c);
    }

    if (!dryRun && moveNow.length) {
      await ctx.runMutation(internal.billing.moveToPayg, {
        companyIds: moveNow.map((c) => c.companyId),
      });
    }

    return {
      dryRun,
      movedToPaygNow: moveNow.map((c) => `${c.name} (${c.plan ?? "no plan"})`),
      subscriptionEndsThenPayg: cancelAtPeriodEnd.map((c) => `${c.name} (${c.plan}) at ${c.endsAt}`),
    };
  },
});
