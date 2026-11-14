import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { ROOM_THEME_KEYS } from '../roomThemes';
import { FadeUp } from '../components/motion';
import { TypeLabel } from '../components/ui';

type Tab = 'players' | 'rooms' | 'badges';

/** Same eight badges as the website's leaderboard; keys match convex/badges.ts. */
const BADGES: { key: string; icon: string; name: string; desc: string }[] = [
  { key: 'champion', icon: '🏆', name: 'leaderboard.badge_champion', desc: 'leaderboard.badge_champion_desc' },
  { key: 'on_fire', icon: '🔥', name: 'leaderboard.badge_on_fire', desc: 'leaderboard.badge_on_fire_desc' },
  { key: 'mastermind', icon: '🧠', name: 'leaderboard.badge_mastermind', desc: 'leaderboard.badge_mastermind_desc' },
  { key: 'speed_demon', icon: '⚡', name: 'leaderboard.badge_speed_demon', desc: 'leaderboard.badge_speed_demon_desc' },
  { key: 'team_leader', icon: '👥', name: 'leaderboard.badge_team_leader', desc: 'leaderboard.badge_team_leader_desc' },
  { key: 'explorer', icon: '🌍', name: 'leaderboard.badge_explorer', desc: 'leaderboard.badge_explorer_desc' },
  { key: 'perfectionist', icon: '🎯', name: 'leaderboard.badge_perfectionist', desc: 'leaderboard.badge_perfectionist_desc' },
  { key: 'night_owl', icon: '🌙', name: 'leaderboard.badge_night_owl', desc: 'leaderboard.badge_night_owl_desc' },
];

const MEDAL = ['#E0B84A', '#B9B9B9', '#B5713A'];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <View style={[styles.rank, { backgroundColor: MEDAL[rank - 1], borderColor: MEDAL[rank - 1] }]}>
        <Ionicons name={rank === 1 ? 'trophy' : 'medal'} size={16} color="#1a0a00" />
      </View>
    );
  }
  return (
    <View style={styles.rank}>
      <Text style={styles.rankText}>{rank}</Text>
    </View>
  );
}

