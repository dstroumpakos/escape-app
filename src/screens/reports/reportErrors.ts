// Maps the report errors thrown in convex/reports.ts (ConvexError messages) to translated text.

const KNOWN: Record<string, string> = {
  'This booking has already been reported': 'reports.err.alreadyReported',
  'Reports can only be sent within 24 hours after the game': 'reports.err.companyWindow',
  'You can report a player once the game has started': 'reports.err.notStarted',
  'You have already reported this game': 'reports.err.roomAlready',
  'Reports can be sent up to 30 days after the game': 'reports.err.roomWindow',
  'Please describe what happened': 'reports.err.describe',
  'Photos must be images up to 10 MB': 'reports.err.photo',
  'Up to 5 photos': 'reports.err.photoCount',
};

export function reportErrorText(err: unknown, t: (key: string) => string): string {
  const data = (err as any)?.data;
  const msg = typeof data === 'string' ? data : '';
  if (msg && KNOWN[msg]) return t(KNOWN[msg]);
  return msg || t('reports.err.generic');
}
