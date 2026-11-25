import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n';
import { ROOM_THEME_KEYS } from '../roomThemes';
import { PUZZLE_CHIPS, HORROR_CHIPS, type Side } from '../mode';
import { caps } from '../caps';

// Fixed colours: this screen shows both sides at once, whatever side the app is on
const GOLD = '#f6d27a';
const BONE = '#f4ecd9';
const RED = '#ff2a36';
const DISPLAY = 'NotoSerifDisplay_700Bold';
const DISPLAY_BLACK = 'NotoSerifDisplay_900Black';
const TYPE = 'SpecialElite_400Regular';
const TAB_BAR = 96;

/**
 * The website's home "pick your side", half and half: puzzles & mystery on top,
 * horror & thrill below. Picking one switches the whole app to that side
 * (src/side.ts); a theme chip also opens Discover on that theme.
 */
export function ModeSplit({ onPick }: { onPick: (side: Side, theme?: string) => void }) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const half = Math.max(300, (height - insets.top - TAB_BAR) / 2);

  const Chips = ({ side, values }: { side: Side; values: string[] }) => (
    <View style={styles.chips}>
      {values.map((v) => (
        <TouchableOpacity key={v} onPress={() => onPick(side, v)} style={[styles.chip, side === 'puzzle' ? styles.chipPuzzle : styles.chipHorror]}>
          <Text style={[styles.chipText, { color: side === 'puzzle' ? '#d9e2ff' : '#ffd6d6' }]}>{t(ROOM_THEME_KEYS[v] || v)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View>
      {/* Puzzles: night sky */}
      <LinearGradient colors={['#1d3060', '#0c1532', '#060b1a']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.half, { minHeight: half, paddingTop: insets.top + 18 }]}>
        <Stars seed={7} />
        <View style={[styles.kicker, { borderColor: 'rgba(246,210,122,0.4)' }]}>
          <Ionicons name="key-outline" size={12} color={GOLD} />
          <Text style={[styles.kickerText, { color: GOLD }]}>{caps(t('mode.no_fear'))}</Text>
        </View>
        <Text style={styles.title}>{t('mode.puzzle_title1')}</Text>
        <Text style={[styles.title2, { color: GOLD }]}>{t('mode.puzzle_title2')}</Text>
        <Text style={styles.desc} numberOfLines={3}>{t('mode.puzzle_desc')}</Text>
        <Chips side="puzzle" values={PUZZLE_CHIPS} />
        <TouchableOpacity activeOpacity={0.85} onPress={() => onPick('puzzle')}>
          <LinearGradient colors={['#f6d27a', '#d9a53a', '#a97a1c']} style={styles.cta}>
            <Ionicons name="key" size={16} color="#1a1205" />
            <Text style={[styles.ctaText, { color: '#1a1205' }]}>{t('mode.puzzle_cta')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#1a1205" />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {/* The seam: a red line and "or" */}
      <View style={styles.seam} pointerEvents="none">
        <View style={styles.seamLine} />
        <View style={styles.or}><Text style={styles.orText}>{t('mode.or')}</Text></View>
      </View>

      {/* Horror: blood and dark */}
      <LinearGradient colors={['#3a070b', '#170304', '#050202']} start={{ x: 0.8, y: 0 }} end={{ x: 0.2, y: 1 }} style={[styles.half, { minHeight: half, paddingTop: 34 }]}>
        <View style={styles.kickerLine}>
          <View style={styles.dash} />
          <Text style={[styles.kickerText, { color: RED }]}>{t('mode.horror_kicker')}</Text>
        </View>
        <Text style={styles.title}>{t('mode.horror_title1')}</Text>
        <Text style={[styles.title2, { color: RED }]}>{t('mode.horror_title2')}</Text>
        <Text style={styles.desc} numberOfLines={3}>{t('mode.horror_desc')}</Text>
        <Chips side="horror" values={HORROR_CHIPS} />
        <TouchableOpacity activeOpacity={0.85} onPress={() => onPick('horror')}>
          <LinearGradient colors={['#D4141F', '#C8101B', '#8F0610']} style={styles.cta}>
            <Ionicons name="skull-outline" size={16} color={BONE} />
            <Text style={[styles.ctaText, { color: BONE }]}>{t('mode.horror_cta')}</Text>
            <Ionicons name="arrow-forward" size={16} color={BONE} />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

/** A few fixed stars on the puzzle half. */
function Stars({ seed }: { seed: number }) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 34 }, (_, i) => {
        const size = rnd() < 0.15 ? 3 : rnd() < 0.5 ? 2 : 1;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: `${rnd() * 100}%`,
              top: `${rnd() * 100}%`,
              width: size,
              height: size,
              borderRadius: size,
              opacity: 0.25 + rnd() * 0.6,
              backgroundColor: size === 3 ? GOLD : '#fff',
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  half: { paddingHorizontal: 22, paddingBottom: 30, justifyContent: 'center', overflow: 'hidden' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
  kickerLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  dash: { width: 18, height: 1, backgroundColor: RED },
  kickerText: { fontFamily: TYPE, fontSize: 12, letterSpacing: 2 },
  title: { color: BONE, fontFamily: DISPLAY, fontSize: 24, lineHeight: 30 },
  title2: { fontFamily: DISPLAY_BLACK, fontSize: 28, lineHeight: 34, marginTop: 2 },
  desc: { color: 'rgba(232,220,200,0.8)', fontSize: 14, lineHeight: 20, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  chipPuzzle: { borderColor: 'rgba(160,180,255,0.3)', backgroundColor: 'rgba(255,255,255,0.04)' },
  chipHorror: { borderColor: 'rgba(255,42,54,0.35)', backgroundColor: 'rgba(200,16,27,0.08)' },
  chipText: { fontSize: 13 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 13, marginTop: 16 },
  ctaText: { fontSize: 15, fontWeight: '700' },
  seam: { height: 0, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  seamLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: RED, shadowColor: RED, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  or: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#0b0d18', borderWidth: 2, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  orText: { color: GOLD, fontFamily: DISPLAY, fontSize: 17 },
});
