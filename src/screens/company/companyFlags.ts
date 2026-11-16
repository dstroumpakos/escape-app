/**
 * Small on-device flags for the business portal (same idea as the website's
 * lib/companyUi.ts flags). Read failures count as "not set".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Set when the widget code was copied or emailed; ticks the dashboard checklist. */
export const WIDGET_COPIED = '@company_widget_copied';
/** Set when the getting-started checklist was hidden. */
export const CHECKLIST_DISMISSED = '@company_checklist_dismissed';

export async function readFlag(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === '1';
  } catch {
    return false;
  }
}

export function setFlag(key: string) {
  AsyncStorage.setItem(key, '1').catch(() => {});
}

export function widgetCode(companyId: string) {
  return `<!-- UNLOCKED Booking Widget -->\n<div id="booking-widget"></div>\n<script\n  src="https://widget.unlocked.gr/booking-widget.js"\n  data-company-id="${companyId}"\n  defer></script>`;
}

export const SUPPORT_EMAIL = 'hello@unlocked.gr';
