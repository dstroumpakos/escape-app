/**
 * Capitals the Greek way: no accent marks (ΤΡΟΜΟΣ, not ΤΡΌΜΟΣ). CSS-style
 * textTransform: 'uppercase' keeps the accents on iOS, so use this instead.
 */
export function caps(s: string): string {
  return s.normalize('NFD').replace(/[̀-́͂]/g, '').normalize('NFC').toUpperCase();
}

/** Distance between two points in km (haversine). */
export function kmBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
