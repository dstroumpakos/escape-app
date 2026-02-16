// PHASE 1 FIX: Dashboard replaced with "Today's Bookings" as default landing page.
// Business users see their schedule at a glance — the most important screen.
// Shows quick stats and a timeline of today's bookings across all rooms.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('dashboard.welcome')}</Text>
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
            style={styles.addBtn}
            onPress={() => navigation.navigate('CompanyAddBooking', { companyId, date: dateStr })}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Date Banner */}
        <View style={styles.dateBanner}>
          <Ionicons name="calendar" size={18} color={theme.colors.redPrimary} />
          <Text style={styles.dateText}>
            {DAYS[today.getDay()]}, {MONTHS[today.getMonth()]} {today.getDate()}, {today.getFullYear()}
          </Text>
        </View>

        {/* Quick Stats */}
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
  dateText: { fontSize: 15, fontWeight: '600', color: '#fff' },

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
