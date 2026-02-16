import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { rooms as staticRooms } from '../data';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

interface BookingItem {
  id: string;
  roomId: string;
  date: string;
  time: string;
  players: number;
  status: 'upcoming' | 'completed' | 'cancelled';
}

const mockBookings: BookingItem[] = [
  { id: 'b1', roomId: '1', date: 'Feb 14, 2026', time: '7:00 PM', players: 4, status: 'upcoming' },
  { id: 'b2', roomId: '3', date: 'Mar 1, 2026', time: '8:30 PM', players: 3, status: 'upcoming' },
  { id: 'b3', roomId: '2', date: 'Jan 10, 2026', time: '6:00 PM', players: 2, status: 'completed' },
  { id: 'b4', roomId: '5', date: 'Dec 22, 2025', time: '7:30 PM', players: 5, status: 'completed' },
  { id: 'b5', roomId: '4', date: 'Nov 5, 2025', time: '5:00 PM', players: 2, status: 'cancelled' },
];

export default function TicketsScreen() {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const { t } = useTranslation();

  const convexRooms = useQuery(api.rooms.list);
  const rooms = (convexRooms && convexRooms.length > 0
    ? convexRooms.map((r: any) => ({ ...r, id: r._id }))
    : staticRooms
  );

  const upcomingBookings = mockBookings.filter(b => b.status === 'upcoming');
  const pastBookings = mockBookings.filter(b => b.status !== 'upcoming');

  const currentBookings = activeTab === 'upcoming' ? upcomingBookings : pastBookings;

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
        {currentBookings.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="ticket-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>{t('tickets.noBookings', { tab: activeTab === 'upcoming' ? t('tickets.upcoming').toLowerCase() : t('tickets.past').toLowerCase() })}</Text>
          </View>
        ) : (
          currentBookings.map(booking => {
            const room = rooms.find(r => r.id === booking.roomId) || rooms[0];
            return (
              <View key={booking.id} style={styles.ticketCard}>
                <Image source={{ uri: room.image }} style={styles.ticketImage} />
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
                    {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                  </Text>
                </View>

                <View style={styles.ticketContent}>
                  <Text style={styles.ticketName}>{room.title}</Text>
                  <Text style={styles.ticketLoc}>{room.location}</Text>

                  <View style={styles.ticketDetails}>
                    <View style={styles.ticketInfo}>
                      <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.ticketInfoText}>{booking.date}</Text>
                    </View>
                    <View style={styles.ticketInfo}>
                      <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.ticketInfoText}>{booking.time}</Text>
                    </View>
                    <View style={styles.ticketInfo}>
                      <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
                      <Text style={styles.ticketInfoText}>{booking.players} {t('players')}</Text>
                    </View>
                  </View>

                  {booking.status === 'upcoming' && (
                    <View style={styles.ticketActions}>
                      <TouchableOpacity style={styles.ticketBtn} onPress={() => {
                        Alert.alert(t('tickets.qrTitle'), t('tickets.qrMessage', { id: booking.id.toUpperCase(), title: room.title, date: booking.date, time: booking.time }));
                      }}>
                        <Ionicons name="qr-code-outline" size={16} color={theme.colors.redPrimary} />
                        <Text style={styles.ticketBtnText}>{t('tickets.showQR')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.ticketBtn} onPress={() => {
                        const query = encodeURIComponent(room.location);
                        Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() => {
                          Alert.alert(t('tickets.directionsTitle'), t('tickets.directionsMessage', { location: room.location }));
                        });
                      }}>
                        <Ionicons name="navigate-outline" size={16} color={theme.colors.redPrimary} />
                        <Text style={styles.ticketBtnText}>{t('tickets.directions')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
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
  ticketLoc: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 14 },
  ticketDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  ticketInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ticketInfoText: { fontSize: 12, color: theme.colors.textSecondary },

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
});
