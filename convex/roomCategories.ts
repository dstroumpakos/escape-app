/**
 * What kind of room it is, one list for the backend, the website and the app
 * (the app imports this file from its copy of convex/).
 *
 * - Category: puzzles, puzzles with an actor, or horror (horror always has an
 *   actor). It decides the side of the site the room shows on: the first two
 *   on the puzzle side, horror on the horror side. No room is on both.
 * - Subcategories: as many as the company wants from its side's list. The
 *   first one is also saved in rooms.theme for older app builds.
 *
 * Values are what gets stored, so never rename an existing one; labels live
 * in the translations ("theme.<key>").
 */

export type Category = "puzzle" | "puzzle_actor" | "horror";
export type Side = "puzzle" | "horror";

export const CATEGORIES: Category[] = ["puzzle", "puzzle_actor", "horror"];

export const SUBTHEMES: Record<Side, string[]> = {
  puzzle: ["Mystery", "Detective", "Adventure", "Action", "Historical", "Fantasy", "Sci-Fi", "Comedy", "Kids"],
  horror: ["Mystery", "Thriller", "Paranormal", "Psychological", "Zombie", "Splatter"],
};

export const MAX_SUBTHEMES = 6;

export function sideOfCategory(c: Category): Side {
  return c === "horror" ? "horror" : "puzzle";
}

/** Themes of the old single-theme rooms that meant horror. */
const OLD_HORROR_THEMES = ["Horror", "Thriller", "Paranormal"];

type RoomLike = { category?: string | null; subthemes?: string[] | null; theme?: string | null; fearLevel?: string | null };

/** The room's category; rooms saved before categories existed get one from their old theme and fear level. */
export function categoryOf(room: RoomLike): Category {
  const c = room.category;
  if (c === "puzzle" || c === "puzzle_actor" || c === "horror") return c;
  if (room.fearLevel === "high") return "horror";
  if (room.fearLevel === "none") return "puzzle";
  return OLD_HORROR_THEMES.includes(room.theme ?? "") ? "horror" : "puzzle";
}

export function sideOf(room: RoomLike): Side {
  return sideOfCategory(categoryOf(room));
}

/** The room's subcategories; older rooms have their single theme ("Horror" itself is a category now, not a subcategory). */
export function subthemesOf(room: RoomLike): string[] {
  if (room.subthemes && room.subthemes.length) return room.subthemes;
  const t = room.theme ?? "";
  return t && t !== "Horror" ? [t] : [];
}

/** Keeps only valid subcategories for the category, without duplicates, at most MAX_SUBTHEMES. */
export function cleanSubthemes(category: Category, subthemes: string[]): string[] {
  const allowed = SUBTHEMES[sideOfCategory(category)];
  return Array.from(new Set(subthemes.filter((s) => allowed.includes(s)))).slice(0, MAX_SUBTHEMES);
}

/** What goes in rooms.theme (required, read by older app builds). */
export function legacyTheme(category: Category, subthemes: string[]): string {
  return subthemes[0] ?? (category === "horror" ? "Horror" : "Puzzle");
}

type CategoryInput = { category?: Category; subthemes?: string[]; theme?: string; fearLevel?: string };

/**
 * The category fields to save for a create or an edit. New forms send
 * category + subthemes; older app builds still send theme + fearLevel, which
 * only set the category of a room that doesn't have one yet. Returns null when
 * nothing about the kind of room changes.
 */
export function categoryFields(
  input: CategoryInput,
  existing?: RoomLike
): { category: Category; subthemes: string[]; theme: string; fearLevel: undefined } | null {
  let category: Category;
  let subs: string[];
  if (input.category !== undefined || input.subthemes !== undefined) {
    category = input.category ?? categoryOf(existing ?? {});
    subs = cleanSubthemes(category, input.subthemes ?? subthemesOf(existing ?? {}));
  } else if (input.theme !== undefined || input.fearLevel !== undefined) {
    if (existing?.category) return null; // an old build editing a new room: keep what it has
    const merged = { theme: input.theme ?? existing?.theme, fearLevel: input.fearLevel ?? existing?.fearLevel };
    category = categoryOf(merged);
    subs = cleanSubthemes(category, subthemesOf(merged));
  } else {
    return null;
  }
  return { category, subthemes: subs, theme: legacyTheme(category, subs), fearLevel: undefined };
}
