/**
 * Stripe Payment Service
 *
 * Stub implementation — install @stripe/stripe-react-native and replace
 * the mock functions below with real Stripe calls.
 *
 * Setup steps:
 * 1. npm install @stripe/stripe-react-native
 * 2. Add to app.json plugins: ["@stripe/stripe-react-native", { "merchantIdentifier": "merchant.com.unlocked.escapeapp" }]
 * 3. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env
 * 4. Create a Convex HTTP action or backend endpoint to create PaymentIntents
 * 5. Replace the placeholder functions below with real Stripe SDK calls
 */

const STRIPE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
}

/**
 * Initialize Stripe — call once at app startup.
 * Replace with: `await initStripe({ publishableKey: STRIPE_KEY, merchantIdentifier: '...' })`
 */
export async function initializePayments(): Promise<void> {
  if (!STRIPE_KEY) {
    console.warn('[Payments] Missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY — payments disabled');
    return;
  }
  // TODO: import { initStripe } from '@stripe/stripe-react-native';
  // await initStripe({ publishableKey: STRIPE_KEY, merchantIdentifier: 'merchant.com.unlocked.escapeapp' });
  console.log('[Payments] Stripe initialized (stub)');
}

/**
 * Create a payment intent on the server and confirm on the client.
 *
 * In production:
 * 1. Call your backend to create a PaymentIntent (returns clientSecret)
 * 2. Use presentPaymentSheet() or confirmPayment() with the clientSecret
 */
export async function processPayment(params: {
  amount: number; // in cents
  currency?: string;
  description?: string;
  customerEmail?: string;
}): Promise<PaymentResult> {
  if (!STRIPE_KEY) {
    return { success: false, error: 'Payment system not configured' };
  }

  // TODO: Replace with real implementation:
  //
  // 1. const { clientSecret } = await convexHttpAction('createPaymentIntent', {
  //      amount: params.amount,
  //      currency: params.currency || 'eur',
  //    });
  //
  // 2. const { error } = await confirmPayment(clientSecret, {
  //      paymentMethodType: 'Card',
  //    });
  //
  // 3. if (error) return { success: false, error: error.message };
  //    return { success: true, paymentIntentId: '...' };

  console.warn('[Payments] processPayment called but Stripe is not yet integrated');
  return { success: false, error: 'Payments not yet configured — contact support' };
}

/**
 * Process Apple Pay payment.
 *
 * In production:
 * 1. Call backend for PaymentIntent
 * 2. Use presentApplePay() or the payment sheet
 */
export async function processApplePay(params: {
  amount: number;
  currency?: string;
  label: string;
}): Promise<PaymentResult> {
  if (!STRIPE_KEY) {
    return { success: false, error: 'Payment system not configured' };
  }

  console.warn('[Payments] processApplePay called but Stripe is not yet integrated');
  return { success: false, error: 'Apple Pay not yet configured — contact support' };
}

/**
 * Check whether payments are configured.
 */
export function isPaymentEnabled(): boolean {
  return !!STRIPE_KEY && STRIPE_KEY !== 'pk_test_xxxxxxxxxxxx';
}
