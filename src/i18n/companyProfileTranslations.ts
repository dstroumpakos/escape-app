/**
 * Photo sections of a company's profile (convex/companyProfile.ts). Same texts
 * as the website (escape-web/src/lib/i18nCompanyProfile.ts). Merged in
 * translations.ts.
 */
const en: Record<string, string> = {
  'sh.title': 'Share',
  'co.photos': 'Photos',
  'co.teamPhotos': 'Team photos',
  'co.escaped': 'Escaped',
  'co.otherPhotos': 'Other photos',
  'co.close': 'Close',
  'co.allRooms': 'All',
};

const el: Record<string, string> = {
  'sh.title': 'Κοινοποίηση',
  'co.photos': 'Φωτογραφίες',
  'co.teamPhotos': 'Φωτογραφίες ομάδων',
  'co.escaped': 'Απέδρασαν',
  'co.otherPhotos': 'Άλλες φωτογραφίες',
  'co.close': 'Κλείσιμο',
  'co.allRooms': 'Όλα',
};

export const companyProfileTranslations = { en, el };
