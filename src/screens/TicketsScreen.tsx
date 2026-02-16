import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Linking, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import type { Id } from '../../convex/_generated/dataModel';

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

  const upcomingBookings = (bookings || []).filter((b: any) => b.status === 'upcoming');
  const pastBookings = (bookings || []).filter((b: any) => b.status !== 'upcoming');

  const currentBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;
  const isLoading = userId && bookings === undefined;

  // QR modal state
  const [qrBooking, setQrBooking] = useState<any>(null);

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
          <Ionicons name="filter-outline" size={20} color="#fff" />
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

                  {booking.status === 'upcoming' && (
                    <View style={styles.ticketActions}>
                      <TouchableOpacity style={styles.ticketBtn} onPress={() => setQrBooking(booking)}>
                        <Ionicons name="qr-code-outline" size={16} color={theme.colors.redPrimary} />
                        <Text style={styles.ticketBtnText}>{t('tickets.showQR')}</Text>
                      </TouchableOpacity>
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
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* QR Code Modal */}
      <Modal
        visible={!!qrBooking}
        transparent
        animationType="fade"
        onRequestClose={() => setQrBooking(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Close button */}
            <TouchableOpacity style={styles.modalClose} onPress={() => setQrBooking(null)}>
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>{t('tickets.qrTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('tickets.qrScanHint')}</Text>

            {/* QR Code */}
            <View style={styles.qrWrapper}>
              <QRCode
                value={JSON.stringify({
                  code: qrBooking?.bookingCode || qrBooking?._id,
                  room: qrBooking?.room?.title,
                  date: qrBooking?.date,
                  time: qrBooking?.time,
                  players: qrBooking?.players,
                })}
                size={200}
                backgroundColor="#fff"
                color="#1a0d0d"
              />
            </View>

            {/* Booking Info */}
            <Text style={styles.qrCode}>{qrBooking?.bookingCode || ''}</Text>
            <Text style={styles.qrRoom}>{qrBooking?.room?.title || ''}</Text>
            <View style={styles.qrDetails}>
              <View style={styles.qrDetail}>
                <Ionicons name="calendar-outline" size={14} color={theme.colors.textMuted} />
                <Text style={styles.qrDetailText}>{formatDisplayDate(qrBooking?.date || '')}</Text>
              </View>
              <View style={styles.qrDetail}>
                <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                <Text style={styles.qrDetailText}>{qrBooking?.time}</Text>
              </View>
              <View style={styles.qrDetail}>
                <Ionicons name="people-outline" size={14} color={theme.colors.textMuted} />
                <Text style={styles.qrDetailText}>{qrBooking?.players} {t('players')}</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
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
  tabTextActive: { color: '#fff' },

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
    borderRadius: 20,
  },
  statusUpcoming: { backgroundColor: 'rgba(76,175,80,0.8)' },
  statusCompleted: { backgroundColor: 'rgba(100,100,100,0.8)' },
  statusCancelled: { backgroundColor: 'rgba(244,67,54,0.6)' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  ticketContent: { padding: 16 },
  ticketName: { fontSize: 17, fontWeight: '800', color: '#fff', marginBottom: 3 },
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
    borderRadius: 12, marginTop: 10,
  },
  paymentBadgeText: { fontSize: 11, fontWeight: '700' },

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

  // QR Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center',
    padding: 30,
  },
  modalCard: {
    width: '100%', maxWidth: 340,
    backgroundColor: theme.colors.bgCardSolid,
    borderRadius: theme.radius.xl,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    padding: 28, alignItems: 'center',
  },
  modalClose: {
    position: 'absolute', top: 14, right: 14,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: theme.colors.glass,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 20, textAlign: 'center' },
  qrWrapper: {
    padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  qrCode: {
    fontSize: 18, fontWeight: '800', color: theme.colors.redPrimary,
    letterSpacing: 2, marginBottom: 6,
  },
  qrRoom: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 14, textAlign: 'center' },
  qrDetails: { flexDirection: 'row', gap: 16 },
  qrDetail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qrDetailText: { fontSize: 12, color: theme.colors.textSecondary },
});