function Avatar({ uri, initials, size, ring }: { uri?: string; initials?: string; size: number; ring?: string }) {
  const base = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 1, borderColor: ring ?? theme.colors.glassBorder };
  if (uri) return <Image source={{ uri }} style={base} />;
  return (
    <View style={[base, styles.avatarEmpty]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '?'}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('players');

  const data = useQuery(api.users.leaderboard, { limit: 20 });
  const badgeStats = useQuery(api.badges.badgeLeaderboard);

  const players: any[] = data?.players ?? [];
  const rooms: any[] = data?.topRooms ?? [];
  const stats = data?.stats;

  const statTiles: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }[] = [
    { icon: 'key-outline', label: t('leaderboard.total_escapes'), value: stats ? stats.totalEscapes.toLocaleString() : '—', color: theme.colors.redLight },
    { icon: 'time-outline', label: t('leaderboard.played'), value: stats ? stats.totalPlayed.toLocaleString() : '—', color: theme.colors.bone },
    { icon: 'trending-up-outline', label: t('leaderboard.success_rate'), value: stats ? `${stats.successRate}%` : '—', color: theme.colors.success },
    { icon: 'ribbon-outline', label: t('leaderboard.badges_earned'), value: stats ? stats.totalBadges.toLocaleString() : '—', color: theme.colors.gold },
  ];

  const tabs: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'players', label: t('leaderboard.top_players'), icon: 'trophy-outline' },
    { id: 'rooms', label: t('leaderboard.top_rooms'), icon: 'star-outline' },
    { id: 'badges', label: t('leaderboard.badges'), icon: 'ribbon-outline' },
  ];

  const podium = players.length >= 3 ? [players[1], players[0], players[2]] : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('checkout.back')}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <TypeLabel color={theme.colors.gold}>{t('leaderboard.badges_earned')}</TypeLabel>
          <Text style={styles.title}>{t('leaderboard.title')}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.subtitle}>{t('leaderboard.subtitle')}</Text>

        <FadeUp>
          <View style={styles.statGrid}>
            {statTiles.map((s) => (
              <View key={s.label} style={styles.statTile}>
                <Ionicons name={s.icon} size={20} color={s.color} />
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </FadeUp>

        <View style={styles.tabs}>
          {tabs.map((x) => {
            const active = tab === x.id;
            return (
              <TouchableOpacity
                key={x.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(x.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={x.icon} size={14} color={active ? theme.colors.bone : theme.colors.textSecondary} />
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{x.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {data === undefined ? (
          <ActivityIndicator color={theme.colors.redPrimary} style={{ paddingVertical: 50 }} />
        ) : tab === 'players' ? (
          players.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={34} color={theme.colors.glassBorder} />
              <Text style={styles.emptyText}>{t('leaderboard.no_players_yet')}</Text>
            </View>
          ) : (
            <>
              {podium && (
                <View style={styles.podium}>
                  {podium.map((p, i) => {
                    const place = [2, 1, 3][i];
                    return (
                      <View key={p.rank} style={styles.podiumCol}>
                        <Avatar uri={p.avatar} initials={p.initials} size={place === 1 ? 60 : 50} ring={MEDAL[place - 1]} />
                        <Text style={styles.podiumName} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.podiumSub}>{p.escaped} {t('leaderboard.escapes')}</Text>
                        <View style={[styles.podiumStep, { height: [70, 96, 54][i] }]}>
                          <Text style={[styles.podiumPlace, { color: MEDAL[place - 1] }]}>#{place}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={styles.list}>
                {players.map((p) => (
                  <View key={p.rank} style={styles.row}>
                    <RankBadge rank={p.rank} />
                    <Avatar uri={p.avatar} initials={p.initials} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.rowSub}>
                        {p.escaped} {t('leaderboard.escapes')} · {p.rate}%
                      </Text>
                    </View>
                    {p.badges > 0 && (
                      <View style={styles.badgeCount}>
                        <Ionicons name="ribbon" size={12} color={theme.colors.gold} />
                        <Text style={styles.badgeCountText}>{p.badges}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </>
          )
        ) : tab === 'rooms' ? (
          rooms.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={34} color={theme.colors.glassBorder} />
              <Text style={styles.emptyText}>{t('leaderboard.no_rooms_yet')}</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {rooms.map((r, i) => {
                const themeKey = ROOM_THEME_KEYS[r.theme];
                return (
                  <View key={r._id ?? i} style={styles.row}>
                    <RankBadge rank={i + 1} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{r.title || 'Untitled'}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {[r.companyName || r.location, r.theme ? (themeKey ? t(themeKey) : r.theme) : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <View style={styles.rating}>
                        <Ionicons name="star" size={12} color={theme.colors.gold} />
                        <Text style={styles.ratingText}>{r.rating ?? 0}</Text>
                        <Text style={styles.rowSub}>({r.reviews ?? 0})</Text>
                      </View>
                      <Text style={styles.rowSub}>{r.escapeRate ?? 0}% {t('leaderboard.escape_rate')}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        ) : (
          <View style={styles.badgeGrid}>
            {BADGES.map((b) => {
              const earned = badgeStats?.find((s: any) => s.key === b.key)?.earnedCount ?? 0;
              return (
                <View key={b.key} style={styles.badgeCard}>
                  <Text style={styles.badgeIcon}>{b.icon}</Text>
                  <Text style={styles.badgeName}>{t(b.name)}</Text>
                  <Text style={styles.badgeDesc}>{t(b.desc)}</Text>
                  <View style={styles.badgeEarned}>
                    <Ionicons name="ribbon-outline" size={11} color={theme.colors.gold} />
                    <Text style={styles.badgeEarnedText}>{earned} {t('leaderboard.players_earned')}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 10 },
  backBtn: {
    width: 40, height: 40, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  title: { fontFamily: theme.fonts.displayBlack, fontSize: 28, lineHeight: 34, color: theme.colors.bone },
  subtitle: { fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary, marginBottom: 18 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  statTile: {
    flexGrow: 1, flexBasis: '45%', alignItems: 'center', gap: 4, paddingVertical: 14,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  statValue: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.bone },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center' },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  tabActive: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redLight },
  tabText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.bone },

  empty: {
    alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 20,
    borderRadius: theme.radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.glassBorder,
  },
  emptyText: { fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary, textAlign: 'center' },

  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 20 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumName: { fontSize: 13, fontWeight: '600', color: theme.colors.bone, marginTop: 8 },
  podiumSub: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 8 },
  podiumStep: {
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8,
    borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderBottomWidth: 0, borderColor: theme.colors.glassBorder,
  },
  podiumPlace: { fontFamily: theme.fonts.display, fontSize: 22 },

  list: {
    borderRadius: theme.radius.lg, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  rowName: { fontSize: 14, fontWeight: '600', color: theme.colors.bone },
  rowSub: { fontSize: 12, color: theme.colors.textMuted },
  rank: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  rankText: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted },
  avatarEmpty: { backgroundColor: theme.colors.redSubtle, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', color: theme.colors.redLight },
  badgeCount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  badgeCountText: { fontSize: 13, fontWeight: '700', color: theme.colors.gold },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontWeight: '700', color: theme.colors.bone },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard: {
    flexGrow: 1, flexBasis: '45%', alignItems: 'center', padding: 14,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  badgeIcon: { fontSize: 34, marginBottom: 6 },
  badgeName: { fontSize: 14, fontWeight: '700', color: theme.colors.bone, marginBottom: 2 },
  badgeDesc: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 8 },
  badgeEarned: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 8,
    borderRadius: theme.radius.sm, backgroundColor: 'rgba(201, 154, 46, 0.12)',
  },
  badgeEarnedText: { fontSize: 10, fontWeight: '600', color: theme.colors.gold },
});
