import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { rooms as staticRooms } from '../data';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import type { Id } from '../../convex/_generated/dataModel';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, 'DateTimeSelect'>;

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function DateTimeSelect() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteType>();
  const roomId = route.params.id;

  const convexRooms = useQuery(api.rooms.list);
  const allRooms = convexRooms && convexRooms.length > 0
    ? convexRooms.map((r: any) => ({ ...r, id: r._id }))
    : staticRooms;
  const room = allRooms.find((r: any) => r.id === roomId) || allRooms[0];

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [players, setPlayers] = useState(2);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;

  // Fetch per-date slots from Convex
  const convexSlots = useQuery(
    api.companies.getRoomSlots,
    room._id ? { roomId: room._id as Id<"rooms">, date: dateStr } : "skip"
  );

  // Build display slots: use per-date Convex slots, fallback to room defaults, then static
  const displaySlots = useMemo(() => {
    if (convexSlots && convexSlots.length > 0) {
      return convexSlots.map((s: any) => ({
        id: s._id || s.time,
        time: s.time,
        price: s.price,
        available: s.available,
      }));
    }
    if (room.defaultTimeSlots && room.defaultTimeSlots.length > 0) {
      return room.defaultTimeSlots.map((s: any, i: number) => ({
        id: `default-${i}`,
        time: s.time,
        price: s.price,
        available: true,
      }));
    }
    // Fallback static slots
    return [
      { id: '1', time: '10:00 AM', available: true, price: room.price || 35 },
      { id: '2', time: '11:30 AM', available: true, price: room.price || 35 },
      { id: '3', time: '1:00 PM', available: true, price: room.price || 35 },
      { id: '4', time: '2:30 PM', available: true, price: room.price || 35 },
      { id: '5', time: '4:00 PM', available: true, price: room.price || 38 },
      { id: '6', time: '5:30 PM', available: true, price: room.price || 38 },
      { id: '7', time: '7:00 PM', available: true, price: room.price || 42 },
      { id: '8', time: '8:30 PM', available: true, price: room.price || 42 },
    ];
  }, [convexSlots, room]);

  // Check if all regular slots are unavailable → unlock overflow
  const allRegularBooked = displaySlots.length > 0 && displaySlots.every((s: any) => !s.available);
  const overflowSlot = room.overflowSlot;
  const selectedDayOfWeek = new Date(currentYear, currentMonth, selectedDate).getDay(); // 0=Sun
  const overflowActiveToday = overflowSlot?.days
    ? overflowSlot.days.includes(selectedDayOfWeek)
    : true;
  const showOverflow = allRegularBooked && !!overflowSlot && overflowActiveToday;

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDay, daysInMonth]);

  // Helper: get the standard room-level group price for current player count
  const getRoomGroupPrice = () => {
    if (room.pricePerGroup && room.pricePerGroup.length > 0) {
      const match = room.pricePerGroup.find((g: any) => g.players === players);
      if (match) return match.price;
    }
    return room.price * players;
  };
  const standardPrice = getRoomGroupPrice();

  // Helper: get the effective price for a slot, applying room group pricing
  // If slot.price differs from room.price, scale the group price proportionally
  const getSlotPrice = (slot: any) => {
    if (slot.price === room.price || !room.price) return standardPrice;
    // Slot has a custom base price — scale proportionally
    const ratio = slot.price / room.price;
    return Math.round(standardPrice * ratio);
  };

  // Helper: get discount % for a slot (positive = cheaper than standard)
  const getSlotDiscount = (slot: any) => {
    const slotTotal = getSlotPrice(slot);
    if (slotTotal >= standardPrice || standardPrice === 0) return 0;
    return Math.round(((standardPrice - slotTotal) / standardPrice) * 100);
  };

  const selectedSlot = selectedTime === 'overflow'
    ? (overflowSlot ? { time: overflowSlot.time, price: overflowSlot.price } : null)
    : displaySlots.find((s: any) => s.id === selectedTime);
  const total = selectedSlot ? getSlotPrice(selectedSlot) : standardPrice;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Date & Time</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Calendar */}
        <View style={styles.calendarCard}>
          <View style={styles.calHeader}>
            <TouchableOpacity style={styles.calNavBtn} onPress={() => {
              if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
              else setCurrentMonth(m => m - 1);
            }}>
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.calMonth}>{monthNames[currentMonth]} {currentYear}</Text>
            <TouchableOpacity style={styles.calNavBtn} onPress={() => {
              if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
              else setCurrentMonth(m => m + 1);
            }}>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.calWeekdays}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <Text key={d} style={styles.calWeekday}>{d}</Text>
            ))}
          </View>

          <View style={styles.calGrid}>
            {calendarDays.map((day, i) => {
              const isPast = day !== null && day < 11;
              const isSelected = day === selectedDate;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.calDay, isSelected && styles.calDaySelected, !day && styles.calDayEmpty]}
                  disabled={!day || isPast}
                  onPress={() => day && setSelectedDate(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.calDayText,
                    isPast && styles.calDayPast,
                    isSelected && styles.calDayTextSelected,
                  ]}>
                    {day || ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Players */}
        <View style={styles.playersRow}>
          <Text style={styles.playersLabel}>Players</Text>
          <View style={styles.playersControl}>
            <TouchableOpacity style={styles.playersBtn} onPress={() => setPlayers(p => Math.max(room.playersMin, p - 1))}>
              <Text style={styles.playersBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.playersCount}>{players}</Text>
            <TouchableOpacity style={styles.playersBtn} onPress={() => setPlayers(p => Math.min(room.playersMax, p + 1))}>
              <Text style={styles.playersBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Time Slots */}
        <Text style={styles.timeSectionTitle}>Available Slots</Text>
        <View style={styles.timeGrid}>
          {displaySlots.map((slot: any) => {
            const slotTotal = getSlotPrice(slot);
            const discount = getSlotDiscount(slot);
            return (
              <TouchableOpacity
                key={slot.id}
                style={[
                  styles.timeCard,
                  selectedTime === slot.id && styles.timeCardSelected,
                  !slot.available && styles.timeCardUnavailable,
                ]}
                disabled={!slot.available}
                onPress={() => setSelectedTime(slot.id)}
                activeOpacity={0.7}
              >
                {discount > 0 && (
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>{discount}% OFF</Text>
                  </View>
                )}
                <Text style={[styles.timeVal, !slot.available && styles.timeValDisabled]}>{slot.time}</Text>
                <View style={styles.slotPriceRow}>
                  {discount > 0 && (
                    <Text style={styles.slotOrigPrice}>${standardPrice}</Text>
                  )}
                  <Text style={[styles.timePrice, discount > 0 && styles.timePriceDiscount]}>${slotTotal}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Overflow / Bonus Slot */}
        {showOverflow && (
          <View style={styles.overflowSection}>
            <View style={styles.overflowBadge}>
              <Ionicons name="flash" size={14} color="#FFD700" />
              <Text style={styles.overflowBadgeText}>Bonus Slot Unlocked!</Text>
            </View>
            <Text style={styles.overflowHint}>All regular slots are booked — a bonus slot is now available</Text>
            <TouchableOpacity
              style={[
                styles.timeCard,
                styles.overflowCard,
                selectedTime === 'overflow' && styles.timeCardSelected,
              ]}
              onPress={() => setSelectedTime('overflow')}
              activeOpacity={0.7}
            >
              <View style={styles.overflowInner}>
                <Ionicons name="flash" size={16} color="#FFD700" />
                <Text style={styles.timeVal}>{overflowSlot.time}</Text>
              </View>
              {(() => {
                const ovPrice = getSlotPrice({ price: overflowSlot.price });
                const ovDiscount = getSlotDiscount({ price: overflowSlot.price });
                return (
                  <View style={styles.slotPriceRow}>
                    {ovDiscount > 0 && <Text style={styles.slotOrigPrice}>${standardPrice}</Text>}
                    <Text style={[styles.timePrice, ovDiscount > 0 && styles.timePriceDiscount]}>${ovPrice}</Text>
                  </View>
                );
              })()}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalVal}>${total}</Text>
        </View>
        <TouchableOpacity
          style={[styles.continueBtn, !selectedTime && styles.continueBtnDisabled]}
          disabled={!selectedTime}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Checkout', {
            id: room.id,
            date: `${monthNames[currentMonth]} ${selectedDate}, ${currentYear}`,
            time: selectedSlot?.time || '',
            players,
            total,
          })}
        >
          <Text style={styles.continueBtnText}>Continue to Checkout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  scroll: { flex: 1, paddingHorizontal: 20 },

  // Calendar
  calendarCard: {
    padding: 20, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 20,
  },
  calHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20,
  },
  calNavBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
  },
  calMonth: { fontSize: 16, fontWeight: '700', color: '#fff' },
  calWeekdays: { flexDirection: 'row', marginBottom: 10 },
  calWeekday: {
    flex: 1, textAlign: 'center', fontSize: 12,
    color: theme.colors.textMuted, fontWeight: '600',
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: {
    width: '14.28%', aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  calDaySelected: {
    backgroundColor: theme.colors.redPrimary,
    ...theme.shadow.red,
  },
  calDayEmpty: { opacity: 0 },
  calDayText: { fontSize: 14, fontWeight: '500', color: '#fff' },
  calDayPast: { color: theme.colors.textMuted, opacity: 0.4 },
  calDayTextSelected: { fontWeight: '700' },

  // Players
  playersRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingHorizontal: 20,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    marginBottom: 20,
  },
  playersLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  playersControl: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  playersBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  playersBtnText: { fontSize: 18, fontWeight: '600', color: '#fff' },
  playersCount: { fontSize: 18, fontWeight: '700', color: '#fff', minWidth: 24, textAlign: 'center' },

  // Time Slots
  timeSectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 14 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeCard: {
    width: '48%', alignItems: 'center', gap: 4,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  timeCardSelected: { backgroundColor: theme.colors.redSubtle, borderColor: theme.colors.redPrimary },
  timeCardUnavailable: { opacity: 0.3 },
  timeVal: { fontSize: 15, fontWeight: '600', color: '#fff' },
  timeValDisabled: { color: theme.colors.textMuted },
  timePrice: { fontSize: 12, color: theme.colors.textSecondary },
  timePriceDiscount: { color: '#4CAF50', fontWeight: '700' },
  slotPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotOrigPrice: {
    fontSize: 11, color: theme.colors.textMuted,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    position: 'absolute', top: 4, right: 4,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(76,175,80,0.2)',
  },
  discountText: { fontSize: 9, fontWeight: '800', color: '#4CAF50' },

  // Overflow slot
  overflowSection: { marginTop: 20 },
  overflowBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,215,0,0.15)',
    marginBottom: 6,
  },
  overflowBadgeText: { fontSize: 13, fontWeight: '700', color: '#FFD700' },
  overflowHint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 10 },
  overflowCard: {
    borderColor: '#FFD700', borderWidth: 1,
    width: '100%',
    backgroundColor: 'rgba(255,215,0,0.08)',
  },
  overflowInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.95)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  totalLabel: { fontSize: 14, color: theme.colors.textSecondary },
  totalVal: { fontSize: 22, fontWeight: '800', color: theme.colors.redPrimary },
  continueBtn: {
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary, alignItems: 'center',
    ...theme.shadow.red,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
