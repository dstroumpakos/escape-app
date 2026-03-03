/**
 * Stripe Payment Service
 *
 * For the mobile app we use Stripe Checkout (hosted page) rather than
 * the native Stripe SDK.  The flow:
 *
 * 1. Call a Convex action that creates a Stripe Checkout Session
 *    and returns a URL.
 * 2. Open that URL in the device browser via Linking.openURL().
 * 3. Stripe redirects back to a deep-link (unlocked://…) on success/cancel.
 * 4. A Stripe webhook on the Convex HTTP router confirms payment server-side.
 *
 * This approach avoids native Stripe SDK build issues on Expo and works
 * identically to the web project's flow.
 */

import { Linking } from 'react-native';

const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
}

/**
 * Check whether payments are configured.
 */
export function isPaymentEnabled(): boolean {
  return !!STRIPE_KEY && STRIPE_KEY !== 'pk_test_xxxxxxxxxxxx';
}

/**
 * Initialize — nothing needed for hosted-checkout flow.
 */
export async function initializePayments(): Promise<void> {
  if (!STRIPE_KEY) {
    console.warn('[Payments] Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY — payments disabled');
  }
}

/**
 * Open a Stripe Checkout URL in the device browser.
 * This is the primary payment flow for both bookings and subscriptions.
 */
export async function openCheckout(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('Cannot open checkout URL');
  }
  await Linking.openURL(url);
}

/**
 * Build a deep-link URL for Stripe success / cancel redirects.
 * Format: unlocked://stripe-success?session_id={CHECKOUT_SESSION_ID}
 */
export function buildDeepLink(path: string, params?: Record<string, string>): string {
  const qs = params
    ? '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    : '';
  return `unlocked://${path}${qs}`;
}

