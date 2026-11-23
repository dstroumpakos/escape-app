import { Share, Platform } from 'react-native';

const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://unlocked.gr').replace(/\/+$/, '');

/**
 * Opens the phone's share menu (Instagram, Facebook, WhatsApp…) with a link to
 * the profile the photo is on. The story-image card (like the website's) needs
 * a new native build; until then the app shares the link.
 */
export async function sharePhoto({ title, path }: { title: string; path: string }) {
  const link = SITE + path;
  try {
    await Share.share(
      Platform.OS === 'ios' ? { message: title, url: link } : { message: `${title}\n${link}`, title },
    );
  } catch {
    // Menu closed or not available: nothing to do
  }
}
