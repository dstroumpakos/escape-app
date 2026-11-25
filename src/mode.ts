/**
 * Puzzles or horror, as on the website's home page (escape-web/src/lib/mode.ts).
 * "puzzle": no scary rooms; "horror": the rooms with some or a lot of fear.
 */
export type Side = 'puzzle' | 'horror';
export type Fear = 'none' | 'some' | 'high';

/** Room themes that count as horror when the company didn't pick a fear level. */
export const HORROR_THEMES = ['Horror', 'Thriller', 'Paranormal'];
/** The themes offered on each side of the home section. */
export const PUZZLE_CHIPS = ['Mystery', 'Detective', 'Puzzle', 'Adventure', 'Historical', 'Fantasy'];
export const HORROR_CHIPS = HORROR_THEMES;

/** The company's own choice (rooms.fearLevel), or a guess from the theme. */
export function fearOf(room: { theme?: string; fearLevel?: string }): Fear {
  const f = room.fearLevel;
  if (f === 'none' || f === 'some' || f === 'high') return f;
  return HORROR_THEMES.includes(room.theme ?? '') ? 'high' : 'none';
}

export function onSide(room: { theme?: string; fearLevel?: string }, side: Side | null | undefined): boolean {
  if (side === 'puzzle') return fearOf(room) !== 'high';
  if (side === 'horror') return fearOf(room) !== 'none';
  return true;
}
