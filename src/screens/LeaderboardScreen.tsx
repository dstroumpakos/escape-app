import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import { ROOM_THEME_KEYS } from '../roomThemes';
import { FadeUp } from '../components/motion';
import { TypeLabel } from '../components/ui';
import { PASSPORT_ENABLED } from '../features';

type Tab = 'players' | 'rooms' | 'badges';
type Period = 'all' | 'month';
type IconName = keyof typeof Ionicons.glyphMap;

/** Same badges as the website's leaderboard; keys match convex/badges.ts. */
const BADGES: { key: string; icon: string; name: string; desc: string }[] = [
  { key: 'champion', icon: '🏆', name: 'leaderboard.badge_champion', desc: 'leaderboard.badge_champion_desc' },
  { key: 'on_fire', icon: '🔥', name: 'leaderboard.badge_on_fire', desc: 'leaderboard.badge_on_fire_desc' },
  { key: 'mastermind', icon: '🧠', name: 'leaderboard.badge_mastermind', desc: 'leaderboard.badge_mastermind_desc' },
  { key: 'speed_demon', icon: '⚡', name: 'leaderboard.badge_speed_demon', desc: 'leaderboard.badge_speed_demon_desc' },
  { key: 'team_leader', icon: '👥', name: 'leaderboard.badge_team_leader', desc: 'leaderboard.badge_team_leader_desc' },
  { key: 'explorer', icon: '🌍', name: 'leaderboard.badge_explorer', desc: 'leaderboard.badge_explorer_desc' },
  { key: 'perfectionist', icon: '🎯', name: 'leaderboard.badge_perfectionist', desc: 'leaderboard.badge_perfectionist_desc' },
  { key: 'night_owl', icon: '🌙', name: 'leaderboard.badge_night_owl', desc: 'leaderboard.badge_night_owl_desc' },
  { key: 'collector', icon: '🛍️', name: 'leaderboard.badge_collector', desc: 'leaderboard.badge_collector_desc' },
];

/** Keep in step with convex/leaderboardScore.ts SCORE (and the website's SCORE_RULES). */
const SCORE_RULES: { pts: number; key: string; icon: IconName }[] = [
  { pts: 20, key: 'lb.rule_game', icon: 'qr-code-outline' },
  { pts: 10, key: 'lb.rule_escape', icon: 'key-outline' },
  { pts: 3, key: 'lb.rule_review', icon: 'create-outline' },
  { pts: 3, key: 'lb.rule_long_review', icon: 'document-text-outline' },
  { pts: 5, key: 'lb.rule_badge', icon: 'ribbon-outline' },
  { pts: 1, key: 'lb.rule_like', icon: 'heart-outline' },
  { pts: 5, key: 'lb.rule_avatar', icon: 'camera-outline' },
  { pts: 5, key: 'lb.rule_cover', icon: 'image-outline' },
];

const MEDAL = ['#F2C75C', '#C9D1DC', '#CD8A4B'];
const EL_MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const scoreOf = (p: any): number => p.score ?? (p.escaped ?? 0) * 10 + (p.played ?? 0) * 20;

