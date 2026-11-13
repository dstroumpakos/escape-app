// Platform plans in the app. Mirrors convex/plans.ts:
//  - Unlimited: €198/month or €1980/year (Stripe subscription)
//  - Pay as you go: €3 per booking, never more than €250 a month (invoiced monthly)
// Both include every feature and unlimited rooms. Legacy values
// (free/starter/pro/enterprise) read as pay as you go.
import type { Ionicons } from '@expo/vector-icons';

export type PlanId = 'unlimited' | 'payg';

export const UNLIMITED_PRICE = { monthly: 198, yearly: 1980 } as const;
export const PAYG_FEE = 3;
export const PAYG_CAP = 250;

export function asPlanId(plan: unknown): PlanId {
  return plan === 'unlimited' ? 'unlimited' : 'payg';
}

export const PLAN_STYLE: Record<PlanId, { bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  payg: { bg: 'rgba(16,185,129,0.15)', text: '#10B981', icon: 'receipt-outline' },
  unlimited: { bg: 'rgba(124,77,255,0.2)', text: '#B39DFF', icon: 'infinite' },
};

const SHARED = ['plans.fRooms', 'plans.fWidget', 'plans.fPayments', 'plans.fAnalytics', 'plans.fFeatured'];

export const PLAN_OPTIONS: {
  id: PlanId;
  popular: boolean;
  features: string[];
}[] = [
  // The €250 cap is shown next to the price, so it isn't repeated here.
  { id: 'payg', popular: false, features: ['plans.paygNoFixed', 'plans.paygInvoice', ...SHARED] },
  { id: 'unlimited', popular: true, features: ['plans.unlimitedNoFees', ...SHARED] },
];

/** "€3" or "€198" (monthly) / "€1980" (yearly) */
export function planPrice(id: PlanId, period: 'monthly' | 'yearly' = 'monthly'): string {
  return id === 'payg' ? `€${PAYG_FEE}` : `€${UNLIMITED_PRICE[period]}`;
}

export function euros(cents: number): string {
  return `€${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
