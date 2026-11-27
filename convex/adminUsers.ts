import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAdminSession } from "./adminSession";

/**
 * Admin: every player account, newest first, for the admin Users tab.
 * Search and filters run in the browser; the admin dashboard already reads
 * the whole users table, so this stays fine at today's size.
 * Never returns password hashes or Apple/Google ids, only which methods are set.
 */
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdminSession(ctx, args.sessionToken);
    const users = await ctx.db.query("users").order("desc").collect();

    const bookingsByUser = new Map<string, number>();
    for (const b of await ctx.db.query("bookings").collect()) {
      if (!b.userId || b.status === "cancelled") continue;
      const k = String(b.userId);
      bookingsByUser.set(k, (bookingsByUser.get(k) ?? 0) + 1);
    }

    const now = Date.now();
    return await Promise.all(
      users.map(async (u) => {
        let avatar = u.avatar;
        if (u.avatarStorageId) avatar = (await ctx.storage.getUrl(u.avatarStorageId)) ?? avatar;
        const methods: ("email" | "apple" | "google")[] = [];
        if (u.password) methods.push("email");
        if (u.appleId) methods.push("apple");
        if (u.googleId) methods.push("google");
        return {
          _id: u._id,
          createdAt: u._creationTime,
          name: u.name,
          email: u.email,
          phone: u.phone ?? "",
          city: u.city ?? "",
          avatar,
          language: u.language ?? "",
          methods,
          emailVerified: u.emailVerified !== false,
          isPremium: !!u.isPremium && (!u.premiumExpiresAt || u.premiumExpiresAt > now),
          premiumExpiresAt: u.premiumExpiresAt ?? null,
          isAdmin: !!u.isAdmin,
          played: u.played,
          escaped: u.escaped,
          bookings: bookingsByUser.get(String(u._id)) ?? 0,
        };
      })
    );
  },
});
