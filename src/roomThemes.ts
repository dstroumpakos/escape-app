/**
 * The one list of room categories, the same values the website uses
 * (escape-web/src/lib/roomThemes.ts). Companies pick from it in the room
 * editor and players filter by it on Discover. `value` is what gets stored in
 * rooms.theme, so never rename an existing one.
 */
export const ROOM_THEMES: { value: string; key: string }[] = [
  { value: 'Horror', key: 'theme.horror' },
  { value: 'Thriller', key: 'theme.thriller' },
  { value: 'Mystery', key: 'theme.mystery' },
  { value: 'Detective', key: 'theme.detective' },
  { value: 'Puzzle', key: 'theme.puzzle' },
  { value: 'Adventure', key: 'theme.adventure' },
  { value: 'Historical', key: 'theme.historical' },
  { value: 'Sci-Fi', key: 'theme.sciFi' },
  { value: 'Science', key: 'theme.science' },
  { value: 'Paranormal', key: 'theme.paranormal' },
  { value: 'Medieval', key: 'theme.medieval' },
  { value: 'Fantasy', key: 'theme.fantasy' },
  { value: 'Comedy', key: 'theme.comedy' },
];

export const ROOM_THEME_VALUES = ROOM_THEMES.map((th) => th.value);

/** i18n key for each stored theme value. */
export const ROOM_THEME_KEYS: Record<string, string> = Object.fromEntries(
  ROOM_THEMES.map((th) => [th.value, th.key]),
);
