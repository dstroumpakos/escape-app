import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';
import { slotStart } from '../slotTime';
import { ROOM_REPORT_WINDOW_MS } from '../../convex/reportRules';
import RoomReportModal from './reports/RoomReportModal';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDisplayDate(iso: string): string {
  if (!iso || !iso.includes('-')) return iso; // already human-readable
  const [y, m, d] = iso.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

export default function TicketsScreen() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const { t } = useTranslation();
  const { userId } = useUser();

  const bookings = useQuery(
    api.bookings.getByUser,
    userId ? { userId: userId as Id<"users"> } : 'skip',
  );
  const cancelBooking = useMutation(api.bookings.cancel);
  const myRoomReports = useQuery(
    api.reports.myRoomReports,
    userId ? { userId: userId as Id<"users"> } : 'skip',
  );
  const [reporting, setReporting] = useState<any>(null);

  const upcomingBookings = (bookings || []).filter((b: any) => b.status === 'upcoming');
  const pastBookings = (bookings || []).filter((b: any) => b.status === 'completed');

  const currentBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;
  const isLoading = userId && bookings === undefined;


  // Countdown timer tick
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleCancel = (booking: any) => {
    const roomTitle = booking.room?.title || t('tickets.escapeRoom');
    Alert.alert(
      t('tickets.cancelTitle'),
      t('tickets.cancelMessage', { title: roomTitle, date: formatDisplayDate(booking.date), time: booking.time }),
      [
        { text: t('tickets.keepBooking'), style: 'cancel' },
        {
          text: t('tickets.confirmCancel'),
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelBooking({ id: booking._id });
              Alert.alert(t('tickets.cancelled'), t('tickets.cancelledMsg'));
            } catch {
              Alert.alert(t('error'), t('tickets.cancelFailed'));
            }
          },
        },
      ],
    );
  };

  const getPaymentBadge = (status?: string) => {
    if (status === 'paid') return { label: t('tickets.paid'), color: '#4CAF50', bg: 'rgba(76,175,80,0.15)' };
    if (status === 'deposit') return { label: t('tickets.deposit'), color: '#FFA726', bg: 'rgba(255,167,38,0.15)' };
    if (status === 'unpaid') return { label: t('tickets.payOnArrival'), color: '#42A5F5', bg: 'rgba(66,165,245,0.15)' };
    return null;
  };

  const getCountdown = (dateStr: string, timeStr: string): string | null => {
    try {
      // Parse "YYYY-MM-DD" + "10:00 AM" style
      const [y, m, d] = dateStr.split('-').map(Number);
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;
      let hours = parseInt(match[1]);
      const mins = parseInt(match[2]);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const target = new Date(y, m - 1, d, hours, mins).getTime();
      const diff = target - now;
      if (diff <= 0) return null;
      const totalMins = Math.floor(diff / 60000);
      const days = Math.floor(totalMins / 1440);
      const hrs = Math.floor((totalMins % 1440) / 60);
      const remainMins = totalMins % 60;
      if (days > 0) return `${days}d ${hrs}h`;
      if (hrs > 0) return `${hrs}h ${remainMins}m`;
      return `${remainMins}m`;
    } catch {
      return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('tickets.title')}</Text>
        <TouchableOpacity style={styles.filterBtn} onPress={() => {
          Alert.alert(t('tickets.filterTitle'), t('tickets.filterMessage'), [
            { text: t('tickets.all'), onPress: () => {} },
            { text: t('tickets.upcomingOnly'), onPress: () => setActiveTab('upcoming') },
            { text: t('tickets.pastOnly'), onPress: () => setActiveTab('past') },
            { text: t('cancel'), style: 'cancel' },
          ]);
        }}>
          <Ionicons name="filter-outline" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            {t('tickets.upcoming')} ({upcomingBookings.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.tabActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.tabTextActive]}>
            {t('tickets.past')} ({pastBookings.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {isLoading ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={theme.colors.redPrimary} />
          </View>
        ) : !userId ? (
          <View style={styles.empty}>
            <Ionicons name="log-in-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>{t('tickets.loginRequired')}</Text>
          </View>
        ) : currentBookings.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="ticket-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>{t('tickets.noBookings', { tab: activeTab === 'upcoming' ? t('tickets.upcoming').toLowerCase() : t('tickets.past').toLowerCase() })}</Text>
          </View>
        ) : (
          currentBookings.map((booking: any) => {
            const room = booking.room;
            const payment = getPaymentBadge(booking.paymentStatus);
            return (
              <View key={booking._id} style={styles.ticketCard}>
                {room?.image ? (
                  <Image source={{ uri: room.image }} style={styles.ticketImage} />
                ) : (
                  <View style={[styles.ticketImage, { backgroundColor: theme.colors.bgCardSolid }]} />
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.8)']}
                  style={styles.ticketGradient}
                />

                {/* Status Badge */}
                <View style={[
                  styles.statusBadge,
                  booking.status === 'upcoming' && styles.statusUpcoming,
                  booking.status === 'completed' && styles.statusCompleted,
                  booking.status === 'cancelled' && styles.statusCancelled,
                ]}>
                  <Text style={styles.statusText}>
                    {booking.status === 'upcoming' ? t('tickets.statusUpcoming')
                      : booking.status === 'completed' ? t('tickets.statusCompleted')
                      : t('tickets.statusCancelled')}
                  </Text>
                </View>

                <View style={styles.ticketContent}>
                  <Text style={styles.ticketName}>{room?.title || t('tickets.escapeRoom')}</Text>
                  <Text style={styles.ticketLoc}>{room?.location || ''}</Text>

                  {/* Booking Code */}
                  {booking.bookingCode && (
                    <View style={styles.bookingCodeRow}>
                      <Ionicons name="key-outline" size={13} color={theme.colors.redPrimary} />
                      <Text style={styles.bookingCodeText}>{booking.bookingCode}</Text>
                    </View>
                  )}

                  <View style={styles.ticketDetails}>
                    <View style={styles.ticketInfo}>
                      <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.ticketInfoText}>{formatDisplayDate(booking.date)}</Text>
                    </View>
                    <View style={styles.ticketInfo}>
                      <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.ticketInfoText}>{booking.time}</Text>
                    </View>
                    <View style={styles.ticketInfo}>
                      <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.ticketInfoText}>{booking.players} {t('players')}</Text>
                    </View>
                    {booking.total > 0 && (
                      <View style={styles.ticketInfo}>
                        <Ionicons name="pricetag-outline" size={14} color={theme.colors.textSecondary} />
                        <Text style={styles.ticketInfoText}>€{booking.total.toFixed(2)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Payment Badge */}
                  {payment && (
                    <View style={[styles.paymentBadge, { backgroundColor: payment.bg }]}>
                      <Ionicons name="card-outline" size={12} color={payment.color} />
                      <Text style={[styles.paymentBadgeText, { color: payment.color }]}>{payment.label}</Text>
                    </View>
                  )}

                  {/* Countdown Timer */}
                  {booking.status === 'upcoming' && (() => {
                    const cd = getCountdown(booking.date, booking.time);
                    if (!cd) return null;
                    return (
                      <View style={styles.countdownRow}>
                        <Ionicons name="timer-outline" size={14} color={theme.colors.redPrimary} />
                        <Text style={styles.countdownText}>{t('tickets.startsIn')} {cd}</Text>
                      </View>
                    );
                  })()}

                  {booking.status === 'upcoming' && (
                    <View style={styles.ticketActions}>
                      <TouchableOpacity style={styles.ticketBtn} onPress={() => {
                        const query = encodeURIComponent(room?.location || '');
                        Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() => {
                          Alert.alert(t('tickets.directionsTitle'), t('tickets.directionsMessage', { location: room?.location || '' }));
                        });
                      }}>
                        <Ionicons name="navigate-outline" size={16} color={theme.colors.redPrimary} />
                        <Text style={styles.ticketBtnText}>{t('tickets.directions')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(booking)}>
                        <Ionicons name="close-circle-outline" size={16} color="#F44336" />
                        <Text style={styles.cancelBtnText}>{t('tickets.cancel')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Report a problem with the room (completed games, up to 30 days) */}
                  {booking.status === 'completed' && (() => {
                    const sent = (myRoomReports || []).find((r) => r.bookingId === booking._id);
                    if (sent) {
                      return (
                        <View style={styles.countdownRow}>
                          <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.textMuted} />
                          <Text style={styles.reportStatusText}>{t(`reports.room.status_${sent.status}`)}</Text>
                        </View>
                      );
                    }
                    const end = slotStart(booking.date, booking.time).getTime() + (room?.duration || 60) * 60000;
                    if (Date.now() > end + ROOM_REPORT_WINDOW_MS) return null;
                    return (
                      <View style={styles.ticketActions}>
                        <TouchableOpacity style={styles.ticketBtn} onPress={() => setReporting(booking)}>
                          <Ionicons name="shield-outline" size={16} color={theme.colors.redPrimary} />
                          <Text style={styles.ticketBtnText}>{t('reports.room.button')}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {userId && (
        <RoomReportModal
          visible={!!reporting}
          userId={userId}
          booking={reporting}
          onClose={() => setReporting(null)}
          onSent={() => {
            setReporting(null);
            Alert.alert(t('done'), t('reports.room.sent'));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  reportStatusText: { fontSize: 13, color: theme.colors.textMuted },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontFamily: theme.fonts.display, color: theme.colors.bone },
  filterBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
  },

  // Tabs
  tabs: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 20,
    borderRadius: theme.radius.md, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.redPrimary,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  tabTextActive: { color: theme.colors.bone },

  scroll: { flex: 1, paddingHorizontal: 20 },

  // Empty State
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: theme.colors.textMuted },

  // Ticket Card
  ticketCard: {
    borderRadius: theme.radius.xl, overflow: 'hidden',
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 16,
  },
  ticketImage: { width: '100%', height: 140 },
  ticketGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 140,
  },
  statusBadge: {
    position: 'absolute', top: 14, right: 14,
    paddingVertical: 4, paddingHorizontal: 12,
    borderRadius: theme.radius.xl,
  },
  statusUpcoming: { backgroundColor: 'rgba(76,175,80,0.8)' },
  statusCompleted: { backgroundColor: 'rgba(100,100,100,0.8)' },
  statusCancelled: { backgroundColor: 'rgba(244,67,54,0.6)' },
  statusText: { fontSize: 11, fontWeight: '700', color: theme.colors.bone },

  ticketContent: { padding: 16 },
  ticketName: { fontSize: 17, fontWeight: '800', color: theme.colors.bone, marginBottom: 3 },
  ticketLoc: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 6 },
  bookingCodeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 10, paddingVertical: 5, paddingHorizontal: 10,
    alignSelf: 'flex-start',
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)',
  },
  bookingCodeText: { fontSize: 13, fontWeight: '800', color: theme.colors.redPrimary, letterSpacing: 1 },
  ticketDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  ticketInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ticketInfoText: { fontSize: 12, color: theme.colors.textSecondary },
  paymentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: theme.radius.lg, marginTop: 10,
  },
  paymentBadgeText: { fontSize: 11, fontWeight: '700' },

  // Countdown
  countdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingVertical: 6, paddingHorizontal: 12,
    alignSelf: 'flex-start',
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.2)',
  },
  countdownText: { fontSize: 12, fontWeight: '700', color: theme.colors.redPrimary },

  // Actions
  ticketActions: {
    flexDirection: 'row', gap: 10, marginTop: 14,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  ticketBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  ticketBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.redPrimary },
  cancelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: theme.radius.md,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.25)',
  },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: '#F44336' },
});
