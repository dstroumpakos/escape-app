import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Internal mutation to save translations back to the room
// Separated from translate.ts because "use node" files can't export mutations
export const saveTranslations = internalMutation({
  args: {
    roomId: v.id("rooms"),
    storyTranslations: v.optional(
      v.object({
        en: v.optional(v.string()),
        el: v.optional(v.string()),
        nl: v.optional(v.string()),
      })
    ),
    descriptionTranslations: v.optional(
      v.object({
        en: v.optional(v.string()),
        el: v.optional(v.string()),
        nl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { roomId, ...translations } = args;
    const updates: Record<string, unknown> = {};
    if (translations.storyTranslations)
      updates.storyTranslations = translations.storyTranslations;
    if (translations.descriptionTranslations)
      updates.descriptionTranslations = translations.descriptionTranslations;
    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(roomId, updates);
    }
  },
});
