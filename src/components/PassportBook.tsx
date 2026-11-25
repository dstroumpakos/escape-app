import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing, PanResponder, useWindowDimensions, AccessibilityInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { EyeKeyhole } from './EyeKeyhole';
import { StampSeal, tiltFor } from './StampSeal';
import { shortPlayed } from '../playTime';

/**
 * The passport as a real little book, like the website's (escape-web
 * src/components/passport/PassportBook.tsx + PassportPages.tsx): a leather
 * cover, the data page with the photo, then pages of stamps, six per page.
 * Swipe or use the arrows to turn a page; it turns on its spine.
 */

export const STAMPS_PER_PAGE = 6;
const FLIP_MS = 650;
const GOLD = theme.colors.gold;

type Stamp = { _id: string; roomTitle: string; theme: string; escaped: boolean; playedAt: number | null; createdAt: number };
type Data = { name: string; avatar: string; passportNo: string; total: number; cities: number; escapedPct: number };
type Labels = {
  open: string; name: string; number: string; stamps: string; cities: string; escapes: string;
  how: string; stampsTitle: string; nextSlot: string; page: (n: number, total: number) => string;
};
type Page = { key: string; kind: 'cover' | 'paper'; render: (w: number, h: number) => React.ReactNode };

export function PassportBook({
  data, stamps, progressText, pct, labels, onPick,
}: {
  data: Data;
  /** Oldest first, the way a passport fills up */
  stamps: Stamp[];
  progressText: string;
  pct: number;
  labels: Labels;
  onPick: (s: Stamp) => void;
}) {
  const { width } = useWindowDimensions();
  const W = Math.min(width - 32, 420);
  const H = W / 0.72;

  const pages: Page[] = useMemo(() => {
    const stampPages = Math.max(1, Math.ceil((stamps.length + 1) / STAMPS_PER_PAGE));
    return [
      { key: 'cover', kind: 'cover', render: () => <Cover openLabel={labels.open} /> },
      { key: 'data', kind: 'paper', render: () => <DataPage data={data} progressText={progressText} pct={pct} labels={labels} /> },
      ...Array.from({ length: stampPages }, (_, p) => ({
        key: `s${p}`,
        kind: 'paper' as const,
        render: (w: number) => (
          <StampPage
            w={w}
            stamps={stamps.slice(p * STAMPS_PER_PAGE, (p + 1) * STAMPS_PER_PAGE)}
            nextHere={p === stampPages - 1}
            pageNo={p + 2}
            title={labels.stampsTitle}
            nextLabel={labels.nextSlot}
            onPick={onPick}
          />
        ),
      })),
      { key: 'end', kind: 'paper', render: () => <EndPage how={labels.how} /> },
    ];
  }, [data, stamps, progressText, pct, labels, onPick]);

  const [i, setI] = useState(0);
  // The turning leaf: which page, and whether it turns away (fwd) or back in
  const [turn, setTurn] = useState<{ leaf: number; under: number; fwd: boolean } | null>(null);
  const angle = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const last = pages.length - 1;

  const go = async (to: number) => {
    if (busy.current || to < 0 || to > last || to === i) return;
    busy.current = true;
    const still = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    if (still) {
      setI(to);
      busy.current = false;
      return;
    }
    const fwd = to > i;
    // Forward: the current page turns away over the next one. Back: the
    // previous page turns back in over the current one.
    setTurn(fwd ? { leaf: i, under: to, fwd } : { leaf: to, under: i, fwd });
    angle.setValue(fwd ? 0 : 1);
    Animated.timing(angle, { toValue: fwd ? 1 : 0, duration: FLIP_MS, easing: Easing.bezier(0.45, 0.05, 0.25, 1), useNativeDriver: true }).start(() => {
      setI(to);
      setTurn(null);
      busy.current = false;
    });
  };
  const goRef = useRef(go);
  goRef.current = go;
  const iRef = useRef(i);
  iRef.current = i;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -40) goRef.current(iRef.current + 1);
        else if (g.dx > 40) goRef.current(iRef.current - 1);
      },
    }),
  ).current;

  const rotate = angle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-100deg'] });
  const leafShade = angle.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });
  const underShade = angle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const leafOpacity = angle.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });

  const base = turn ? turn.under : i;
  const paperTotal = pages.length - 2; // without cover and the end page
  const label = i === 0 ? labels.open : i === last ? '' : labels.page(i, paperTotal);

  return (
    <View>
      <View style={{ width: W, height: H, alignSelf: 'center' }} {...pan.panHandlers}>
        {/* The page lying open (under the turning leaf, if any) */}
        <Face page={pages[base]} w={W} h={H} onOpen={base === 0 ? () => go(1) : undefined} />
        {turn && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { opacity: underShade }]} />}

        {turn && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { transformOrigin: 'left center', opacity: leafOpacity, transform: [{ perspective: 1400 }, { rotateY: rotate }] },
            ]}
          >
            <Face page={pages[turn.leaf]} w={W} h={H} />
            <Animated.View style={[StyleSheet.absoluteFill, styles.shade, { opacity: leafShade }]} />
          </Animated.View>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity onPress={() => go(i - 1)} disabled={i === 0 || !!turn} style={[styles.arrow, i === 0 && { opacity: 0.3 }]} accessibilityRole="button">
          <Ionicons name="chevron-back" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.pageLabel}>{label}</Text>
        <TouchableOpacity onPress={() => go(i + 1)} disabled={i === last || !!turn} style={[styles.arrow, i === last && { opacity: 0.3 }]} accessibilityRole="button">
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** One page: the leather cover, or paper with the spine shadow on its left edge. */
function Face({ page, w, h, onOpen }: { page: Page; w: number; h: number; onOpen?: () => void }) {
  if (page.kind === 'cover') {
    return (
      <TouchableOpacity activeOpacity={0.95} onPress={onOpen} disabled={!onOpen} style={[styles.page, styles.cover, { width: w, height: h }]}>
        <LinearGradient colors={['#7a0a12', theme.colors.blood, '#2e0004']} start={{ x: 0.2, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.08, y: 0 }} style={StyleSheet.absoluteFill} />
        {page.render(w, h)}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.page, styles.paper, { width: w, height: h }]}>
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.07, y: 0 }} style={StyleSheet.absoluteFill} />
      {page.render(w, h)}
    </View>
  );
}

