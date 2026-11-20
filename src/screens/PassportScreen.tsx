import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Rect, Circle, Text as SvgText } from 'react-native-svg';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import { StampSeal, tiltFor } from '../components/StampSeal';

/** My Passport: the stamps of the rooms you played and the maze they open (convex/passport.ts). */
export default function PassportScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const data = useQuery(api.passport.mine, sessionToken ? { sessionToken } : 'skip');
  const [tab, setTab] = useState<'stamps' | 'maze'>('stamps');
  const [picked, setPicked] = useState<any>(null);
  const { width } = useWindowDimensions();

  if (!data) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={theme.colors.redPrimary} /></View>;
  }
  const chambers = data.chambers;
  const reached = chambers.filter((c) => data.total >= c).length - 1;
  const next = chambers.find((c) => c > data.total);
  const prev = chambers[reached];
  const pct = next ? Math.round(((data.total - prev) / (next - prev)) * 100) : 100;
  const sealSize = Math.min(100, (width - 32 - 24) / 3);
  const slots = Math.max(9, Math.ceil((data.total + 2) / 3) * 3);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel={t('profile.back')}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('pp.title')}</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('ScanStamp')}>
          <Ionicons name="qr-code-outline" size={18} color="#fff" />
          <Text style={styles.scanText}>{t('pp.scan')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {/* Identity page */}
        <View style={styles.idCard}>
          <Text style={styles.idKicker}>UNLOCKED · PASSPORT</Text>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 12 }}>
            <View style={styles.photo}>
              {data.avatar ? <Image source={{ uri: data.avatar }} style={{ width: '100%', height: '100%' }} /> : <Text style={styles.photoLetter}>{(data.name || '?').charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('pp.name')}</Text>
              <Text style={styles.value} numberOfLines={1}>{data.name}</Text>
              <Text style={[styles.label, { marginTop: 4 }]}>{t('pp.number')}</Text>
              <Text style={[styles.value, { fontFamily: 'Courier' }]}>{data.passportNo}</Text>
            </View>
          </View>
          <View style={styles.stats}>
            {[[String(data.total), t('pp.stamps')], [String(data.cities), t('pp.cities')]].map(([v, l]) => (
              <View key={l} style={styles.stat}><Text style={styles.statNum}>{v}</Text><Text style={styles.label}>{l}</Text></View>
            ))}
          </View>
          <Text style={[styles.label, { marginTop: 12 }]}>{next ? t('pp.nextChamber', { n: next - data.total }) : t('pp.mazeDone')}</Text>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {([['stamps', 'ribbon-outline', t('pp.tabStamps')], ['maze', 'map-outline', t('pp.tabMaze')]] as const).map(([k, icon, label]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)}>
              <Ionicons name={icon} size={16} color={tab === k ? '#fff' : theme.colors.textSecondary} />
              <Text style={[styles.tabText, tab === k && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'stamps' ? (
          <>
            <View style={styles.grid}>
              {data.stamps.map((s) => (
                <StampSeal key={s._id} size={sealSize} title={s.roomTitle} theme={s.theme} date={new Date(s.createdAt).toLocaleDateString()} escaped={s.escaped} tilt={tiltFor(s._id)} onPress={() => setPicked(s)} />
              ))}
              {Array.from({ length: slots - data.stamps.length }, (_, i) => (
                <View key={`e${i}`} style={[styles.empty, { width: sealSize, height: sealSize, borderRadius: sealSize / 2 }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={theme.colors.textMuted} />
                  <Text style={styles.emptyText}>{t('pp.empty')}</Text>
                </View>
              ))}
            </View>
            <View style={styles.info}>
              {picked ? (
                <Text style={styles.infoText}>
                  <Text style={{ color: theme.colors.bone, fontWeight: '700' }} onPress={() => navigation.navigate('RoomDetails', { id: picked.roomId })}>{picked.roomTitle}</Text>
                  {' · '}{picked.companyName}{' · '}{new Date(picked.createdAt).toLocaleDateString()}{' · '}
                  {picked.escaped
                    ? t('pp.escapedIn', { time: picked.escapeSeconds ? `${Math.floor(picked.escapeSeconds / 60)}:${String(picked.escapeSeconds % 60).padStart(2, '0')}` : '' })
                    : t('pp.trapped')}
                </Text>
              ) : (
                <Text style={styles.infoText}>{data.total === 0 ? t('pp.emptyHint') : t('pp.tapStamp')}</Text>
              )}
            </View>
          </>
        ) : (
          <Maze total={data.total} chambers={chambers} />
        )}
      </ScrollView>
    </View>
  );
}

// Corridor vertices; chamber i sits on vertex CH[i] (same layout as escape-web).
const V: [number, number][] = [[70, 330], [250, 330], [250, 250], [430, 250], [430, 330], [610, 330], [610, 170], [430, 170], [430, 90], [250, 90], [250, 170], [70, 170], [70, 60]];
const CH = [0, 1, 3, 5, 6, 8, 9, 10, 11, 12];

function Maze({ total, chambers }: { total: number; chambers: number[] }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<number | null>(null);
  // Clamped: the server now has 10 doors, this map shows 9 chambers.
  const reached = Math.min(CH.length - 1, chambers.filter((c) => total >= c).length - 1);
  const show = sel ?? Math.min(reached + 1, CH.length - 1);
  const pts = (n: number) => V.slice(0, n + 1).map(([x, y]) => `${x},${y}`).join(' ');
  const [px, py] = V[CH[reached]];

  return (
    <View>
      <Svg viewBox="0 0 680 400" width="100%" height={undefined} style={{ aspectRatio: 680 / 400 }}>
        <Polyline points={pts(V.length - 1)} fill="none" stroke="rgba(232,220,200,0.12)" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
        {reached > 0 && <Polyline points={pts(CH[reached])} fill="none" stroke="#c99a2e" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />}
        {CH.map((v, i) => {
          const [x, y] = V[v];
          const open = total >= chambers[i];
          const isNext = !open && i === reached + 1;
          return (
            <React.Fragment key={i}>
              <Rect x={x - 40} y={y - 27} width={80} height={54} rx={8} fill={open ? '#3a1210' : '#0d0807'} stroke={open ? '#e24b4a' : isNext ? '#c99a2e' : 'rgba(232,220,200,0.25)'} strokeWidth={sel === i ? 2.5 : 1.2} strokeDasharray={isNext ? '5 4' : undefined} onPress={() => setSel(i)} />
              <SvgText x={x} y={y - 2} textAnchor="middle" fontSize={18} onPress={() => setSel(i)}>{open ? (i === 0 ? '🚪' : '🎁') : '🔒'}</SvgText>
              <SvgText x={x} y={y + 18} textAnchor="middle" fontSize={11} fill={open ? '#f3e9d8' : 'rgba(232,220,200,0.6)'} onPress={() => setSel(i)}>
                {i === 0 ? t('pp.entrance') : open ? t('pp.open') : t('pp.nStamps', { n: chambers[i] })}
              </SvgText>
            </React.Fragment>
          );
        })}
        <Circle cx={px} cy={py - 38} r={12} fill="#c8101b" stroke="#f3e9d8" strokeWidth={2} />
      </Svg>
      <View style={[styles.info, { flexDirection: 'row', gap: 10 }]}>
        <Ionicons name="gift-outline" size={20} color={theme.colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.bone, fontWeight: '700' }}>
            {show === 0 ? t('pp.entrance') : t(`pp.ch_${show}`)} · {show === 0 ? t('pp.start') : t('pp.nStamps', { n: chambers[show] })}
          </Text>
          <Text style={styles.infoText}>
            {t(`pp.gift_${show}`)}
            {show > 0 && (total >= chambers[show] ? ` · ${t('pp.won')}` : ` · ${t('pp.missing', { n: chambers[show] - total })}`)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass },
  headerTitle: { flex: 1, fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 10, backgroundColor: theme.colors.redPrimary },
  scanText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  idCard: { backgroundColor: '#1a0f0b', borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
  idKicker: { fontFamily: theme.fonts.type, fontSize: 11, letterSpacing: 3, color: theme.colors.gold },
  photo: { width: 64, height: 78, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  photoLetter: { fontSize: 28, fontWeight: '800', color: theme.colors.redLight },
  label: { fontSize: 11, color: theme.colors.textMuted },
  value: { fontSize: 15, fontWeight: '700', color: theme.colors.bone },
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.4)' },
  statNum: { fontSize: 20, fontWeight: '800', color: theme.colors.bone },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.5)', marginTop: 6, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: theme.colors.redPrimary },
  tabs: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: theme.colors.glass },
  tabOn: { backgroundColor: theme.colors.redPrimary },
  tabText: { color: theme.colors.textSecondary, fontWeight: '600', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  info: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  infoText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
