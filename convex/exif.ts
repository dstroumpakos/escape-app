/**
 * Just enough EXIF reading for Rooms Played proof photos (plays.readProof):
 * the date the photo was taken and its GPS position, from a JPEG.
 * Pure DataView code, so it runs in the default Convex runtime.
 * Anything it can't read comes back as undefined (most messaging apps and
 * many browsers strip EXIF, so missing data is normal, not suspicious).
 */

export type ExifInfo = {
  takenOn?: string; // YYYY-MM-DD, the camera's local date
  lat?: number;
  lng?: number;
};

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;

export function readExif(buf: ArrayBuffer): ExifInfo {
  try {
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}; // not a JPEG
    let off = 2;
    while (off + 4 <= view.byteLength) {
      const marker = view.getUint16(off);
      if ((marker & 0xff00) !== 0xff00) return {};
      const size = view.getUint16(off + 2);
      if (marker === 0xffe1 && off + 10 <= view.byteLength && view.getUint32(off + 4) === 0x45786966) {
        // "Exif\0\0" then the TIFF header
        return readTiff(view, off + 10, Math.min(view.byteLength, off + 2 + size));
      }
      if (marker === 0xffda) return {}; // image data starts: no EXIF before it
      off += 2 + size;
    }
  } catch {
    // Broken file: no hints.
  }
  return {};
}

function readTiff(view: DataView, start: number, end: number): ExifInfo {
  const order = view.getUint16(start);
  const le = order === 0x4949; // "II" little endian, "MM" big endian
  if (!le && order !== 0x4d4d) return {};
  const u16 = (o: number) => view.getUint16(start + o, le);
  const u32 = (o: number) => view.getUint32(start + o, le);
  const inRange = (o: number, n: number) => start + o >= start && start + o + n <= end;

  type Entry = { tag: number; type: number; count: number; valueOff: number };
  const entries = (ifd: number): Entry[] => {
    if (!inRange(ifd, 2)) return [];
    const n = u16(ifd);
    const out: Entry[] = [];
    for (let i = 0; i < n && i < 200; i++) {
      const e = ifd + 2 + i * 12;
      if (!inRange(e, 12)) break;
      out.push({ tag: u16(e), type: u16(e + 2), count: u32(e + 4), valueOff: e + 8 });
    }
    return out;
  };
  const ascii = (e: Entry): string => {
    const at = e.count <= 4 ? e.valueOff : u32(e.valueOff);
    if (!inRange(at, e.count)) return "";
    let s = "";
    for (let i = 0; i < e.count; i++) {
      const c = view.getUint8(start + at + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (e: Entry): number[] => {
    const at = u32(e.valueOff);
    const out: number[] = [];
    for (let i = 0; i < e.count && i < 3; i++) {
      if (!inRange(at + i * 8, 8)) return [];
      const num = u32(at + i * 8);
      const den = u32(at + i * 8 + 4);
      out.push(den ? num / den : 0);
    }
    return out;
  };

  const info: ExifInfo = {};
  const ifd0 = entries(u32(4));
  let dateStr = "";
  for (const e of ifd0) {
    if (e.tag === TAG_DATETIME && !dateStr) dateStr = ascii(e);
    if (e.tag === TAG_EXIF_IFD) {
      for (const x of entries(u32(e.valueOff))) {
        if (x.tag === TAG_DATETIME_ORIGINAL) dateStr = ascii(x) || dateStr;
      }
    }
    if (e.tag === TAG_GPS_IFD) {
      let latRef = "", lngRef = "";
      let lat: number[] = [], lng: number[] = [];
      for (const g of entries(u32(e.valueOff))) {
        if (g.tag === 1) latRef = ascii(g);
        if (g.tag === 2) lat = rationals(g);
        if (g.tag === 3) lngRef = ascii(g);
        if (g.tag === 4) lng = rationals(g);
      }
      if (lat.length === 3 && lng.length === 3) {
        const la = (lat[0] + lat[1] / 60 + lat[2] / 3600) * (latRef === "S" ? -1 : 1);
        const lo = (lng[0] + lng[1] / 60 + lng[2] / 3600) * (lngRef === "W" ? -1 : 1);
        // 0,0 is what some cameras write when they have no fix.
        if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la !== 0 || lo !== 0)) {
          info.lat = la;
          info.lng = lo;
        }
      }
    }
  }
  // "YYYY:MM:DD HH:MM:SS"
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(dateStr);
  if (m && m[1] !== "0000") info.takenOn = `${m[1]}-${m[2]}-${m[3]}`;
  return info;
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
