// PHASE 2: Admin Calendar View
// Replaces the old flat booking list with a full calendar picker.
// Company admins can browse any date, see per-room bookings,
// and navigate to booking details or add new bookings.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  companyId: string;
}

export default function CompanyBookings({ companyId }: Props) {
  const navigation = useNavigation<Nav>();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(today.getDate());

  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;

  const bookings = useQuery(api.companies.getBookingsByDate, {
    companyId: companyId as Id<"companies">,
    date: dateStr,
  });

  const rooms = useQuery(api.companies.getRooms, {
    companyId: companyId as Id<"companies">,
  });

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDay, daysInMonth]);

  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() &&
    currentYear === today.getFullYear();

  // Group bookings by room
  const bookingsByRoom = useMemo(() => {
    if (!bookings || !rooms) return {};
    const map: Record<string, any[]> = {};
    for (const room of rooms) {
      map[room._id] = bookings.filter(
        (b: any) => String(b.roomId) === String(room._id) && b.status !== 'cancelled'
      );
    }
    return map;
  }, [bookings, rooms]);

  const getSourceColor = (source: string) =>
    source === 'external'
      ? { bg: 'rgba(255,167,38,0.15)', text: '#FFA726' }
      : { bg: 'rgba(76,175,80,0.15)', text: '#4CAF50' };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('CompanyAddBooking', { companyId, date: dateStr })}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Mini Calendar */}
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={() => {
              if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
              else setCurrentMonth((m) => m - 1);
            }}>
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.calMonth}>{MONTH_NAMES[currentMonth]} {currentYear}</Text>
            <TouchableOpacity onPress={() => {
              if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
              else setCurrentMonth((m) => m + 1);
            }}>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.calWeekdays}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <Text key={d} style={styles.calWeekday}>{d}</Text>
            ))}
          </View>
          <View style={styles.calGrid}>
            {calendarDays.map((day, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.calDay,
                  day === selectedDate && styles.calDaySelected,
                  !day && styles.calDayEmpty,
                  !!day && isToday(day) && day !== selectedDate && styles.calDayToday,
                ]}
                disabled={!day}
                onPress={() => day && setSelectedDate(day)}
              >
                <Text style={[
                  styles.calDayText,
                  day === selectedDate && styles.calDayTextSel,
                  !!day && isToday(day) && day !== selectedDate && styles.calDayTextToday,
                ]}>
                  {day || ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date + Count */}
        <View style={styles.dateLabelRow}>
          <Text style={styles.dateLabel}>
            {MONTH_NAMES[currentMonth]} {selectedDate}, {currentYear}
          </Text>
          <Text style={styles.bookingCount}>
            {bookings?.filter((b: any) => b.status !== 'cancelled').length ?? 0} bookings
          </Text>
        </View>

        {/* Per-Room Breakdown */}
        {!rooms || !bookings ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.colors.redPrimary} />
          </View>
        ) : rooms.filter((r: any) => r.isActive !== false).length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No Active Rooms</Text>
            <Text style={styles.emptyText}>Add rooms to start managing bookings</Text>
          </View>
        ) : (
          rooms
            .filter((r: any) => r.isActive !== false)
            .map((room: any) => {
              const roomBookings = bookingsByRoom[room._id] || [];
              return (
                <View key={room._id} style={styles.roomSection}>
                  <View style={styles.roomHeader}>
                    <Text style={styles.roomName} numberOfLines={1}>{room.title}</Text>
                    <Text style={styles.roomCount}>
                      {roomBookings.length} booked
                    </Text>
                  </View>

                  {roomBookings.length === 0 ? (
                    <View style={styles.noBookings}>
                      <Text style={styles.noBookingsText}>No bookings</Text>
                      <TouchableOpacity
                        onPress={() =>
                          navigation.navigate('CompanyAddBooking', {
                            companyId, roomId: room._id, date: dateStr,
                          })
                        }
                      >
                        <Text style={styles.addLink}>+ Add</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    roomBookings.map((booking: any) => {
                      const sc = getSourceColor(booking.source);
                      return (
                        <TouchableOpacity
                          key={booking._id}
                          style={styles.slotCard}
                          activeOpacity={0.7}
                          onPress={() => navigation.navigate('CompanyBookingDetail', { bookingId: booking._id })}
                        >
                          <View style={[styles.slotBar, { backgroundColor: sc.text }]} />
                          <View style={styles.slotBody}>
                            <View style={styles.slotTop}>
                              <Text style={styles.slotTime}>{booking.time}</Text>
                              <View style={[styles.srcBadge, { backgroundColor: sc.bg }]}>
                                <Text style={[styles.srcBadgeText, { color: sc.text }]}>
                                  {booking.source === 'external'
                                    ? booking.externalSource || 'External'
                                    : 'UNLOCKED'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.slotPlayer}>{booking.playerName}</Text>
                            <Text style={styles.slotMeta}>
                              {booking.players} players
                              {booking.source !== 'external' && booking.total > 0
                                ? ` · €${booking.total}`
                                : ''}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      );
                    })
                  )}
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
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
    ...theme.shadow.red,
  },

  calCard: {
    margin: 20, marginBottom: 12, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  calHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  calMonth: { fontSize: 16, fontWeight: '700', color: '#fff' },
  calWeekdays: { flexDirection: 'row', marginBottom: 8 },
  calWeekday: {
    flex: 1, textAlign: 'center', fontSize: 12,
    color: theme.colors.textMuted, fontWeight: '600',
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: {
    width: '14.28%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', borderRadius: 8,
  },
  calDaySelected: { backgroundColor: theme.colors.redPrimary },
  calDayToday: {
    borderWidth: 1, borderColor: theme.colors.redPrimary,
  },
  calDayEmpty: { opacity: 0 },
  calDayText: { fontSize: 14, fontWeight: '500', color: '#fff' },
  calDayTextSel: { fontWeight: '700' },
  calDayTextToday: { color: theme.colors.redPrimary },

  dateLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 14,
  },
  dateLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  bookingCount: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },

  loading: { paddingTop: 60, alignItems: 'center' },
  emptyCard: {
    marginHorizontal: 20, alignItems: 'center', paddingVertical: 40,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder, gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  emptyText: { fontSize: 13, color: theme.colors.textMuted },

  roomSection: {
    marginHorizontal: 20, marginBottom: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    overflow: 'hidden',
  },
  roomHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  roomName: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 },
  roomCount: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },

  noBookings: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14,
  },
  noBookingsText: { fontSize: 13, color: theme.colors.textMuted },
  addLink: { fontSize: 13, fontWeight: '700', color: theme.colors.redPrimary },

  slotCard: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  slotBar: { width: 4, alignSelf: 'stretch' },
  slotBody: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
  slotTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 2,
  },
  slotTime: { fontSize: 14, fontWeight: '700', color: '#fff' },
  srcBadge: {
    paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8,
  },
  srcBadgeText: { fontSize: 9, fontWeight: '700' },
  slotPlayer: { fontSize: 12, color: theme.colors.textSecondary },
  slotMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
