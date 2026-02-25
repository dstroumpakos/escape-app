// PHASE 1 FIX: Dashboard replaced with "Today's Bookings" as default landing page.
// Business users see their schedule at a glance — the most important screen.
// Shows quick stats and a timeline of today's bookings across all rooms.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';
import Svg, { Circle } from 'react-native-svg';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PLAN_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  starter: { bg: 'rgba(76,175,80,0.15)', text: '#4CAF50', icon: 'rocket' },
  pro: { bg: 'rgba(244,67,54,0.15)', text: '#F44336', icon: 'diamond' },
  enterprise: { bg: 'rgba(156,39,176,0.2)', text: '#CE93D8', icon: 'trophy' },
};
const PLAN_LABELS: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

interface Props {
  companyId: string;
  onSwitchToPlayer?: () => void;
}

export default function CompanyDashboard({ companyId, onSwitchToPlayer }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const company = useQuery(api.companies.getById, {
    id: companyId as Id<"companies">,
  });
  const stats = useQuery(api.companies.getTodayStats, {
    companyId: companyId as Id<"companies">,
    date: dateStr,
  });
  const overallStats = useQuery(api.companies.getDashboardStats, {
    companyId: companyId as Id<"companies">,
  });
  const bookings = useQuery(api.companies.getBookingsByDate, {
    companyId: companyId as Id<"companies">,
    date: dateStr,
  });

  const activeBookings = useMemo(
    () => (bookings || []).filter((b: any) => b.status !== 'cancelled'),
    [bookings]
  );

  const getSourceStyle = (source: string) => {
    if (source === 'external') return { bg: 'rgba(255,167,38,0.15)', text: '#FFA726', icon: 'globe-outline' as const };
    return { bg: 'rgba(76,175,80,0.15)', text: '#4CAF50', icon: 'lock-closed' as const };
  };

  // Plan info
  const plan = overallStats?.plan ?? 'starter';
  const planStyle = PLAN_COLORS[plan] || PLAN_COLORS.starter;
  const roomCount = overallStats?.totalRooms ?? 0;
  const roomLimit = overallStats?.roomLimit ?? 1;
  const advanced = overallStats?.advanced;
  const fullAnalytics = overallStats?.fullAnalytics;

  // Time-aware greeting
  const hour = today.getHours();
  const greetingText = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  // SVG donut for room capacity
  const DONUT_SIZE = 90;
  const STROKE = 8;
  const RADIUS = (DONUT_SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const roomPct = roomLimit === Infinity ? 0 : Math.min(roomCount / roomLimit, 1);
  const dashOffset = CIRCUMFERENCE * (1 - roomPct);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greetingText}</Text>
          <Text style={styles.companyName}>{company?.name ?? t('loading')}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {onSwitchToPlayer && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder }]}
              onPress={onSwitchToPlayer}
            >
              <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder }]}
            onPress={() => navigation.navigate('CompanyQRScanner', { companyId })}
          >
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('CompanyAddBooking', { companyId, date: dateStr })}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Date Banner with Plan Badge */}
        <View style={styles.dateBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="calendar" size={18} color={theme.colors.redPrimary} />
            <Text style={styles.dateText}>
              {DAYS[today.getDay()]}, {MONTHS[today.getMonth()]} {today.getDate()}, {today.getFullYear()}
            </Text>
          </View>
          <View style={[styles.planBadge, { backgroundColor: planStyle.bg }]}>
            <Ionicons name={planStyle.icon as any} size={10} color={planStyle.text} />
            <Text style={[styles.planBadgeText, { color: planStyle.text }]}>{PLAN_LABELS[plan] || 'Starter'}</Text>
          </View>
        </View>

        {/* Overview + Room Capacity Row */}
        <Text style={styles.sectionTitle}>{t('dashboard.overview')}</Text>
        <View style={styles.overviewRow}>
          {/* Overview Card */}
          <View style={[styles.overviewCard, { flex: 1 }]}>
            <OverviewLine label={t('dashboard.totalBookings')} value={overallStats?.totalBookings ?? 0} max={Math.max(overallStats?.totalBookings ?? 1, 1)} color="#42A5F5" />
            <OverviewLine label={t('dashboard.upcoming')} value={overallStats?.upcomingBookings ?? 0} max={Math.max(overallStats?.totalBookings ?? 1, 1)} color={theme.colors.success} />
            <OverviewLine label={t('dashboard.totalRevenue')} value={`€${overallStats?.totalRevenue ?? 0}`} max={1} color="#FFA726" noBar />
          </View>
          {/* Room Capacity Donut */}
          <View style={styles.donutCard}>
            <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
              <Circle
                cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={RADIUS}
                stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} fill="none"
              />
              <Circle
                cx={DONUT_SIZE / 2} cy={DONUT_SIZE / 2} r={RADIUS}
                stroke={roomPct >= 1 ? '#F44336' : roomPct >= 0.75 ? '#FFA726' : theme.colors.success}
                strokeWidth={STROKE} fill="none"
                strokeDasharray={`${CIRCUMFERENCE}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                rotation="-90"
                origin={`${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}`}
              />
            </Svg>
            <View style={styles.donutCenter}>
              <Text style={styles.donutVal}>{roomCount}</Text>
              <Text style={styles.donutMax}>/ {roomLimit === Infinity ? '∞' : roomLimit}</Text>
            </View>
            <Text style={styles.donutLabel}>Rooms</Text>
          </View>
        </View>

        {/* Today Stats */}
        <Text style={styles.sectionTitle}>{t('dashboard.todayStats')}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{stats?.totalBookings ?? 0}</Text>
            <Text style={styles.statLabel}>{t('dashboard.bookings')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statVal}>{stats?.availableSlots ?? 0}</Text>
            <Text style={styles.statLabel}>{t('dashboard.available')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: theme.colors.success }]}>
              €{stats?.revenue ?? 0}
            </Text>
            <Text style={styles.statLabel}>{t('dashboard.revenue')}</Text>
          </View>
        </View>

        {/* Source breakdown */}
        <View style={styles.sourceBreakdown}>
          <View style={styles.sourceItem}>
            <View style={[styles.sourceDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.sourceLabel}>{t('dashboard.unlockedSource', { n: stats?.unlockedBookings ?? 0 })}</Text>
          </View>
          <View style={styles.sourceItem}>
            <View style={[styles.sourceDot, { backgroundColor: '#FFA726' }]} />
            <Text style={styles.sourceLabel}>{t('dashboard.externalSource', { n: stats?.externalBookings ?? 0 })}</Text>
          </View>
          <View style={styles.sourceItem}>
            <View style={[styles.sourceDot, { backgroundColor: '#42A5F5' }]} />
            <Text style={styles.sourceLabel}>{t('dashboard.activeRooms', { n: stats?.activeRooms ?? 0 })}</Text>
          </View>
        </View>

        {/* Advanced Analytics — Pro & Enterprise */}
        {advanced && (
          <>
            <Text style={styles.sectionTitle}>Analytics</Text>
            <View style={styles.analyticsGrid}>
              <MiniStat icon="checkmark-circle" color="#4CAF50" label="Completed" value={advanced.completedBookings} />
              <MiniStat icon="close-circle" color="#F44336" label="Cancelled" value={advanced.cancelledBookings} />
              <MiniStat icon="star" color="#FFD700" label="Avg Rating" value={advanced.avgRating} />
              <MiniStat icon="trending-up" color="#42A5F5" label="Conversion" value={`${advanced.conversionRate}%`} />
              <MiniStat icon="cash" color="#4CAF50" label="Avg €/Booking" value={`€${advanced.avgRevenuePerBooking}`} />
            </View>
          </>
        )}

        {/* Starter Upsell */}
        {plan === 'starter' && (
          <TouchableOpacity 
            style={styles.upsellBanner}
            onPress={() => navigation.navigate('Settings' as any)}
          >
            <Ionicons name="rocket-outline" size={20} color="#FFA726" />
            <View style={{ flex: 1 }}>
              <Text style={styles.upsellTitle}>Upgrade to Pro</Text>
              <Text style={styles.upsellText}>Unlock advanced analytics, up to 2 rooms, and featured listings.</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Today's Timeline */}
        <Text style={styles.sectionTitle}>{t('dashboard.todaySchedule')}</Text>
        {activeBookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="sunny-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>{t('dashboard.noBookingsToday')}</Text>
            <Text style={styles.emptyText}>
              {t('dashboard.noBookingsHint')}
            </Text>
          </View>
        ) : (
          activeBookings.map((booking: any) => {
            const src = getSourceStyle(booking.source);
            return (
              <TouchableOpacity
                key={booking._id}
                style={styles.bookingCard}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('CompanyBookingDetail', { bookingId: booking._id })}
              >
                <View style={[styles.timelineBar, { backgroundColor: src.text }]} />
                <View style={styles.bookingBody}>
                  <View style={styles.bookingTop}>
                    <Text style={styles.bookingTime}>{booking.time}</Text>
                    <View style={[styles.sourceBadge, { backgroundColor: src.bg }]}>
                      <Ionicons name={src.icon} size={10} color={src.text} />
                      <Text style={[styles.sourceBadgeText, { color: src.text }]}>
                        {booking.source === 'external'
                          ? booking.externalSource || t('dashboard.externalSource', { n: '' }).trim()
                          : t('dashboard.unlocked')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.bookingRoom}>{booking.roomTitle}</Text>
                  <View style={styles.bookingMeta}>
                    <Ionicons name="person-outline" size={12} color={theme.colors.textMuted} />
                    <Text style={styles.bookingMetaText}>{booking.playerName}</Text>
                    <Ionicons name="people-outline" size={12} color={theme.colors.textMuted} />
                    <Text style={styles.bookingMetaText}>{booking.players} players</Text>
                    {booking.source !== 'external' && booking.total > 0 && (
                      <>
                        <Ionicons name="cash-outline" size={12} color={theme.colors.textMuted} />
                        <Text style={styles.bookingMetaText}>€{booking.total}</Text>
                      </>
                    )}
                    {booking.paymentStatus && (
                      <View style={{
                        backgroundColor: booking.paymentStatus === 'paid' ? 'rgba(76,175,80,0.15)' : booking.paymentStatus === 'deposit' ? 'rgba(255,167,38,0.15)' : 'rgba(66,165,245,0.15)',
                        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 2,
                      }}>
                        <Text style={{
                          fontSize: 9, fontWeight: '700',
                          color: booking.paymentStatus === 'paid' ? '#4CAF50' : booking.paymentStatus === 'deposit' ? '#FFA726' : '#42A5F5',
                        }}>
                          {booking.paymentStatus === 'paid' ? t('dashboard.paid') : booking.paymentStatus === 'deposit' ? t('dashboard.deposit') : t('dashboard.unpaid')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── Helper Components ───
function OverviewLine({ label, value, max, color, noBar }: { label: string; value: any; max: number; color: string; noBar?: boolean }) {
  const pct = noBar ? 0 : (typeof value === 'number' ? Math.min(value / max, 1) * 100 : 0);
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{value}</Text>
      </View>
      {!noBar && (
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <View style={{ height: '100%', borderRadius: 2, backgroundColor: color, width: `${pct}%` } as any} />
        </View>
      )}
    </View>
  );
}

function MiniStat({ icon, color, label, value }: { icon: string; color: string; label: string; value: any }) {
  return (
    <View style={{
      flex: 1, minWidth: '30%' as any, alignItems: 'center', paddingVertical: 14,
      borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
      borderWidth: 1, borderColor: theme.colors.glassBorder,
    }}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 4 }}>{value}</Text>
      <Text style={{ fontSize: 9, color: theme.colors.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  greeting: { fontSize: 14, color: theme.colors.textSecondary },
  companyName: { fontSize: 24, fontWeight: '800', color: '#fff', marginTop: 2 },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
    ...theme.shadow.red,
  },

  dateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 16, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  dateText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  planBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10,
  },
  planBadgeText: { fontSize: 10, fontWeight: '700' },

  overviewRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, marginBottom: 16,
  },
  overviewCard: {
    padding: 14, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  donutCard: {
    width: 120, alignItems: 'center', justifyContent: 'center',
    padding: 14, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  donutCenter: {
    position: 'absolute', top: 14, left: 0, right: 0,
    height: 90, alignItems: 'center', justifyContent: 'center',
  },
  donutVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  donutMax: { fontSize: 10, color: theme.colors.textMuted },
  donutLabel: { fontSize: 10, color: theme.colors.textMuted, marginTop: 6 },

  analyticsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 20, marginBottom: 16,
  },
  insightCard: {
    marginHorizontal: 20, marginBottom: 16, padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  insightRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder,
  },
  insightLabel: { fontSize: 13, color: theme.colors.textMuted },
  insightVal: { fontSize: 16, fontWeight: '700', color: '#fff' },
  upsellBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginBottom: 20, padding: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(255,167,38,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,167,38,0.2)',
  },
  upsellTitle: { fontSize: 14, fontWeight: '700', color: '#FFA726' },
  upsellText: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },

  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, marginBottom: 12,
  },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  statVal: { fontSize: 24, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },

  sourceBreakdown: {
    flexDirection: 'row', justifyContent: 'center', gap: 16,
    paddingHorizontal: 20, marginBottom: 24,
  },
  sourceItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sourceDot: { width: 8, height: 8, borderRadius: 4 },
  sourceLabel: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },

  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: '#fff',
    paddingHorizontal: 20, marginBottom: 14,
  },

  emptyCard: {
    marginHorizontal: 20, alignItems: 'center', paddingVertical: 40,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder, gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },

  bookingCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 10, overflow: 'hidden',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  timelineBar: { width: 4, alignSelf: 'stretch' },
  bookingBody: { flex: 1, padding: 14 },
  bookingTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 4,
  },
  bookingTime: { fontSize: 16, fontWeight: '800', color: '#fff' },
  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10,
  },
  sourceBadgeText: { fontSize: 10, fontWeight: '700' },
  bookingRoom: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  bookingMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bookingMetaText: { fontSize: 11, color: theme.colors.textMuted },
});
