// PHASE 2: Booking Detail View
// Shows full booking info with actions (cancel, reschedule, notes).
// Differentiates UNLOCKED vs External bookings in display and actions.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import type { Id } from '../../../convex/_generated/dataModel';

type RouteType = RouteProp<RootStackParamList, 'CompanyBookingDetail'>;

interface Props {
  companyId: string;
}

export default function CompanyBookingDetail({ companyId }: Props) {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { bookingId } = route.params;

  const booking = useQuery(api.companies.getBookingDetail, {
    bookingId: bookingId as Id<"bookings">,
  });

  const cancelBooking = useMutation(api.companies.adminCancelBooking);
  const rescheduleBooking = useMutation(api.companies.adminRescheduleBooking);
  const updateNotes = useMutation(api.companies.updateBookingNotes);

  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  useEffect(() => {
    if (booking?.notes) setNotes(booking.notes);
  }, [booking?.notes]);

  if (!booking) {
    return (
      <View style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.redPrimary} />
        </View>
      </View>
    );
  }

  const isExternal = booking.source === 'external';
  const isCancelled = booking.status === 'cancelled';
  const sourceColor = isExternal
    ? { bg: 'rgba(255,167,38,0.15)', text: '#FFA726' }
    : { bg: 'rgba(76,175,80,0.15)', text: '#4CAF50' };
  const statusColor = isCancelled
    ? { bg: 'rgba(244,67,54,0.15)', text: '#F44336' }
    : booking.status === 'completed'
    ? { bg: 'rgba(100,100,100,0.2)', text: theme.colors.textMuted }
    : { bg: 'rgba(76,175,80,0.15)', text: theme.colors.success };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Booking',
      `Cancel this ${isExternal ? 'external block' : 'booking'}? This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelBooking({
                companyId: companyId as Id<"companies">,
                bookingId: bookingId as Id<"bookings">,
              });
              Alert.alert('Done', 'Booking cancelled.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to cancel.');
            }
          },
        },
      ]
    );
  };

  const handleReschedule = async () => {
    if (!newDate.trim() || !newTime.trim()) {
      Alert.alert('Error', 'Enter both new date (YYYY-MM-DD) and time.');
      return;
    }
    try {
      await rescheduleBooking({
        companyId: companyId as Id<"companies">,
        bookingId: bookingId as Id<"bookings">,
        newDate: newDate.trim(),
        newTime: newTime.trim(),
      });
      Alert.alert('Done', 'Booking rescheduled.');
      setShowReschedule(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reschedule.');
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateNotes({
        companyId: companyId as Id<"companies">,
        bookingId: bookingId as Id<"bookings">,
        notes: notes.trim(),
      });
      Alert.alert('Saved', 'Notes updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save notes.');
    }
    setSavingNotes(false);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Detail</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Source + Status badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: sourceColor.bg }]}>
            <Ionicons
              name={isExternal ? 'globe-outline' : 'lock-closed'}
              size={12}
              color={sourceColor.text}
            />
            <Text style={[styles.badgeText, { color: sourceColor.text }]}>
              {isExternal ? `External — ${booking.externalSource || 'Other'}` : 'UNLOCKED Booking'}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.badgeText, { color: statusColor.text }]}>
              {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
            </Text>
          </View>
        </View>

        {/* Room info */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Room</Text>
          <Text style={styles.cardValueLg}>{booking.roomTitle}</Text>
        </View>

        {/* Date & Time */}
        <View style={styles.row}>
          <View style={[styles.card, { flex: 1 }]}>
            <View style={styles.iconRow}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.redPrimary} />
              <Text style={styles.cardLabel}>Date</Text>
            </View>
            <Text style={styles.cardValue}>{booking.date}</Text>
          </View>
          <View style={[styles.card, { flex: 1 }]}>
            <View style={styles.iconRow}>
              <Ionicons name="time-outline" size={16} color={theme.colors.redPrimary} />
              <Text style={styles.cardLabel}>Time</Text>
            </View>
            <Text style={styles.cardValue}>{booking.time}</Text>
          </View>
        </View>

        {/* Player info */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Player Information</Text>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.infoText}>{booking.playerName}</Text>
          </View>
          {booking.playerContact ? (
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.infoText}>{booking.playerContact}</Text>
            </View>
          ) : null}
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.infoText}>{booking.players} players</Text>
          </View>
        </View>

        {/* Payment — only for UNLOCKED bookings */}
        {!isExternal && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Payment</Text>
            <View style={styles.payRow}>
              <Text style={styles.payTotal}>€{booking.total.toFixed(2)}</Text>
              <View style={[styles.payBadge, {
                backgroundColor: booking.paymentStatus === 'paid'
                  ? 'rgba(76,175,80,0.15)' : 'rgba(255,167,38,0.15)'
              }]}>
                <Text style={[styles.payBadgeText, {
                  color: booking.paymentStatus === 'paid' ? '#4CAF50' : '#FFA726'
                }]}>
                  {(booking.paymentStatus || 'unpaid').toUpperCase()}
                </Text>
              </View>
            </View>
            {(booking.paymentTerms === 'deposit_20' || (Array.isArray(booking.paymentTerms) && booking.paymentTerms.includes('deposit_20'))) && (
              <Text style={styles.payNote}>20% deposit terms</Text>
            )}
            {(booking.paymentTerms === 'pay_on_arrival' || (Array.isArray(booking.paymentTerms) && booking.paymentTerms.includes('pay_on_arrival'))) && (
              <Text style={styles.payNote}>Pay on arrival</Text>
            )}
          </View>
        )}

        {/* Booking code */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Booking Code</Text>
          <Text style={styles.codeText}>{booking.bookingCode}</Text>
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Internal Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add internal notes about this booking..."
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.notesSaveBtn, savingNotes && { opacity: 0.6 }]}
            disabled={savingNotes}
            onPress={handleSaveNotes}
          >
            <Text style={styles.notesSaveText}>
              {savingNotes ? 'Saving...' : 'Save Notes'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Reschedule */}
        {!isCancelled && (
          <View style={styles.card}>
            {!showReschedule ? (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  setShowReschedule(true);
                  setNewDate(booking.date);
                  setNewTime(booking.time);
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={18} color="#42A5F5" />
                <Text style={styles.actionText}>Reschedule</Text>
              </TouchableOpacity>
            ) : (
              <View>
                <Text style={styles.cardLabel}>Reschedule To</Text>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.reschedInput, { flex: 1 }]}
                    value={newDate}
                    onChangeText={setNewDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                  <TextInput
                    style={[styles.reschedInput, { flex: 1 }]}
                    value={newTime}
                    onChangeText={setNewTime}
                    placeholder="3:00 PM"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </View>
                <View style={[styles.row, { marginTop: 8 }]}>
                  <TouchableOpacity
                    style={[styles.reschedBtn, { backgroundColor: theme.colors.glass }]}
                    onPress={() => setShowReschedule(false)}
                  >
                    <Text style={[styles.reschedBtnText, { color: theme.colors.textSecondary }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.reschedBtn} onPress={handleReschedule}>
                    <Text style={styles.reschedBtnText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Cancel button */}
      {!isCancelled && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Ionicons name="close-circle-outline" size={18} color="#F44336" />
            <Text style={styles.cancelText}>Cancel Booking</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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

  badgeRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  card: {
    marginHorizontal: 20, marginBottom: 12, padding: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '600', color: theme.colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  cardValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardValueLg: { fontSize: 20, fontWeight: '800', color: '#fff' },

  row: { flexDirection: 'row', gap: 10 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6,
  },
  infoText: { fontSize: 15, color: '#fff', fontWeight: '500' },

  payRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  payTotal: { fontSize: 24, fontWeight: '800', color: '#fff' },
  payBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  payBadgeText: { fontSize: 11, fontWeight: '700' },
  payNote: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6 },

  codeText: {
    fontSize: 18, fontWeight: '700', color: theme.colors.redPrimary,
    letterSpacing: 2,
  },

  notesInput: {
    minHeight: 80, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14, textAlignVertical: 'top',
  },
  notesSaveBtn: {
    marginTop: 10, paddingVertical: 10, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  notesSaveText: { fontSize: 13, fontWeight: '600', color: theme.colors.redPrimary },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 4,
  },
  actionText: { fontSize: 15, fontWeight: '600', color: '#42A5F5' },

  reschedInput: {
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14,
  },
  reschedBtn: {
    flex: 1, paddingVertical: 10, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.redPrimary, alignItems: 'center',
  },
  reschedBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
    backgroundColor: 'rgba(26,13,13,0.95)',
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: '#F44336',
  },
  cancelText: { fontSize: 16, fontWeight: '700', color: '#F44336' },
});