function Avatar({ uri, initials, size, ring }: { uri?: string; initials?: string; size: number; ring?: string }) {
  const base = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 3 : 1, borderColor: ring ?? theme.colors.glassBorder };
  if (uri) return <Image source={{ uri }} style={base} />;
  return (
    <View style={[base, styles.avatarEmpty]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '?'}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t, language } = useTranslation();
  const { userId, sessionToken } = useUser();
  const [tab, setTab] = useState<Tab>('players');
  const [period, setPeriod] = useState<Period>('all');
  const [shown, setShown] = useState(20);

  const data = useQuery(api.users.leaderboard, { limit: 100 });
  const badgeStats = useQuery(api.badges.badgeLeaderboard);
  const mine = useQuery(api.leaderboardScore.myPosition, sessionToken ? { sessionToken } : 'skip');

  const list: any[] = (period === 'month' ? data?.monthPlayers : data?.players) ?? [];
  const me = period === 'month' ? mine?.month : mine?.allTime;
  const rooms: any[] = data?.topRooms ?? [];
  const stats = data?.stats;

  const monthIdx = data?.month ? Number(data.month.slice(5, 7)) - 1 : -1;
  const monthName = monthIdx >= 0 ? (language === 'el' ? EL_MONTHS : EN_MONTHS)[monthIdx] : '';

  const statTiles: { icon: IconName; label: string; value: number | null }[] = [
    { icon: 'people-outline', label: t('lb.players_ranked'), value: data ? data.scores?.length ?? list.length : null },
    { icon: 'exit-outline', label: t('leaderboard.total_escapes'), value: stats ? stats.totalEscapes : null },
    { icon: 'ribbon-outline', label: t('leaderboard.badges_earned'), value: stats ? stats.totalBadges : null },
  ];

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: 'players', label: t('leaderboard.top_players'), icon: 'trophy-outline' },
    { id: 'rooms', label: t('leaderboard.top_rooms'), icon: 'star-outline' },
    { id: 'badges', label: t('leaderboard.badges'), icon: 'ribbon-outline' },
  ];

  const openPlayer = (id?: string) => id && navigation.navigate('PlayerProfile', { userId: id });

  const yourPlace = (
    <View style={styles.mine}>
      {!sessionToken ? (
        <View style={styles.mineRow}>
          <Ionicons name="information-circle-outline" size={20} color={theme.colors.gold} />
          <Text style={styles.mineHint}>{t('lb.login')}</Text>
        </View>
      ) : mine === undefined ? (
        <ActivityIndicator color={theme.colors.textMuted} />
      ) : me && me.place ? (
        <>
          <View style={styles.mineRow}>
            <View style={styles.minePlace}>
              <Text style={styles.minePlaceText}>#{me.place}</Text>
            </View>
            <View>
              <Text style={styles.mineLabel}>{t('lb.your_place').toUpperCase()}</Text>
              <Text style={styles.mineScore}>
                {me.score} <Text style={styles.mineScoreUnit}>{t('lb.points')}</Text>
              </Text>
            </View>
          </View>
          <View style={styles.chips}>
            {([
              { icon: 'qr-code-outline', n: me.games, label: t('lb.games') },
              { icon: 'key-outline', n: me.escapes, label: t('lb.escapes') },
              { icon: 'create-outline', n: me.reviews, label: t('lb.reviews') },
              { icon: 'ribbon-outline', n: me.badges, label: t('lb.trophies') },
            ] as { icon: IconName; n: number; label: string }[]).map((c) => (
              <View key={c.label} style={styles.chip}>
                <Ionicons name={c.icon} size={12} color={theme.colors.gold} />
                <Text style={styles.chipText}>
                  <Text style={styles.chipNum}>{c.n}</Text> {c.label}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={[styles.mineRow, { alignItems: 'flex-start' }]}>
          <Ionicons name="qr-code-outline" size={20} color={theme.colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{t('lb.not_ranked')}</Text>
            <Text style={styles.mineHint}>{t('lb.not_ranked_hint')}</Text>
          </View>
        </View>
      )}
    </View>
  );

  const podium = (
    <View style={styles.podium}>
      {[list[1], list[0], list[2]].map((p, i) => {
        if (!p) return <View key={i} style={styles.podiumCol} />;
        const place = [2, 1, 3][i];
        const color = MEDAL[place - 1];
        return (
          <TouchableOpacity
            key={p.id ?? i}
            style={[styles.podiumCol, styles.podiumCard, place === 1 && styles.podiumFirst, { borderColor: color + '55' }]}
            onPress={() => openPlayer(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`#${place} ${p.name}`}
          >
            {place === 1 && <Ionicons name="trophy" size={18} color={color} style={{ marginBottom: 4 }} />}
            <View>
              <Avatar uri={p.avatar} initials={p.initials} size={place === 1 ? 64 : 50} ring={color} />
              <View style={[styles.podiumTag, { backgroundColor: color }]}>
                <Text style={styles.podiumTagText}>#{place}</Text>
              </View>
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>{p.name}</Text>
            {!!p.title && <Text style={styles.podiumSub} numberOfLines={1}>{p.title}</Text>}
            <Text style={[styles.podiumScore, { color, fontSize: place === 1 ? 26 : 20 }]}>{scoreOf(p).toLocaleString()}</Text>
            <Text style={styles.podiumSub}>{t('lb.points')}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const rules = (
    <View style={{ marginTop: 30 }}>
      <Text style={styles.sectionTitle}>{t('lb.how_title')}</Text>
      <Text style={styles.subtitle}>{t('lb.how_sub')}</Text>
      <View style={{ gap: 8 }}>
        {SCORE_RULES.filter((r) => PASSPORT_ENABLED || (r.key !== 'lb.rule_game' && r.key !== 'lb.rule_escape')).map((r) => (
          <View key={r.key} style={styles.rule}>
            <View style={styles.rulePts}>
              <Text style={styles.rulePtsText}>+{r.pts}</Text>
            </View>
            <Ionicons name={r.icon} size={18} color={theme.colors.gold} />
            <Text style={styles.ruleText}>{t(r.key)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.notes}>
        {PASSPORT_ENABLED && <Text style={styles.note}>• {t('lb.note_manual')}</Text>}
        <Text style={styles.note}>• {t('lb.note_refresh')}</Text>
      </View>
    </View>
  );

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
          <TypeLabel color={theme.colors.gold}>{t('lb.kicker')}</TypeLabel>
          <Text style={styles.title}>{t('leaderboard.title')}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.subtitle}>{t('lb.subtitle')}</Text>

        <FadeUp>
          <View style={styles.statGrid}>
            {statTiles.map((s) => (
              <View key={s.label} style={styles.statTile}>
                <Ionicons name={s.icon} size={20} color={theme.colors.gold} />
                <Text style={styles.statValue}>{s.value === null ? '—' : s.value.toLocaleString()}</Text>
                <Text style={styles.statLabel} numberOfLines={2}>{s.label}</Text>
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

        {tab === 'players' ? (
          <>
            <View style={styles.period}>
              {([
                { id: 'all', label: t('lb.all_time'), icon: 'infinite-outline' },
                { id: 'month', label: `${t('lb.this_month')}${monthName ? ` · ${monthName}` : ''}`, icon: 'calendar-outline' },
              ] as { id: Period; label: string; icon: IconName }[]).map((x) => {
                const active = period === x.id;
                return (
                  <TouchableOpacity
                    key={x.id}
                    style={[styles.periodBtn, active && styles.periodBtnActive]}
                    onPress={() => { setPeriod(x.id); setShown(20); }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={x.icon} size={14} color={active ? theme.colors.bone : theme.colors.textSecondary} />
                    <Text style={[styles.periodText, active && styles.tabTextActive]} numberOfLines={2}>{x.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {yourPlace}

            {data === undefined ? (
              <ActivityIndicator color={theme.colors.redPrimary} style={{ paddingVertical: 50 }} />
            ) : list.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="trophy-outline" size={34} color={theme.colors.glassBorder} />
                <Text style={styles.emptyText}>{period === 'month' ? t('lb.empty_month') : t('leaderboard.no_players_yet')}</Text>
              </View>
            ) : (
              <>
                {podium}
                <View style={styles.list}>
                  {list.slice(0, shown).map((p, i) => {
                    const isMe = !!userId && p.id === userId;
                    return (
                      <TouchableOpacity
                        key={p.id ?? i}
                        style={[styles.row, isMe && styles.rowMe]}
                        onPress={() => openPlayer(p.id)}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.rankNum, p.rank <= 3 && { color: MEDAL[p.rank - 1] }]}>{p.rank}</Text>
                        <Avatar uri={p.avatar} initials={p.initials} size={36} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.rowName, { flexShrink: 1 }]} numberOfLines={1}>{p.name}</Text>
                            {isMe && (
                              <View style={styles.youTag}>
                                <Text style={styles.youTagText}>{t('lb.you').toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.rowSub} numberOfLines={1}>
                            {p.games ?? p.played} {t('lb.games').toLowerCase()} · {p.escapes ?? p.escaped} {t('lb.escapes').toLowerCase()}
                            {(p.reviews ?? 0) > 0 ? ` · ${p.reviews} ${t('lb.reviews').toLowerCase()}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.rowScore}>{scoreOf(p).toLocaleString()}</Text>
                          <Text style={styles.rowSub}>{t('lb.points')}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {list.length > shown && (
                  <TouchableOpacity style={styles.more} onPress={() => setShown((n) => n + 30)} accessibilityRole="button">
                    <Text style={styles.moreText}>{t('lb.show_more')}</Text>
                    <Ionicons name="chevron-down" size={16} color={theme.colors.bone} />
                  </TouchableOpacity>
                )}
              </>
            )}

            {rules}
          </>
        ) : data === undefined ? (
          <ActivityIndicator color={theme.colors.redPrimary} style={{ paddingVertical: 50 }} />
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
                const roomId = r.id ?? r._id;
                return (
                  <TouchableOpacity
                    key={roomId ?? i}
                    style={styles.row}
                    onPress={() => roomId && navigation.navigate('RoomDetails', { id: roomId })}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.rankNum, i < 3 && { color: MEDAL[i] }]}>{i + 1}</Text>
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
                  </TouchableOpacity>
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

const goldSoft = 'rgba(201, 154, 46, 0.12)';
const goldLine = 'rgba(201, 154, 46, 0.35)';

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
  sectionTitle: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone, marginBottom: 4 },

  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  statTile: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, paddingHorizontal: 4,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  statValue: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.bone },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center' },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  tabActive: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redLight },
  tabText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.bone },

  period: {
    flexDirection: 'row', gap: 4, padding: 4, marginBottom: 14,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  periodBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 6, borderRadius: theme.radius.md,
  },
  periodBtnActive: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.glassBorder },
  periodText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, textAlign: 'center' },

  mine: {
    gap: 12, padding: 14, marginBottom: 22,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: goldLine,
  },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  minePlace: {
    width: 52, height: 52, borderRadius: theme.radius.lg, alignItems: 'center', justifyContent: 'center',
    backgroundColor: goldSoft, borderWidth: 1, borderColor: goldLine,
  },
  minePlaceText: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.gold },
  mineLabel: { fontSize: 11, letterSpacing: 1, color: theme.colors.textMuted },
  mineScore: { fontFamily: theme.fonts.display, fontSize: 24, color: theme.colors.bone },
  mineScoreUnit: { fontFamily: undefined, fontSize: 13, color: theme.colors.textSecondary },
  mineHint: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: theme.colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 999, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  chipText: { fontSize: 12, color: theme.colors.textSecondary },
  chipNum: { fontWeight: '700', color: theme.colors.bone },

  empty: {
    alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 20,
    borderRadius: theme.radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.glassBorder,
  },
  emptyText: { fontSize: 14, lineHeight: 20, color: theme.colors.textSecondary, textAlign: 'center' },

  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 18 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumCard: {
    paddingTop: 14, paddingBottom: 12, paddingHorizontal: 6,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid, borderWidth: 1,
  },
  podiumFirst: { paddingBottom: 22 },
  podiumTag: { position: 'absolute', bottom: -8, alignSelf: 'center', paddingHorizontal: 7, borderRadius: 999 },
  podiumTagText: { fontSize: 11, fontWeight: '800', color: '#14100A' },
  podiumName: { fontSize: 13, fontWeight: '600', color: theme.colors.bone, marginTop: 14 },
  podiumSub: { fontSize: 10, color: theme.colors.textMuted },
  podiumScore: { fontFamily: theme.fonts.display, marginTop: 6 },

  list: {
    borderRadius: theme.radius.lg, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  rowMe: { backgroundColor: goldSoft, borderLeftWidth: 3, borderLeftColor: theme.colors.gold },
  rankNum: { width: 24, textAlign: 'center', fontFamily: theme.fonts.display, fontSize: 16, color: theme.colors.textMuted },
  rowName: { fontSize: 14, fontWeight: '600', color: theme.colors.bone },
  rowSub: { fontSize: 12, color: theme.colors.textMuted },
  rowScore: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.bone },
  youTag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(201, 154, 46, 0.2)' },
  youTagText: { fontSize: 9, fontWeight: '800', color: theme.colors.gold },
  more: {
    flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, marginTop: 14,
    paddingVertical: 9, paddingHorizontal: 16, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  moreText: { fontSize: 13, fontWeight: '600', color: theme.colors.bone },
  avatarEmpty: { backgroundColor: theme.colors.redSubtle, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700', color: theme.colors.redLight },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontWeight: '700', color: theme.colors.bone },

  rule: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  rulePts: {
    width: 46, height: 46, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: goldSoft, borderWidth: 1, borderColor: goldLine,
  },
  rulePtsText: { fontFamily: theme.fonts.display, fontSize: 17, color: theme.colors.gold },
  ruleText: { flex: 1, fontSize: 13, lineHeight: 18, color: theme.colors.textSecondary },
  notes: { gap: 6, marginTop: 14 },
  note: { fontSize: 12, lineHeight: 17, color: theme.colors.textMuted },

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
    borderRadius: theme.radius.sm, backgroundColor: goldSoft,
  },
  badgeEarnedText: { fontSize: 10, fontWeight: '600', color: theme.colors.gold },
});