function Cover({ openLabel }: { openLabel: string }) {
  return (
    <View style={styles.coverInner}>
      <View pointerEvents="none" style={[styles.frame, { top: 12, left: 12, right: 12, bottom: 12, borderColor: 'rgba(201,154,46,0.45)' }]} />
      <View pointerEvents="none" style={[styles.frame, { top: 18, left: 18, right: 18, bottom: 18, borderColor: 'rgba(201,154,46,0.2)' }]} />
      <Text style={[styles.gold, { fontFamily: theme.fonts.type, fontSize: 13, letterSpacing: 7 }]}>UNLOCKED</Text>
      <View style={{ alignItems: 'center', gap: 14 }}>
        <EyeKeyhole size={92} variant="onRed" />
        <Text style={[styles.gold, { fontFamily: theme.fonts.display, fontSize: 30, letterSpacing: 8 }]}>PASSPORT</Text>
        <Text style={[styles.gold, { fontFamily: theme.fonts.type, fontSize: 11, letterSpacing: 5, opacity: 0.75 }]}>ESCAPE ROOMS</Text>
      </View>
      <Text style={[styles.gold, { fontSize: 12, opacity: 0.8 }]}>{openLabel}</Text>
    </View>
  );
}

/** Machine-readable zone at the foot of the data page, just for the look. */
function mrz(name: string, passportNo: string) {
  const fill = (s: string) => (s + '<'.repeat(36)).slice(0, 36);
  const nm = name.toUpperCase().trim().replace(/\s+/g, '<').replace(/[^A-Z0-9Α-Ω<]/g, '');
  return [fill(`P<UNL${nm}`), fill(passportNo.replace(/-/g, '') + '<<UNLOCKED')];
}

function DataPage({ data, progressText, pct, labels }: { data: Data; progressText: string; pct: number; labels: Labels }) {
  const [l1, l2] = mrz(data.name || '', data.passportNo);
  return (
    <View style={styles.dataPage}>
      <Text style={styles.kicker}>UNLOCKED · PASSPORT</Text>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 14 }}>
        <View style={styles.photo}>
          {data.avatar ? <Image source={{ uri: data.avatar }} style={{ width: '100%', height: '100%' }} /> : <Text style={styles.photoLetter}>{(data.name || '?').charAt(0).toUpperCase()}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{labels.name}</Text>
          <Text style={styles.value} numberOfLines={2}>{data.name}</Text>
          <Text style={[styles.label, { marginTop: 6 }]}>{labels.number}</Text>
          <Text style={[styles.value, { fontFamily: 'Courier', fontWeight: '700' }]}>{data.passportNo}</Text>
        </View>
      </View>

      <View style={styles.stats}>
        {[[String(data.total), labels.stamps], [String(data.cities), labels.cities], [`${data.escapedPct}%`, labels.escapes]].map(([v, l]) => (
          <View key={l} style={styles.stat}>
            <Text style={styles.statNum}>{v}</Text>
            <Text style={styles.statLabel} numberOfLines={1}>{l}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.small, { marginTop: 14 }]}>{progressText}</Text>
      <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>

      <View style={styles.how}>
        <Ionicons name="qr-code-outline" size={15} color={GOLD} />
        <Text style={[styles.small, { flex: 1 }]}>{labels.how}</Text>
      </View>

      <View style={{ marginTop: 'auto' }}>
        <Text style={styles.mrz} numberOfLines={1}>{l1}</Text>
        <Text style={styles.mrz} numberOfLines={1}>{l2}</Text>
      </View>
    </View>
  );
}

