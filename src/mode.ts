/**
 * Puzzles or horror, as on the website (escape-web/src/lib/mode.ts). The side
 * comes from the room's category (convex/roomCategories.ts): puzzles and
 * puzzles with an actor are on the puzzle side, horror on the horror side.
 */
import { SUBTHEMES, sideOf, type Side } from '../convex/roomCategories';
export {
  CATEGORIES,
  SUBTHEMES,
  MAX_SUBTHEMES,
  categoryOf,
  sideOf,
  sideOfCategory,
  subthemesOf,
  cleanSubthemes,
  legacyTheme,
  type Category,
  type Side,
} from '../convex/roomCategories';

/** The subcategories offered on each half of the home split. */
export const PUZZLE_CHIPS = SUBTHEMES.puzzle.slice(0, 6);
export const HORROR_CHIPS = SUBTHEMES.horror;

/** Discover chip for "puzzles with an actor". */
export const ACTOR_FILTER = '__actor';

export function onSide(room: Parameters<typeof sideOf>[0], side: Side | null | undefined): boolean {
  return !side || sideOf(room) === side;
}
