/**
 * Rating and trailer helpers for room screens (same rules as escape-web
 * src/lib/roomMedia.ts).
 *
 * A room can carry a rating from another site (`externalRating`, e.g.
 * EscapeAll), set by the UNLOCKED team. We show whichever has more reviews,
 * our own or the other site's, and always name the other site when it's theirs.
 */

export type ShownRating = {
  rating: number;
  count: number;
  /** Set when the numbers come from another site (e.g. "EscapeAll"). */
  source?: string;
  url?: string;
};

export function shownRating(room: any): ShownRating | null {
  const own = (room?.reviews ?? 0) > 0 ? { rating: room.rating ?? 0, count: room.reviews } : null;
  const ext = room?.externalRating;
  const other =
    ext && ext.count > 0 ? { rating: ext.rating, count: ext.count, source: ext.source as string, url: ext.url as string | undefined } : null;
  if (own && (!other || own.count >= other.count)) return own;
  return other;
}

/** Always one decimal: 4.9, 5.0. */
export function formatRating(r: number): string {
  return (Math.round(r * 10) / 10).toFixed(1);
}

/**
 * A stored trailer link (only YouTube / Vimeo are accepted by the backend):
 * the address to open and, for YouTube, a thumbnail. Null if it isn't one.
 * The app opens the video in the YouTube / Vimeo app or the browser instead of
 * embedding it.
 */
export function trailerOf(url: string | undefined | null): { open: string; thumb: string | null } | null {
  if (!url) return null;
  const m = /^https?:\/\/(?:www\.|m\.)?([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  const path = m[2] || '';
  const query = m[3] || '';
  let yt: string | null = null;
  if (host === 'youtube.com') {
    const v = /[?&]v=([\w-]{6,20})(?:&|$)/.exec(query);
    yt = v ? v[1] : null;
  } else if (host === 'youtu.be') {
    const id = path.slice(1);
    yt = /^[\w-]{6,20}$/.test(id) ? id : null;
  }
  if (yt) return { open: `https://www.youtube.com/watch?v=${yt}`, thumb: `https://img.youtube.com/vi/${yt}/hqdefault.jpg` };
  if (host === 'vimeo.com') {
    const id = path.split('/').find((p) => /^\d{5,12}$/.test(p));
    if (id) return { open: `https://vimeo.com/${id}`, thumb: null };
  }
  return null;
}
