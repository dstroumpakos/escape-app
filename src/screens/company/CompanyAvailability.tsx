import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';

type RouteType = RouteProp<RootStackParamList, 'CompanyAvailability'>;

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FALLBACK_TIMES = [
  '10:00 AM', '11:30 AM', '1:00 PM', '2:30 PM',
  '4:00 PM', '5:30 PM', '7:00 PM', '8:30 PM',
];

interface SlotDraft {
  time: string;
  price: string;
  available: boolean;
  discount: string; // percentage discount (0-100)
}

export default function CompanyAvailability() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { roomId, roomTitle } = route.params;

  // Fetch the room to get its defaultTimeSlots
  const room = useQuery(api.rooms.getById, { id: roomId as Id<"rooms"> });

  // Build defaults from room's configured time slots, or fall back to hardcoded
  const getDefaults = (): SlotDraft[] => {
    if (room?.defaultTimeSlots && room.defaultTimeSlots.length > 0) {
      return room.defaultTimeSlots.map((s: any) => ({
        time: s.time,
        price: String(s.price),
        available: true,
        discount: '0',
      }));
    }
    const basePrice = room ? String(room.price) : '35';
    return FALLBACK_TIMES.map((time) => ({ time, price: basePrice, available: true, discount: '0' }));
  };

  const [currentMonth, setCurrentMonth] = useState(1); // Feb
  const [currentYear, setCurrentYear] = useState(2026);
  const [selectedDate, setSelectedDate] = useState(12);
  const [saving, setSaving] = useState(false);

  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;

  const existingSlots = useQuery(api.companies.getRoomSlots, {
    roomId: roomId as Id<"rooms">,
    date: dateStr,
  });

  const setSlotsMutation = useMutation(api.companies.setSlots);

  const [slots, setSlots] = useState<SlotDraft[]>([]);

  // Initialize slots from room defaults once room loads
  React.useEffect(() => {
    if (room && slots.length === 0) {
      setSlots(getDefaults());
    }
  }, [room]);

  // Sync when existing per-date slots load
  React.useEffect(() => {
    if (existingSlots && existingSlots.length > 0 && room) {
      setSlots(
        existingSlots.map((s: any) => {
          const roomBase = room.price || 35;
          const slotPrice = s.price || roomBase;
          // Derive discount from price difference vs room base price
          const disc = slotPrice < roomBase ? Math.round((1 - slotPrice / roomBase) * 100) : 0;
          return {
            time: s.time,
            price: String(s.price),
            available: s.available,
            discount: String(disc),
          };
        })
      );
    } else if (existingSlots && existingSlots.length === 0) {
      setSlots(getDefaults());
    }
  }, [existingSlots, room]);

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const calendarDays = React.useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDay, daysInMonth]);

  const toggleSlot = (idx: number) => {
    setSlots((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], available: !copy[idx].available };
      return copy;
    });
  };

  const updateSlotPrice = (idx: number, price: string) => {
    setSlots((prev) => {
      const copy = [...prev];
      // Recalculate discount based on new price
      const roomBase = room?.price || 35;
      const numPrice = parseFloat(price) || 0;
      const disc = numPrice < roomBase ? Math.round((1 - numPrice / roomBase) * 100) : 0;
      copy[idx] = { ...copy[idx], price, discount: String(disc) };
      return copy;
    });
  };

  const updateSlotDiscount = (idx: number, discountStr: string) => {
    setSlots((prev) => {
      const copy = [...prev];
      const disc = Math.min(100, Math.max(0, parseInt(discountStr) || 0));
      const roomBase = room?.price || 35;
      const newPrice = Math.round(roomBase * (1 - disc / 100) * 100) / 100;
      copy[idx] = { ...copy[idx], discount: discountStr, price: String(newPrice) };
      return copy;
    });
  };

  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  // Get group price breakdown for a slot with discount applied
  const getGroupBreakdown = (discountPct: number) => {
    if (!room?.pricePerGroup || room.pricePerGroup.length === 0) return [];
    return room.pricePerGroup.map((g: { players: number; price: number }) => {
      const discounted = Math.round(g.price * (1 - discountPct / 100) * 100) / 100;
      const saved = Math.round((g.price - discounted) * 100) / 100;
      return { players: g.players, original: g.price, discounted, saved };
    });
  };

  const addSlot = () => {
    Alert.prompt?.('Add Time Slot', 'Enter time (e.g. 9:00 PM)', (time: string) => {
      if (time.trim()) {
        setSlots((prev) => [...prev, { time: time.trim(), price: String(room?.price || 35), available: true, discount: '0' }]);
      }
    });
    // Fallback for Android (no Alert.prompt)
    setSlots((prev) => [...prev, { time: `${9 + prev.length}:00 PM`, price: String(room?.price || 35), available: true, discount: '0' }]);
  };

  const removeSlot = (idx: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSlotsMutation({
        roomId: roomId as Id<"rooms">,
        date: dateStr,
        slots: slots.map((s) => ({
          time: s.time,
          price: parseFloat(s.price) || 0,
          available: s.available,
        })),
      });
      Alert.alert('Saved', `Time slots for ${monthNames[currentMonth]} ${selectedDate} saved.`);
    } catch {
      Alert.alert('Error', 'Failed to save slots.');
    }
    setSaving(false);
  };

  const copyToWeek = async () => {
    setSaving(true);
    try {
      // Copy current slots to next 7 days
      for (let d = 1; d <= 7; d++) {
        const nextDate = new Date(currentYear, currentMonth, selectedDate + d);
        const ds = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
        await setSlotsMutation({
          roomId: roomId as Id<"rooms">,
          date: ds,
          slots: slots.map((s) => ({
            time: s.time,
            price: parseFloat(s.price) || 0,
            available: s.available,
          })),
        });
      }
      Alert.alert('Done', 'Slots copied to the next 7 days.');
    } catch {
      Alert.alert('Error', 'Failed to copy slots.');
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Availability</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{roomTitle}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
        {/* Calendar */}
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={() => {
              if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
              else setCurrentMonth((m) => m - 1);
            }}>
              <Ionicons name="chevron-back" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.calMonth}>{monthNames[currentMonth]} {currentYear}</Text>
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
                ]}
                disabled={!day}
                onPress={() => day && setSelectedDate(day)}
              >
                <Text style={[styles.calDayText, day === selectedDate && styles.calDayTextSel]}>
                  {day || ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Time Slots */}
        <View style={styles.slotsHeader}>
          <Text style={styles.sectionTitle}>
            Time Slots — {monthNames[currentMonth]} {selectedDate}
          </Text>
          <TouchableOpacity style={styles.addSlotBtn} onPress={addSlot}>
            <Ionicons name="add" size={18} color={theme.colors.redPrimary} />
          </TouchableOpacity>
        </View>

        {/* Overflow indicator */}
        {slots.length > 0 && slots.every((s) => !s.available) && room?.overflowSlot && (
          <View style={styles.overflowBanner}>
            <Ionicons name="flash" size={16} color="#FFD700" />
            <Text style={styles.overflowBannerText}>
              All slots booked — overflow slot ({room.overflowSlot.time} · €{room.overflowSlot.price}) is now visible to players
            </Text>
          </View>
        )}

        {slots.map((slot, idx) => {
          const discPct = parseInt(slot.discount) || 0;
          const breakdown = discPct > 0 ? getGroupBreakdown(discPct) : [];
          const isExpanded = expandedSlot === idx && discPct > 0;

          return (
            <View key={idx}>
              <View style={styles.slotRow}>
                <TouchableOpacity
                  style={[styles.slotToggle, !slot.available && styles.slotToggleOff]}
                  onPress={() => toggleSlot(idx)}
                >
                  <Ionicons
                    name={slot.available ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={slot.available ? theme.colors.success : theme.colors.textMuted}
                  />
                </TouchableOpacity>
                <Text style={[styles.slotTime, !slot.available && styles.slotTimeOff]}>{slot.time}</Text>
                <View style={styles.slotPriceWrap}>
                  <Text style={styles.slotDollar}>€</Text>
                  <TextInput
                    style={styles.slotPriceInput}
                    value={slot.price}
                    onChangeText={(v) => updateSlotPrice(idx, v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                {/* Discount % field */}
                <TouchableOpacity
                  style={[styles.discountWrap, discPct > 0 && styles.discountWrapActive]}
                  onPress={() => setExpandedSlot(isExpanded ? null : idx)}
                  activeOpacity={0.7}
                >
                  <TextInput
                    style={[styles.discountInput, discPct > 0 && styles.discountInputActive]}
                    value={slot.discount === '0' ? '' : slot.discount}
                    onChangeText={(v) => updateSlotDiscount(idx, v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={3}
                  />
                  <Text style={[styles.discountPercent, discPct > 0 && styles.discountPercentActive]}>%</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeSlot(idx)} style={styles.slotDelete}>
                  <Ionicons name="trash-outline" size={16} color="#F44336" />
                </TouchableOpacity>
              </View>

              {/* Expandable group breakdown when discount is active */}
              {isExpanded && breakdown.length > 0 && (
                <View style={styles.breakdownCard}>
                  <Text style={styles.breakdownTitle}>Discount Breakdown</Text>
                  {breakdown.map((g) => (
                    <View key={g.players} style={styles.breakdownRow}>
                      <View style={styles.breakdownPlayers}>
                        <Ionicons name="people" size={13} color={theme.colors.textSecondary} />
                        <Text style={styles.breakdownPlayerText}>{g.players} players</Text>
                      </View>
                      <Text style={styles.breakdownOriginal}>${g.original}</Text>
                      <Ionicons name="arrow-forward" size={12} color={theme.colors.textMuted} />
                      <Text style={styles.breakdownDiscounted}>${g.discounted}</Text>
                      <View style={styles.breakdownSavedBadge}>
                        <Text style={styles.breakdownSavedText}>−${g.saved}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Copy to Week */}
        <TouchableOpacity style={styles.copyBtn} onPress={copyToWeek} activeOpacity={0.7}>
          <Ionicons name="copy-outline" size={18} color={theme.colors.redPrimary} />
          <Text style={styles.copyText}>Copy to next 7 days</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Save Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          disabled={saving}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Slots'}</Text>
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
  headerSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },

  calCard: {
    margin: 20, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  calHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  calMonth: { fontSize: 16, fontWeight: '700', color: '#fff' },
  calWeekdays: { flexDirection: 'row', marginBottom: 8 },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calDay: {
    width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
  },
  calDaySelected: { backgroundColor: theme.colors.redPrimary },
  calDayEmpty: { opacity: 0 },
  calDayText: { fontSize: 14, fontWeight: '500', color: '#fff' },
  calDayTextSel: { fontWeight: '700' },

  slotsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  addSlotBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },

  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 8,
    padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  slotToggle: { width: 28 },
  slotToggleOff: { opacity: 0.5 },
  slotTime: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
  slotTimeOff: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  slotPriceWrap: { flexDirection: 'row', alignItems: 'center' },
  slotDollar: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  slotPriceInput: {
    width: 50, fontSize: 14, fontWeight: '600', color: '#fff',
    paddingVertical: 4, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder,
  },
  slotDelete: { padding: 4 },

  // Discount % field
  discountWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  discountWrapActive: {
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderColor: 'rgba(76,175,80,0.4)',
  },
  discountInput: {
    width: 28, fontSize: 13, fontWeight: '600', color: theme.colors.textMuted,
    paddingVertical: 2, textAlign: 'center',
  },
  discountInputActive: { color: '#4CAF50' },
  discountPercent: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  discountPercentActive: { color: '#4CAF50' },

  // Group breakdown card
  breakdownCard: {
    marginHorizontal: 20, marginBottom: 8, marginTop: -4,
    padding: 12, paddingTop: 10,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(76,175,80,0.06)',
    borderWidth: 1, borderColor: 'rgba(76,175,80,0.2)',
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
  },
  breakdownTitle: {
    fontSize: 11, fontWeight: '700', color: '#4CAF50',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  breakdownPlayers: {
    flexDirection: 'row', alignItems: 'center', gap: 4, width: 80,
  },
  breakdownPlayerText: { fontSize: 12, fontWeight: '500', color: theme.colors.textSecondary },
  breakdownOriginal: {
    fontSize: 12, fontWeight: '500', color: theme.colors.textMuted,
    textDecorationLine: 'line-through', width: 42, textAlign: 'right',
  },
  breakdownDiscounted: {
    fontSize: 13, fontWeight: '700', color: '#4CAF50',
    width: 42, textAlign: 'right',
  },
  breakdownSavedBadge: {
    backgroundColor: 'rgba(76,175,80,0.15)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6,
  },
  breakdownSavedText: { fontSize: 11, fontWeight: '700', color: '#4CAF50' },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 12, paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  copyText: { fontSize: 13, fontWeight: '600', color: theme.colors.redPrimary },

  overflowBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 12,
    padding: 12, borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  overflowBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FFD700' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.95)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  saveBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    ...theme.shadow.red,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
