import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * The URL of a player's profile photo. An uploaded photo lives in storage
 * (avatarStorageId) and `avatar` is then empty, so always resolve it here.
 */
export async function avatarUrl(
  ctx: QueryCtx | MutationCtx,
  user: Pick<Doc<"users">, "avatar" | "avatarStorageId"> | null | undefined
): Promise<string> {
  if (!user) return "";
  if (user.avatarStorageId) {
    const url = await ctx.storage.getUrl(user.avatarStorageId);
    if (url) return url;
  }
  return user.avatar ?? "";
}
