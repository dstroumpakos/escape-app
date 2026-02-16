/**
 * Crash Reporting Service
 *
 * Stub implementation — install @sentry/react-native and replace
 * the mock functions below with real Sentry calls.
 *
 * Setup steps:
 * 1. npx expo install @sentry/react-native
 * 2. Add to app.json plugins: ["@sentry/react-native/expo"]
 * 3. Set EXPO_PUBLIC_SENTRY_DSN in .env
 * 4. Replace the placeholder functions below
 */

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

/**
 * Initialize Sentry — call once at app startup (in index.ts or App.tsx).
 */
export function initCrashReporting(): void {
  if (!SENTRY_DSN || SENTRY_DSN.includes('xxxx')) {
    console.log('[CrashReporting] Sentry DSN not configured — crash reporting disabled');
    return;
  }

  // TODO: Replace with real Sentry init:
  // import * as Sentry from '@sentry/react-native';
  // Sentry.init({
  //   dsn: SENTRY_DSN,
  //   environment: process.env.EXPO_PUBLIC_APP_ENV || 'development',
  //   tracesSampleRate: 0.2,
  //   enableAutoSessionTracking: true,
  // });

  console.log('[CrashReporting] Sentry initialized (stub)');
}

/**
 * Capture a handled exception.
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  // TODO: Sentry.captureException(error, { extra: context });
  console.error('[CrashReporting]', error.message, context);
}

/**
 * Capture a breadcrumb for debugging context.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  // TODO: Sentry.addBreadcrumb({ message, data, level: 'info' });
  if (__DEV__) console.log('[Breadcrumb]', message, data);
}

/**
 * Set the current user for crash reports.
 */
export function setUser(userId: string | null, email?: string): void {
  // TODO: Sentry.setUser(userId ? { id: userId, email } : null);
}
