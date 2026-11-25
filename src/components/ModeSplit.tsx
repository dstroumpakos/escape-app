import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { ROOM_THEME_KEYS } from '../roomThemes';
import { PUZZLE_CHIPS, HORROR_CHIPS, type Side } from '../mode';

const GOLD = '#f6d27a';

/**
 * The website's home "pick your side": puzzles & mystery or horror & thrill.
 * A side's button opens Discover on that side; a theme chip opens just that theme.
 */
export function ModeSplit({ onPick }: { onPick: (side: Side, theme?: string) => void }) {
  const { t } = useTranslation();

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
    <View style={styles.wrap}>
      {/* Puzzles */}
      <LinearGradient colors={['#1d2d6b', '#121c45', '#0a1029']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={[styles.kicker, { borderColor: 'rgba(246,210,122,0.4)' }]}>
          <Ionicons name="key-outline" size={12} color={GOLD} />
          <Text style={[styles.kickerText, { color: GOLD }]}>{t('mode.no_fear').toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{t('mode.puzzle_title1')}</Text>
        <Text style={[styles.title2, { color: GOLD }]}>{t('mode.puzzle_title2')}</Text>
        <Text style={styles.desc}>{t('mode.puzzle_desc')}</Text>
        <Chips side="puzzle" values={PUZZLE_CHIPS} />
        <TouchableOpacity activeOpacity={0.85} onPress={() => onPick('puzzle')}>
          <LinearGradient colors={['#e8c46a', '#c99a2e']} style={styles.cta}>
            <Ionicons name="key" size={16} color="#1a1205" />
            <Text style={[styles.ctaText, { color: '#1a1205' }]}>{t('mode.puzzle_cta')}</Text>
            <Ionicons name="arrow-forward" size={16} color="#1a1205" />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>

      {/* "or" */}
      <View style={styles.orWrap} pointerEvents="none">
        <View style={styles.or}><Text style={styles.orText}>{t('mode.or')}</Text></View>
      </View>

      {/* Horror */}
      <LinearGradient colors={['#2a0608', '#170304', '#080505']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, styles.horrorCard]}>
        <View style={styles.kickerLine}>
          <View style={styles.dash} />
          <Text style={[styles.kickerText, { color: theme.colors.redLight }]}>{t('mode.horror_kicker')}</Text>
        </View>
        <Text style={styles.title}>{t('mode.horror_title1')}</Text>
        <Text style={[styles.title2, { color: theme.colors.redLight }]}>{t('mode.horror_title2')}</Text>
        <Text style={styles.desc}>{t('mode.horror_desc')}</Text>
        <Chips side="horror" values={HORROR_CHIPS} />
        <TouchableOpacity activeOpacity={0.85} onPress={() => onPick('horror')}>
          <LinearGradient colors={theme.buttonGradient} style={styles.cta}>
            <Ionicons name="skull-outline" size={16} color={theme.colors.bone} />
            <Text style={[styles.ctaText, { color: theme.colors.bone }]}>{t('mode.horror_cta')}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.bone} />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  card: { borderRadius: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(246,210,122,0.18)', overflow: 'hidden' },
  horrorCard: { borderColor: 'rgba(255,42,54,0.25)' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14 },
  kickerLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  dash: { width: 18, height: 1, backgroundColor: theme.colors.redLight },
  kickerText: { fontFamily: theme.fonts.type, fontSize: 12, letterSpacing: 2 },
  title: { color: theme.colors.bone, fontFamily: theme.fonts.display, fontSize: 26, lineHeight: 32 },
  title2: { fontFamily: theme.fonts.displayBlack, fontSize: 28, lineHeight: 34, marginTop: 2 },
  desc: { color: 'rgba(232,220,200,0.8)', fontSize: 14, lineHeight: 21, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipPuzzle: { borderColor: 'rgba(160,180,255,0.3)', backgroundColor: 'rgba(255,255,255,0.04)' },
  chipHorror: { borderColor: 'rgba(255,42,54,0.35)', backgroundColor: 'rgba(200,16,27,0.08)' },
  chipText: { fontSize: 13 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 13, marginTop: 18 },
  ctaText: { fontSize: 15, fontWeight: '700' },
  orWrap: { height: 14, alignItems: 'center', zIndex: 2 },
  or: { position: 'absolute', top: -15, width: 44, height: 44, borderRadius: 22, backgroundColor: '#0b0b14', borderWidth: 2, borderColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  orText: { color: GOLD, fontFamily: theme.fonts.display, fontSize: 16 },
});
