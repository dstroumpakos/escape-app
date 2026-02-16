// PHASE 2: Add Booking / Block Slot
// Allows company admins to create UNLOCKED bookings manually or
// block slots with external bookings (EscapeAll, Phone, Walk-in, Private Event).
// Respects existing bookings to prevent double-booking.

import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';
import { useTranslation } from '../../i18n';

type RouteType = RouteProp<RootStackParamList, 'CompanyAddBooking'>;

const EXTERNAL_SOURCES = ['EscapeAll', 'Phone', 'Walk-in', 'Private Event'];

export default function CompanyAddBooking() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { companyId, roomId: preselectedRoom, date: preselectedDate, time: preselectedTime } = route.params;
  const { t } = useTranslation();
  const sourceLabels: Record<string, string> = {
    'EscapeAll': t('addBooking.escapeAll'),
    'Phone': t('addBooking.phone'),
    'Walk-in': t('addBooking.walkIn'),
    'Private Event': t('addBooking.privateEvent'),
  };

  const rooms = useQuery(api.companies.getRooms, {
    companyId: companyId as Id<"companies">,
  });

  const [bookingType, setBookingType] = useState<'unlocked' | 'external'>('unlocked');
  const [selectedRoom, setSelectedRoom] = useState<string>(preselectedRoom || '');
  const [date, setDate] = useState(preselectedDate || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(preselectedTime || '');
  const [playerName, setPlayerName] = useState('');
  const [playerContact, setPlayerContact] = useState('');
  const [players, setPlayers] = useState('2');
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [externalSource, setExternalSource] = useState('EscapeAll');
  const [saving, setSaving] = useState(false);

  // Pre-select room if provided
  useEffect(() => {
    if (preselectedRoom) setSelectedRoom(preselectedRoom);
  }, [preselectedRoom]);

  // Load time slots for selected room + date
  const slots = useQuery(
    api.companies.getRoomSlots,
    selectedRoom
      ? { roomId: selectedRoom as Id<"rooms">, date }
      : 'skip'
  );

  // Load existing bookings for selected room + date (to show conflicts)
  const existingBookings = useQuery(
    api.companies.getBookingsByDate,
    { companyId: companyId as Id<"companies">, date }
  );

  const createAdminBooking = useMutation(api.companies.createAdminBooking);
  const createExternalBlock = useMutation(api.companies.createExternalBlock);

  // Filter to available slots (not already booked)
  const availableSlots = useMemo(() => {
    if (!slots) return [];
    const bookedTimes = new Set(
      (existingBookings || [])
        .filter((b: any) => String(b.roomId) === selectedRoom && b.status !== 'cancelled')
        .map((b: any) => b.time)
    );
    return slots
      .filter((s: any) => s.available)
      .map((s: any) => ({
        ...s,
        isBooked: bookedTimes.has(s.time),
      }));
  }, [slots, existingBookings, selectedRoom]);

  const activeRooms = useMemo(
    () => (rooms || []).filter((r: any) => r.isActive !== false),
    [rooms]
  );

  const handleSave = async () => {
    if (!selectedRoom) { Alert.alert(t('error'), t('addBooking.selectRoom')); return; }
    if (!date.trim()) { Alert.alert(t('error'), t('addBooking.enterDate')); return; }
    if (!time.trim()) { Alert.alert(t('error'), t('addBooking.selectTime')); return; }
    if (bookingType === 'unlocked' && !playerName.trim()) {
      Alert.alert(t('error'), t('addBooking.enterName')); return;
    }

    setSaving(true);
    try {
      if (bookingType === 'unlocked') {
        const result = await createAdminBooking({
          companyId: companyId as Id<"companies">,
          roomId: selectedRoom as Id<"rooms">,
          date: date.trim(),
          time: time.trim(),
          players: parseInt(players) || 2,
          playerName: playerName.trim(),
          playerContact: playerContact.trim() || undefined,
          notes: notes.trim() || undefined,
          total: parseFloat(total) || 0,
        });
        Alert.alert(t('addBooking.bookingCreated'), t('addBooking.codeMessage', { code: result.bookingCode }), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
      } else {
        const result = await createExternalBlock({
          companyId: companyId as Id<"companies">,
          roomId: selectedRoom as Id<"rooms">,
          date: date.trim(),
          time: time.trim(),
          externalSource,
          playerName: playerName.trim() || undefined,
          players: parseInt(players) || undefined,
          notes: notes.trim() || undefined,
        });
        Alert.alert(t('addBooking.slotBlocked'), t('addBooking.externalCode', { code: result.bookingCode }), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      Alert.alert(t('error'), e.message || t('addBooking.createFailed'));
    }
    setSaving(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('addBooking.title')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Booking Type Toggle */}
        <View style={styles.typeToggle}>
          <TouchableOpacity
            style={[styles.typeBtn, bookingType === 'unlocked' && styles.typeBtnActive]}
            onPress={() => setBookingType('unlocked')}
          >
            <Ionicons name="lock-closed" size={16} color={bookingType === 'unlocked' ? '#fff' : theme.colors.textMuted} />
            <Text style={[styles.typeBtnText, bookingType === 'unlocked' && styles.typeBtnTextActive]}>
              {t('addBooking.unlockedBooking')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, bookingType === 'external' && styles.typeBtnActiveExt]}
            onPress={() => setBookingType('external')}
          >
            <Ionicons name="globe-outline" size={16} color={bookingType === 'external' ? '#fff' : theme.colors.textMuted} />
            <Text style={[styles.typeBtnText, bookingType === 'external' && styles.typeBtnTextActive]}>
              {t('addBooking.externalBlock')}
            </Text>
          </TouchableOpacity>
        </View>

        {bookingType === 'external' && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#FFA726" />
            <Text style={styles.infoBoxText}>
              {t('addBooking.externalInfo')}
            </Text>
          </View>
        )}

        {/* External Source */}
        {bookingType === 'external' && (
          <>
            <Text style={styles.label}>{t('addBooking.source')}</Text>
            <View style={styles.sourceRow}>
              {EXTERNAL_SOURCES.map((src) => (
                <TouchableOpacity
                  key={src}
                  style={[styles.sourceChip, externalSource === src && styles.sourceChipActive]}
                  onPress={() => setExternalSource(src)}
                >
                  <Text style={[styles.sourceChipText, externalSource === src && styles.sourceChipTextActive]}>
                    {sourceLabels[src] || src}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Room Selection */}
        <Text style={styles.label}>{t('addBooking.room')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomScroll}>
          {activeRooms.map((room: any) => (
            <TouchableOpacity
              key={room._id}
              style={[styles.roomCard, selectedRoom === room._id && styles.roomCardActive]}
              onPress={() => setSelectedRoom(room._id)}
            >
              <Text style={[styles.roomCardTitle, selectedRoom === room._id && styles.roomCardTitleActive]} numberOfLines={1}>
                {room.title}
              </Text>
              <Text style={styles.roomCardMeta}>{room.pricePerGroup?.length ? `€${Math.min(...room.pricePerGroup.map((g: any) => g.price))}-€${Math.max(...room.pricePerGroup.map((g: any) => g.price))}` : `€${room.price}${t('perPerson')}`}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Date */}
        <Text style={styles.label}>{t('addBooking.date')}</Text>
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder={t('addBooking.datePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
        />

        {/* Time Slot Selection */}
        <Text style={styles.label}>{t('addBooking.time')}</Text>
        {availableSlots.length > 0 ? (
          <View style={styles.slotsGrid}>
            {availableSlots.map((slot: any) => (
              <TouchableOpacity
                key={slot._id}
                style={[
                  styles.slotChip,
                  time === slot.time && styles.slotChipActive,
                  slot.isBooked && styles.slotChipBooked,
                ]}
                disabled={slot.isBooked}
                onPress={() => setTime(slot.time)}
              >
                <Text style={[
                  styles.slotChipText,
                  time === slot.time && styles.slotChipTextActive,
                  slot.isBooked && styles.slotChipTextBooked,
                ]}>
                  {slot.time}
                </Text>
                {slot.isBooked && (
                  <Text style={styles.slotBookedLabel}>{t('booked')}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TextInput
            style={styles.input}
            value={time}
            onChangeText={setTime}
            placeholder={t('addBooking.timePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
          />
        )}

        {/* Player Info */}
        <Text style={styles.label}>
          {bookingType === 'unlocked' ? t('addBooking.playerName') : t('addBooking.nameOptional')}
        </Text>
        <TextInput
          style={styles.input}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder={t('addBooking.namePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
        />

        {bookingType === 'unlocked' && (
          <>
            <Text style={styles.label}>{t('addBooking.contact')}</Text>
            <TextInput
              style={styles.input}
              value={playerContact}
              onChangeText={setPlayerContact}
              placeholder={t('addBooking.contactPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
            />
          </>
        )}

        <View style={styles.rowInputs}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('addBooking.players')}</Text>
            <TextInput
              style={styles.input}
              value={players}
              onChangeText={setPlayers}
              keyboardType="numeric"
              placeholderTextColor={theme.colors.textMuted}
            />
          </View>
          {bookingType === 'unlocked' && (
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('addBooking.totalPrice')}</Text>
              <TextInput
                style={styles.input}
                value={total}
                onChangeText={setTotal}
                keyboardType="decimal-pad"
                placeholder={t('addBooking.totalPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
          )}
        </View>

        <Text style={styles.label}>{t('addBooking.notes')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('addBooking.notesPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />
      </ScrollView>

      {/* Save */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 },
            bookingType === 'external' && { backgroundColor: '#FFA726' }]}
          disabled={saving}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Ionicons
            name={bookingType === 'external' ? 'ban-outline' : 'checkmark-circle'}
            size={18} color="#fff" style={{ marginRight: 8 }}
          />
          <Text style={styles.saveBtnText}>
            {saving
              ? t('saving')
              : bookingType === 'external'
              ? t('addBooking.blockSlot')
              : t('addBooking.createBooking')}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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

  typeToggle: {
    flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 16,
  },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  typeBtnActive: {
    backgroundColor: theme.colors.redPrimary,
    borderColor: theme.colors.redPrimary,
  },
  typeBtnActiveExt: {
    backgroundColor: '#FFA726',
    borderColor: '#FFA726',
  },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  typeBtnTextActive: { color: '#fff' },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 20, marginBottom: 16, padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,167,38,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,167,38,0.3)',
  },
  infoBoxText: { flex: 1, fontSize: 12, color: '#FFA726', lineHeight: 18 },

  label: {
    fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary,
    marginHorizontal: 20, marginBottom: 6, marginTop: 14,
  },
  input: {
    marginHorizontal: 20, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },

  sourceRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, marginBottom: 8,
  },
  sourceChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  sourceChipActive: {
    backgroundColor: 'rgba(255,167,38,0.15)', borderColor: '#FFA726',
  },
  sourceChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  sourceChipTextActive: { color: '#FFA726' },

  roomScroll: { paddingLeft: 20, marginBottom: 8 },
  roomCard: {
    paddingVertical: 14, paddingHorizontal: 18, marginRight: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    minWidth: 120,
  },
  roomCardActive: {
    backgroundColor: theme.colors.redSubtle, borderColor: theme.colors.redPrimary,
  },
  roomCardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  roomCardTitleActive: { color: theme.colors.redPrimary },
  roomCardMeta: { fontSize: 11, color: theme.colors.textMuted },

  slotsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20,
  },
  slotChip: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  slotChipActive: {
    backgroundColor: theme.colors.redSubtle, borderColor: theme.colors.redPrimary,
  },
  slotChipBooked: { opacity: 0.4 },
  slotChipText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  slotChipTextActive: { color: theme.colors.redPrimary },
  slotChipTextBooked: { textDecorationLine: 'line-through' },
  slotBookedLabel: {
    fontSize: 8, fontWeight: '700', color: '#F44336',
    textAlign: 'center', marginTop: 2,
  },

  rowInputs: { flexDirection: 'row', gap: 10, paddingHorizontal: 0 },

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
