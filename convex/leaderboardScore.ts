import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { athensDate } from "./companyStats";
import { readPublicCache } from "./publicCache";
import { optionalUser, legacyUserIdV } from "./userSession";

/**
 * The leaderboard score. Points only for things UNLOCKED can check:
 * a game counts when the team QR was scanned (stamps) or an old booking was
 * completed; rooms players add by hand do not count. The rules are shown on
 * the leaderboard page, so keep src/app/leaderboard (SCORE_RULES) in step.
 */
export const SCORE = {
  game: 20, // each room played (stamp or completed booking), once per room
  escape: 10, // ...and escaped
  review: 3, // each published review
  longReview: 3, // ...with 100+ characters of text
  longReviewChars: 100,
  badge: 5, // each trophy earned
  likePerPost: 1, // each like on your posts...
  maxLikesPerPost: 3, // ...up to 3 per post
  avatar: 5, // profile photo (all-time only)
  cover: 5, // cover photo (all-time only)
} as const;

export type ScoreParts = {
  games: number;
  escapes: number;
  reviews: number;
  badges: number;
  likePoints: number;
  photoPoints: number;
  score: number;
};

const empty = (): Omit<ScoreParts, "score"> => ({ games: 0, escapes: 0, reviews: 0, badges: 0, likePoints: 0, photoPoints: 0 });

/** "YYYY-MM" in Athens, the month the monthly board counts. */
export const athensMonth = (ms: number) => athensDate(ms).slice(0, 7);

type Inputs = {
  stamps: Doc<"stamps">[];
  bookings: Doc<"bookings">[]; // completed only
  reviews: Doc<"reviews">[];
  badges: Doc<"badges">[];
  posts: Doc<"posts">[];
};

/**
 * Score parts per user, all-time and for one month. Works the same for the
 * whole site (leaderboard cache) and one player ("my position").
 */
export function scoreUsers(users: Doc<"users">[], input: Inputs, month: string) {
  const all = new Map<string, ReturnType<typeof empty> & { long: number }>();
  const mon = new Map<string, ReturnType<typeof empty> & { long: number }>();
  const get = (m: typeof all, id: string) => {
    let s = m.get(id);
    if (!s) m.set(id, (s = { ...empty(), long: 0 }));
    return s;
  };

  // Games: one per room per player; an escape anywhere wins.
  const games = new Map<string, { escaped: boolean; month: boolean }>();
  const game = (uid: string, roomId: string, escaped: boolean, inMonth: boolean) => {
    const k = uid + "|" + roomId;
    const g = games.get(k);
    if (!g) games.set(k, { escaped, month: inMonth });
    else {
      g.escaped = g.escaped || escaped;
      g.month = g.month || inMonth;
    }
  };
  for (const st of input.stamps) game(st.userId, st.roomId, st.escaped, athensMonth(st.createdAt) === month);
  for (const b of input.bookings) if (b.userId) game(b.userId, b.roomId, true, (b.date ?? "").slice(0, 7) === month);
  for (const [k, g] of games) {
    const uid = k.split("|")[0];
    for (const [m, on] of [[all, true], [mon, g.month]] as const) {
      if (!on) continue;
      const s = get(m, uid);
      s.games++;
      if (g.escaped) s.escapes++;
    }
  }

  for (const r of input.reviews) {
    if (r.status && r.status !== "published") continue;
    const long = (r.text ?? "").trim().length >= SCORE.longReviewChars ? 1 : 0;
    for (const m of athensMonth(r.createdAt) === month ? [all, mon] : [all]) {
      const s = get(m, r.userId);
      s.reviews++;
      s.long += long;
    }
  }

  for (const b of input.badges) {
    if (!b.earned) continue;
    const inMonth = b.earnedAt ? athensMonth(b.earnedAt) === month : false;
    for (const m of inMonth ? [all, mon] : [all]) get(m, b.userId).badges++;
  }

  for (const p of input.posts) {
    if (!p.authorUserId) continue;
    const pts = Math.min(p.likes ?? 0, SCORE.maxLikesPerPost) * SCORE.likePerPost;
    if (!pts) continue;
    for (const m of athensMonth(p.createdAt) === month ? [all, mon] : [all]) get(m, p.authorUserId).likePoints += pts;
  }

  for (const u of users) {
    const photo = (u.avatar || u.avatarStorageId ? SCORE.avatar : 0) + (u.coverStorageId ? SCORE.cover : 0);
    if (photo) get(all, u._id).photoPoints = photo;
  }

  const finish = (m: typeof all) => {
    const out = new Map<string, ScoreParts>();
    for (const [id, s] of m) {
      const score =
        s.games * SCORE.game +
        s.escapes * SCORE.escape +
        s.reviews * SCORE.review +
        s.long * SCORE.longReview +
        s.badges * SCORE.badge +
        s.likePoints +
        s.photoPoints;
      const { long: _long, ...parts } = s;
      out.set(id, { ...parts, score });
    }
    return out;
  };
  return { allTime: finish(all), month: finish(mon) };
}

/** Everything one player's score is made of (cheap: their own rows only). */
async function scoreOne(ctx: QueryCtx, user: Doc<"users">, month: string) {
  const uid: Id<"users"> = user._id;
  const [stamps, bookings, reviews, badges, posts] = await Promise.all([
    ctx.db.query("stamps").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
    ctx.db.query("bookings").withIndex("by_user_status", (q) => q.eq("userId", uid).eq("status", "completed")).collect(),
    ctx.db.query("reviews").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
    ctx.db.query("badges").withIndex("by_user", (q) => q.eq("userId", uid)).collect(),
    ctx.db.query("posts").withIndex("by_author_user", (q) => q.eq("authorUserId", uid)).collect(),
  ]);
  const r = scoreUsers([user], { stamps, bookings, reviews, badges, posts }, month);
  const zero: ScoreParts = { ...empty(), score: 0 };
  return { allTime: r.allTime.get(uid) ?? zero, month: r.month.get(uid) ?? zero };
}

/** Place = players with a higher score + 1 (scores: every score above 0, high to low). */
function placeOf(scores: number[], score: number): number | null {
  if (score <= 0) return null;
  let lo = 0;
  let hi = scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scores[mid] > score) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/** "My position" on both boards, for the signed-in player. */
export const myPosition = query({
  args: { sessionToken: v.optional(v.string()), userId: legacyUserIdV },
  handler: async (ctx, args) => {
    const user = await optionalUser(ctx, args.sessionToken, args.userId);
    if (!user) return null;
    const cache = await readPublicCache<{ month?: string; scores?: number[]; monthScores?: number[] }>(ctx, "leaderboard");
    const month = cache?.month ?? athensMonth(Date.now());
    const mine = await scoreOne(ctx, user, month);
    return {
      allTime: { ...mine.allTime, place: placeOf(cache?.scores ?? [], mine.allTime.score) },
      month: { ...mine.month, place: placeOf(cache?.monthScores ?? [], mine.month.score) },
    };
  },
});
