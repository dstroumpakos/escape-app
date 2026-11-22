import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Upload checks (checklist item 16).
// generateUploadUrl can't limit what gets uploaded, so every function that
// saves a storageId checks the stored file's type and size here.

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * MB;
export const MAX_PHOTO_BYTES = 25 * MB; // full-size game photos
export const MAX_VIDEO_BYTES = 100 * MB;

export const UPLOADS_PER_HOUR_USER = 60;
export const UPLOADS_PER_HOUR_COMPANY = 500; // the photo tool uploads many at once

type Kind = "image" | "video";

export async function assertUpload(
  ctx: QueryCtx | MutationCtx,
  storageId: Id<"_storage">,
  kind: Kind | Kind[],
  maxBytes: number
): Promise<void> {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const meta = await ctx.db.system.get(storageId);
  if (!meta) throw new ConvexError("Upload not found");
  const type = meta.contentType ?? "";
  // SVG can carry scripts: never accept it as a photo.
  if (!kinds.some((k) => type.startsWith(`${k}/`)) || type.includes("svg")) {
    throw new ConvexError(kinds.includes("video") ? "Only photos and videos can be uploaded" : "Only images can be uploaded");
  }
  if (meta.size > maxBytes) {
    throw new ConvexError(`File is too large (max ${Math.round(maxBytes / MB)} MB)`);
  }
}

/**
 * True for a file URL of our own Convex storage. Used wherever a URL is
 * saved and later shown as a link or fetched by the server.
 */
export function isOwnStorageUrl(u: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (!parsed.pathname.startsWith("/api/storage/")) return false;
  const own = process.env.CONVEX_CLOUD_URL; // set by Convex for every deployment
  if (own) return parsed.origin === new URL(own).origin;
  return parsed.hostname.endsWith(".convex.cloud");
}

/** The URL of a stored file, worked out on the server (never taken from the client). */
export async function storageUrl(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">): Promise<string> {
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new ConvexError("Upload not found");
  return url;
}

/**
 * Logo/overlay of a photo preset: from its storageId when given, otherwise
 * the URL must be one of our own stored files (or empty to clear it).
 */
export async function presetImageUrl(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined,
  url: string | undefined
): Promise<string | undefined> {
  if (storageId) return await storageUrl(ctx, storageId);
  if (!url) return url;
  if (!isOwnStorageUrl(url)) throw new ConvexError("Images must be uploaded files");
  return url;
}

export async function assertOptionalImage(
  ctx: QueryCtx | MutationCtx,
  storageId: Id<"_storage"> | undefined,
  maxBytes = MAX_IMAGE_BYTES
): Promise<void> {
  if (storageId) await assertUpload(ctx, storageId, "image", maxBytes);
}
