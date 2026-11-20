import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyQuery } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';

/** What UNLOCKED did for the company in the last 30 days (convex/companyStats.ts). */
export function CompanyStatsCard({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const data = useCompanyQuery(api.companyStats.overview, { companyId: companyId as Id<'companies'> });
  if (!data) return null;
  const max = Math.max(1, ...data.days.map((d) => d.views));
  const empty = data.views === 0 && data.clicks === 0;

  const delta = (now: number, before: number) => {
    if (!before) return null;
    const pct = Math.round(((now - before) / before) * 100);
    const up = pct >= 0;
    return (
      <View style={styles.deltaRow}>
        <Ionicons name={up ? 'trending-up' : 'trending-down'} size={12} color={up ? theme.colors.success : theme.colors.textSecondary} />
        <Text style={[styles.small, up && { color: theme.colors.success }]}>{up ? '+' : ''}{pct}%</Text>
      </View>
    );
  };

  const tiles: { icon: any; label: string; value: string | number; extra?: React.ReactNode }[] = [
    { icon: 'eye-outline', label: t('st.views'), value: data.views, extra: delta(data.views, data.viewsBefore) },
    { icon: 'open-outline', label: t('st.clicks'), value: data.clicks, extra: delta(data.clicks, data.clicksBefore) },
    { icon: 'people-outline', label: t('st.followers'), value: data.followers, extra: data.newFollowers > 0 ? <Text style={styles.small}>{t('st.newN', { n: data.newFollowers })}</Text> : null },
    { icon: 'ribbon-outline', label: t('st.stamps'), value: data.stamps },
    { icon: 'star-outline', label: t('st.rating'), value: data.reviews ? data.rating.toFixed(1) : '–', extra: <Text style={styles.small}>{t('st.reviewsN', { n: data.reviews })}</Text> },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('st.title')}</Text>
        <Text style={styles.small}>{t('st.period')}</Text>
      </View>

      <View style={styles.tiles}>
        {tiles.map((x) => (
          <View key={x.label} style={styles.tile}>
            <View style={styles.tileLabel}>
              <Ionicons name={x.icon} size={14} color={theme.colors.redLight} />
              <Text style={styles.small} numberOfLines={1}>{x.label}</Text>
            </View>
            <Text style={styles.value}>{x.value}</Text>
            {x.extra}
          </View>
        ))}
      </View>

      {empty ? (
        <Text style={[styles.small, { marginTop: 12 }]}>{t('st.noData')}</Text>
      ) : (
        <>
          <Text style={[styles.small, { marginTop: 14, marginBottom: 6 }]}>{t('st.chart')}</Text>
          <View style={styles.chart} accessibilityLabel={t('st.chart')}>
            {data.days.map((d) => (
              <View key={d.date} style={styles.barSlot}>
                <View style={[styles.bar, { height: d.views ? `${Math.max(4, (d.views / max) * 100)}%` : 0 }]} />
              </View>
            ))}
          </View>
        </>
      )}

      {data.rooms.slice(0, 6).map((r) => (
        <View key={r.roomId} style={styles.roomRow}>
          <Text style={styles.roomTitle} numberOfLines={1}>{r.title || '—'}</Text>
          <Text style={styles.roomNum}><Ionicons name="eye-outline" size={11} /> {r.views}</Text>
          <Text style={styles.roomNum}><Ionicons name="open-outline" size={11} /> {r.clicks}</Text>
          <Text style={styles.roomNum}><Ionicons name="ribbon-outline" size={11} /> {r.stamps}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginBottom: 16, padding: 16, borderRadius: 14, backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  title: { color: theme.colors.bone, fontWeight: '700', fontSize: 15 },
  small: { color: theme.colors.textSecondary, fontSize: 11 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, padding: 10, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)' },
  tileLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  value: { color: theme.colors.bone, fontSize: 22, fontWeight: '700', marginTop: 2 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  chart: { height: 80, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: theme.colors.redPrimary },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  roomTitle: { flex: 1, color: theme.colors.textSecondary, fontSize: 13 },
  roomNum: { color: theme.colors.bone, fontSize: 12, minWidth: 38, textAlign: 'right' },
});
