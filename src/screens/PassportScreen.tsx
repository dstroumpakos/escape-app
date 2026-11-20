import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  // Progress is the stamps placed into the tower's doors (same as escape-web).
  const chambers = data.chambers;
  const placed = data.placed;
  const pocket = Math.max(0, data.total - placed);
  const doorsOpen = chambers.filter((c) => placed >= c).length - 1;
  const next = chambers.find((c) => c > placed);
  const prev = chambers[doorsOpen];
  const pct = next ? Math.round(((placed - prev) / (next - prev)) * 100) : 100;
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
            {[[String(data.total), t('pp.stamps')]].map(([v, l]) => (
              <View key={l} style={styles.stat}><Text style={styles.statNum}>{v}</Text><Text style={styles.label}>{l}</Text></View>
            ))}
          </View>
          <Text style={[styles.label, { marginTop: 12 }]}>{next ? t('pp.towerProgress', { open: doorsOpen, n: next - placed }) : t('pp.towerSoon')}</Text>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {([['stamps', 'ribbon-outline', t('pp.tabStamps')], ['maze', 'skull-outline', t('pp.tabTower')]] as const).map(([k, icon, label]) => (
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
          <View style={styles.tower}>
            <Ionicons name="moon-outline" size={34} color={theme.colors.gold} />
            <Text style={styles.towerTitle}>{t('pp.towerTitle')}</Text>
            <Text style={styles.towerText}>{t('pp.towerText')}</Text>
            <Text style={styles.towerPocket}>{t('pp.towerPocket', { n: pocket })}</Text>
            <TouchableOpacity style={styles.towerBtn} onPress={() => navigation.navigate('Tower')}>
              <Ionicons name="enter-outline" size={18} color="#fff" />
              <Text style={styles.scanText}>{t('pp.towerEnter')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  tower: { alignItems: 'center', padding: 22, borderRadius: 16, backgroundColor: '#0b0709', borderWidth: 1, borderColor: theme.colors.border },
  towerTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone, marginTop: 8 },
  towerText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  towerPocket: { color: theme.colors.gold, fontSize: 13, fontWeight: '700', marginTop: 12 },
  towerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 20, height: 44, borderRadius: 12, backgroundColor: theme.colors.redPrimary },
});