/** Small stable offset from an id, so stamps don't sit on a perfect grid. */
function nudge(id: string) {
  let h = 7;
  for (let k = 0; k < id.length; k++) h = (h * 131 + id.charCodeAt(k)) | 0;
  const a = Math.abs(h);
  return { x: (a % 13) - 6, y: (Math.floor(a / 13) % 9) - 4 };
}

function StampPage({
  w, stamps, nextHere, pageNo, title, nextLabel, onPick,
}: { w: number; stamps: Stamp[]; nextHere: boolean; pageNo: number; title: string; nextLabel: string; onPick: (s: Stamp) => void }) {
  const size = Math.min(118, (w - 48) / 2 - 8);
  const empty = STAMPS_PER_PAGE - stamps.length;
  return (
    <View style={styles.stampPage}>
      <View pointerEvents="none" style={styles.watermark}><EyeKeyhole size={w * 0.6} /></View>
      <Text style={styles.kicker}>{title.toUpperCase()}</Text>
      <View style={styles.stampGrid}>
        {stamps.map((s) => {
          const o = nudge(s._id);
          return (
            <View key={s._id} style={[styles.cell, { transform: [{ translateX: o.x }, { translateY: o.y }] }]}>
              <StampSeal size={size} title={s.roomTitle} theme={s.theme} date={shortPlayed(s.playedAt, s.createdAt)} escaped={s.escaped} tilt={tiltFor(s._id)} onPress={() => onPick(s)} />
            </View>
          );
        })}
        {Array.from({ length: empty }, (_, k) => (
          <View key={`e${k}`} style={styles.cell}>
            {k === 0 && nextHere ? (
              <View style={[styles.slot, styles.slotNext, { width: size, height: size, borderRadius: size / 2 }]}>
                <Ionicons name="qr-code-outline" size={20} color="rgba(201,154,46,0.85)" />
                <Text style={styles.slotText}>{nextLabel}</Text>
              </View>
            ) : (
              <View style={[styles.slot, { width: size, height: size, borderRadius: size / 2 }]} />
            )}
          </View>
        ))}
      </View>
      <Text style={styles.pageNo}>— {pageNo} —</Text>
    </View>
  );
}

function EndPage({ how }: { how: string }) {
  return (
    <View style={[styles.stampPage, { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 30 }]}>
      <View pointerEvents="none" style={styles.watermark}><EyeKeyhole size={220} /></View>
      <Ionicons name="qr-code-outline" size={42} color="rgba(201,154,46,0.7)" />
      <Text style={[styles.small, { textAlign: 'center', lineHeight: 20 }]}>{how}</Text>
      <Text style={[styles.kicker, { opacity: 0.6, letterSpacing: 6 }]}>UNLOCKED</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden' },
  cover: { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 14 }, elevation: 10 },
  paper: { backgroundColor: '#1b0f0e', borderWidth: 1, borderColor: theme.colors.border, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 4, height: 10 }, elevation: 8 },
  shade: { backgroundColor: '#000', borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  coverInner: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: '16%' },
  frame: { position: 'absolute', borderWidth: 1, borderRadius: 6 },
  gold: { color: GOLD, textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
  dataPage: { flex: 1, padding: 18 },
  kicker: { fontFamily: theme.fonts.type, fontSize: 11, letterSpacing: 3, color: 'rgba(201,154,46,0.85)' },
  photo: { width: 84, height: 104, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  photoLetter: { fontSize: 34, fontWeight: '800', color: theme.colors.redLight },
  label: { fontSize: 11, color: theme.colors.textMuted },
  value: { fontSize: 15, fontWeight: '700', color: theme.colors.bone },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.35)' },
  statNum: { fontFamily: theme.fonts.display, fontSize: 19, color: theme.colors.bone },
  statLabel: { fontSize: 10, color: theme.colors.textMuted },
  small: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.5)', marginTop: 6, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: theme.colors.redPrimary },
  how: { flexDirection: 'row', gap: 8, marginTop: 14, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  mrz: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1.2, color: 'rgba(163,149,140,0.75)' },
  stampPage: { flex: 1, paddingHorizontal: 14, paddingVertical: 14 },
  watermark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.05 },
  stampGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'space-around' },
  cell: { width: '50%', alignItems: 'center', justifyContent: 'center' },
  slot: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', padding: 10 },
  slotNext: { borderWidth: 2, borderColor: 'rgba(201,154,46,0.5)' },
  slotText: { fontSize: 10, color: 'rgba(201,154,46,0.85)', textAlign: 'center', marginTop: 4 },
  pageNo: { textAlign: 'center', fontFamily: theme.fonts.type, fontSize: 11, color: theme.colors.textMuted },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 },
  arrow: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  pageLabel: { minWidth: 120, textAlign: 'center', fontFamily: theme.fonts.type, fontSize: 12, letterSpacing: 1.5, color: theme.colors.textMuted },
});
