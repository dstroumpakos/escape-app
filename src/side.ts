import AsyncStorage from '@react-native-async-storage/async-storage';
import { DevSettings } from 'react-native';
import * as Updates from 'expo-updates';
import type { Side } from './mode';

/**
 * The player's side of the app, as on the website (escape-web/src/lib/mode.ts):
 * "puzzle" (riddles and mystery, night-sky navy and gold, no scary rooms) or
 * "horror" (the full dark red experience). No choice yet = the home asks.
 *
 * Every screen builds its styles from src/theme.ts once, when the app starts,
 * so the side is read before the app loads (index.ts) and picking one restarts
 * the app in its colours. Don't import src/theme.ts here.
 */
export const SIDE_KEY = 'unlocked_side';
/** A theme chip picked on the home: Discover opens on it after the restart. */
export const SIDE_THEME_KEY = 'unlocked_side_theme';

declare global {
  // Set by index.ts before the app loads
  // eslint-disable-next-line no-var
  var __UNLOCKED_SIDE: string | null | undefined;
}

/** The side the app started with (null: not picked yet). */
export function getSide(): Side | null {
  const v = globalThis.__UNLOCKED_SIDE;
  return v === 'puzzle' || v === 'horror' ? v : null;
}

export async function readSavedSide(): Promise<Side | null> {
  try {
    const v = await AsyncStorage.getItem(SIDE_KEY);
    return v === 'puzzle' || v === 'horror' ? v : null;
  } catch {
    return null;
  }
}

/** Save the side (null: ask again) and restart the app in its colours. */
export async function chooseSide(side: Side | null, theme?: string): Promise<void> {
  try {
    if (side) await AsyncStorage.setItem(SIDE_KEY, side);
    else await AsyncStorage.removeItem(SIDE_KEY);
    if (theme) await AsyncStorage.setItem(SIDE_THEME_KEY, theme);
  } catch {
    // Storage unavailable: the choice can't last, so there is nothing to restart for
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    // Development builds: expo-updates may be off
    DevSettings.reload();
  }
}

/** The theme chip picked before the restart, once. */
export async function takePendingTheme(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(SIDE_THEME_KEY);
    if (v) await AsyncStorage.removeItem(SIDE_THEME_KEY);
    return v;
  } catch {
    return null;
  }
}

/** Rooms for the side: a puzzle player never sees the scary ones (same as the website's forMode). */
export function forSide<T extends { theme?: string; fearLevel?: string }>(rooms: T[], side: Side | null, fearOf: (r: T) => string): T[] {
  return side === 'puzzle' ? rooms.filter((r) => fearOf(r) !== 'high') : rooms;
}
