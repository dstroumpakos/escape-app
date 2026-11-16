// Cancel a booking with a reason (required) and an optional note.
// Used by players (Tickets) and businesses (booking detail); the caller passes
// the reasons that side may pick and any late-cancellation warning.
// Same rules as the website, see convex/cancelRules.ts.

import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { CANCEL_NOTE_MAX_CHARS, type CancelReason } from '../../convex/cancelRules';

const AMBER = '#FFB74D';

export default function CancelReasonModal({
  visible,
  title,
  subtitle,
  reasons,
  warning,
  reasonHint,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  reasons: readonly CancelReason[];
  /** Lines shown in an amber box above the reasons, e.g. the late-cancellation warning. */
  warning?: string[];
  /** Extra line shown under the reasons once one is picked. */
  reasonHint?: (reason: CancelReason) => string | null;
  /** Throw to keep the sheet open and show the error. */
  onConfirm: (reason: CancelReason, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start clean every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setNote('');
      setError(null);
      setSaving(false);
    }
  }, [visible]);

  const submit = async () => {
    if (!reason) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason, note);
    } catch (e: any) {
      setError(e?.data || e?.message || t('cancelReason.failed'));
      setSaving(false);
    }
  };

  const hint = reason && reasonHint ? reasonHint(reason) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !saving && onClose()}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            disabled={saving}
            style={styles.closeBtn}
            accessibilityLabel={t('cancelReason.close')}
          >
            <Ionicons name="close" size={22} color={theme.colors.bone} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {!!subtitle && <Text style={styles.sub}>{subtitle}</Text>}

          {!!warning?.length && (
            <View style={styles.warning}>
              <Ionicons name="warning-outline" size={18} color={AMBER} />
              <View style={{ flex: 1, gap: 4 }}>
                {warning.map((line, i) => (
                  <Text key={i} style={[styles.warningText, i === 0 && { fontWeight: '700' }]}>{line}</Text>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.label}>{t('cancelReason.pick')}</Text>
          {reasons.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.option, reason === r && styles.optionOn]}
              onPress={() => setReason(r)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === r }}
            >
              <Ionicons
                name={reason === r ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={reason === r ? theme.colors.redPrimary : theme.colors.textMuted}
              />
              <Text style={styles.optionText}>{t(`cancelReason.reason.${r}`)}</Text>
            </TouchableOpacity>
          ))}

          {!!hint && <Text style={styles.hint}>{hint}</Text>}

          <TextInput
            style={styles.input}
            value={note}
            onChangeText={(v) => setNote(v.slice(0, CANCEL_NOTE_MAX_CHARS))}
            placeholder={t('cancelReason.notePlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <Text style={[styles.muted, { textAlign: 'right' }]}>{note.length}/{CANCEL_NOTE_MAX_CHARS}</Text>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submit, (!reason || saving) && { opacity: 0.4 }]}
            disabled={!reason || saving}
            onPress={submit}
          >
            {saving ? <ActivityIndicator color={theme.colors.bone} /> : <Text style={styles.submitText}>{t('cancelReason.confirm')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.keep} disabled={saving} onPress={onClose}>
            <Text style={styles.keepText}>{t('cancelReason.keep')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 20, paddingHorizontal: 20, paddingBottom: 8,
  },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: theme.fonts.display, color: theme.colors.bone },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass,
  },
  sub: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 16 },
  warning: {
    flexDirection: 'row', gap: 10, padding: 12, marginBottom: 16,
    borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.4)', backgroundColor: 'rgba(255,183,77,0.08)',
  },
  warningText: { fontSize: 13, color: '#FFE0B2' },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.bone, marginBottom: 8 },
  muted: { fontSize: 12, color: theme.colors.textMuted },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder,
    backgroundColor: theme.colors.bgCardSolid,
  },
  optionOn: { borderColor: theme.colors.redPrimary },
  optionText: { flex: 1, fontSize: 14, color: theme.colors.bone },
  hint: { fontSize: 12, color: AMBER, marginTop: 4, marginBottom: 8 },
  input: {
    minHeight: 80, marginTop: 12, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: theme.colors.bone, fontSize: 14, textAlignVertical: 'top',
  },
  error: { fontSize: 13, color: '#F44336', marginTop: 8 },
  submit: {
    marginTop: 16, paddingVertical: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '700', color: theme.colors.bone },
  keep: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  keepText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
});
