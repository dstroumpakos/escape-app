import { Linking } from 'react-native';
import { convex } from './convex';
import { api } from '../convex/_generated/api';
import { visitorId } from './visitorId';

export type BookingTarget = { kind: 'url'; url: string } | { kind: 'phone'; phone: string } | null | undefined;

/** Opens the escape room's own booking page (or calls them) and counts the click. */
export async function openBooking(roomId: string, target: BookingTarget): Promise<boolean> {
  if (!target) return false;
  visitorId()
    .then((vid) => convex.mutation(api.externalLinks.trackBookClick, { roomId: roomId as any, visitorId: vid }))
    .catch(() => {});
  const url = target.kind === 'url' ? target.url : `tel:${target.phone.split('').filter((c) => '0123456789+'.includes(c)).join('')}`;
  // Only web links and phone calls (the server already checked the link).
  if (!url.startsWith('https://') && !url.startsWith('http://') && !url.startsWith('tel:')) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
