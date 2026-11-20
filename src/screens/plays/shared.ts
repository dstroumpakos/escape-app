import { ConvexError } from 'convex/values';

/** Trust levels of a played room (convex/plays.ts). "confirmed" = a QR stamp. */
export type Level = 'confirmed' | 'verified' | 'vouched' | 'pending' | 'declared' | 'rejected';

export const LEVELS: Record<Level, { color: string; bg: string; icon: string }> = {
  confirmed: { color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: 'ribbon' },
  verified: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', icon: 'shield-checkmark' },
  vouched: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: 'people' },
  pending: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', icon: 'time' },
  declared: { color: '#9ca3af', bg: 'rgba(255,255,255,0.06)', icon: 'ellipse-outline' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: 'close-circle' },
};

export const SITE = 'https://unlocked.gr';

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDay(day: string, language: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString(language === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatEscape(seconds: number | null | undefined): string {
  if (!seconds) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The server's message for a ConvexError, or a generic one. */
export function errorText(err: unknown, fallback: string): string {
  if (err instanceof ConvexError && typeof err.data === 'string') {
    return err.data === 'TOO_MANY_ATTEMPTS' ? fallback : err.data;
  }
  const msg = err instanceof Error ? err.message : '';
  const m = /ConvexError: ([^\n]+)/.exec(msg);
  return m ? m[1].trim() : fallback;
}

/** Uploads a local file (image picker uri) to Convex storage. */
export async function uploadUri(uploadUrl: string, uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
  if (!res.ok) throw new Error('Upload failed');
  const { storageId } = await res.json();
  return storageId as string;
}
