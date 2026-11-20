// The time a team's game started (e.g. 9:30), picked by the company at the
// end of the game and shown on the players' stamps. Same file in escape-web (src/lib/playTime.ts).

const pad = (n: number) => String(n).padStart(2, '0');

/** A sensible default: the last :00 or :30 about an hour ago (a game's length). */
export function defaultStartTime(now = new Date()): string {
  const d = new Date(now.getTime() - 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "HH:MM" today, in this device's time zone, or yesterday for a late-night game. */
export function startTimeToMs(hhmm: string, now = new Date()): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return undefined;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  const d = new Date(now);
  d.setHours(h, min, 0, 0);
  if (d.getTime() > now.getTime() + 15 * 60 * 1000) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** "20/11/2026 · 09:30", or the date alone for older stamps without a time. */
export function formatPlayed(playedAt: number | null | undefined, createdAt: number): string {
  if (!playedAt) return new Date(createdAt).toLocaleDateString();
  const d = new Date(playedAt);
  return `${d.toLocaleDateString()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Short form for the round stamp: "20/11/26 · 09:30". */
export function shortPlayed(playedAt: number | null | undefined, createdAt: number): string {
  const d = new Date(playedAt ?? createdAt);
  const date = d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
  return playedAt ? `${date} · ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

/** Move "HH:MM" by some minutes, wrapping around midnight (the app's stepper). */
export function shiftTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
