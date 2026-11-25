import { internalMutation } from "./_generated/server";
import { categoryOf, cleanSubthemes, legacyTheme, subthemesOf } from "./roomCategories";

/**
 * One-off: give every room saved before categories existed a category and
 * subcategories (roomCategories.ts), from its old theme and fear level.
 * Safe to run again; rooms that already have a category are left alone.
 *   npx convex run roomCategoryMigration:run
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rooms = await ctx.db.query("rooms").collect();
    let changed = 0;
    for (const r of rooms) {
      if (r.category) continue;
      const category = categoryOf(r);
      const subthemes = cleanSubthemes(category, subthemesOf(r));
      await ctx.db.patch(r._id, { category, subthemes, theme: legacyTheme(category, subthemes), fearLevel: undefined });
      changed++;
    }
    return { rooms: rooms.length, changed };
  },
});
