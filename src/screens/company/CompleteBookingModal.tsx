/**
 * "Complete & verify": marks the booking completed and records how the team
 * did (escaped, time, hints). badges.submitPerformance awards badges from it.
 * Same flow as the website's CompleteBookingModal.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyMutation } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';

export default function CompleteBookingModal({
  companyId, booking, onClose, onDone,
}: {
  companyId: string;
  booking: { _id: string; time?: string; roomTitle?: string; playerName?: string; players?: number; status?: string };
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const completeBooking = useCompanyMutation(api.companies.adminCompleteBooking);
  const submitPerformance = useCompanyMutation(api.badges.submitPerformance);
  const [escaped, setEscaped] = useState(true);
  const [escapeTime, setEscapeTime] = useState('');
  const [hints, setHints] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const cId = companyId as Id<'companies'>;
      const bId = booking._id as Id<'bookings'>;
      if (booking.status !== 'completed') {
        await completeBooking({ companyId: cId, bookingId: bId });
      }
      const minutes = parseInt(escapeTime, 10);
      const hintCount = parseInt(hints, 10);
      await submitPerformance({
        companyId: cId,
        bookingId: bId,
        escaped,
        escapeTimeMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
        hintsUsed: Number.isFinite(hintCount) && hintCount >= 0 ? hintCount : undefined,
      });
      onDone?.();
      onClose();
    } catch (err: any) {
      const data = err?.data;
      setError(typeof data === 'string' && data ? data : t('complete.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={loading ? undefined : onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Ionicons name="ribbon-outline" size={20} color={theme.colors.gold} />
            <Text style={styles.title}>{t('complete.title')}</Text>
            <TouchableOpacity onPress={onClose} disabled={loading} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.colors.bone} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.summary}>
              <Text style={styles.summaryTop}>
                <Text style={{ color: theme.colors.redLight, fontWeight: '800' }}>{booking.time}</Text>  {booking.roomTitle}
              </Text>
              <Text style={styles.summarySub}>
                {booking.playerName}{booking.players ? ` · ${t('complete.players', { n: booking.players })}` : ''}
              </Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>{t('complete.didEscape')}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.choice, escaped && styles.choiceYes]} onPress={() => setEscaped(true)}>
                <Ionicons name="checkmark-circle-outline" size={16} color={escaped ? '#4ADE80' : theme.colors.textSecondary} />
                <Text style={[styles.choiceText, escaped && { color: '#4ADE80' }]}>{t('complete.yes')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choice, !escaped && styles.choiceNo]} onPress={() => setEscaped(false)}>
                <Ionicons name="close-circle-outline" size={16} color={!escaped ? '#F87171' : theme.colors.textSecondary} />
                <Text style={[styles.choiceText, !escaped && { color: '#F87171' }]}>{t('complete.no')}</Text>
              </TouchableOpacity>
            </View>

            {escaped && (
              <>
                <Text style={styles.label}>{t('complete.escapeTime')}</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={escapeTime}
                    onChangeText={setEscapeTime}
                    keyboardType="number-pad"
                    placeholder={t('complete.escapeTimePlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={3}
                  />
                  <Text style={styles.unit}>{t('min')}</Text>
                </View>
              </>
            )}

            <Text style={styles.label}>{t('complete.hints')}</Text>
            <TextInput
              style={styles.input}
              value={hints}
              onChangeText={setHints}
              keyboardType="number-pad"
              placeholder={t('complete.hintsPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              maxLength={2}
            />

            <View style={styles.info}>
              <Ionicons name="information-circle-outline" size={16} color={theme.colors.gold} />
              <Text style={styles.infoText}>{t('complete.badgeInfo')}</Text>
            </View>

            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} disabled={loading} onPress={submit}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="ribbon" size={16} color="#fff" />}
              <Text style={styles.btnText}>{t('complete.submit')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%', padding: 20, paddingBottom: 36, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.bone },
  summary: { padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.bgPrimary, marginBottom: 14 },
  summaryTop: { fontSize: 14, color: theme.colors.bone, fontWeight: '600' },
  summarySub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3 },
  error: { fontSize: 13, color: '#FF8A80', marginBottom: 12 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  choice: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: theme.colors.bgPrimary,
  },
  choiceYes: { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' },
  choiceNo: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' },
  choiceText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  input: {
    backgroundColor: theme.colors.bgPrimary, borderWidth: 1, borderColor: theme.colors.glassBorder, marginBottom: 14,
    borderRadius: theme.radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.colors.bone, fontSize: 15,
  },
  unit: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 14 },
  info: {
    flexDirection: 'row', gap: 8, padding: 12, borderRadius: theme.radius.md, marginBottom: 16,
    backgroundColor: 'rgba(201,154,46,0.08)', borderWidth: 1, borderColor: 'rgba(201,154,46,0.2)',
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.redPrimary, paddingVertical: 14, borderRadius: theme.radius.full,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
