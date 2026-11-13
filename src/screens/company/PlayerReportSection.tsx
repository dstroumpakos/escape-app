// Business ↔ player reports on the company booking screen.
//  • PlayerFlagCard: other businesses' reports about the player of an upcoming booking.
//  • ReportPlayerCard: report the player (24h after the game, fixed categories only).
// The server never returns which business filed a report.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCompanyMutation, useCompanyQuery } from '../../companySession';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { PLAYER_REPORT_CATEGORIES, type PlayerReportCategory } from '../../../convex/reportRules';
import { reportErrorText } from '../reports/reportErrors';

const AMBER = '#FFB74D';

export function PlayerFlagCard({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
  const flags = useCompanyQuery(api.reports.flagsForBookings, { bookingIds: [bookingId as Id<'bookings'>] });
  const flag = flags?.[0];
  if (!flag) return null;
  const cats = PLAYER_REPORT_CATEGORIES.filter((c) => flag.categories[c]);

  return (
    <View style={[styles.card, styles.flagCard]}>
      <View style={styles.titleRow}>
        <Ionicons name="warning-outline" size={18} color={AMBER} />
        <Text style={styles.flagTitle}>
          {flag.count === 1 ? t('reports.flag.titleOne') : t('reports.flag.titleMany', { count: flag.count })}
        </Text>
      </View>
      <View style={styles.chips}>
        {cats.map((c) => (
          <View key={c} style={styles.chip}>
            <Text style={styles.chipText}>
              {t(`reports.cat.${c}`)}
              {flag.categories[c]! > 1 ? ` ×${flag.categories[c]}` : ''}
            </Text>
          </View>
        ))}
      </View>
      {flag.replies.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={styles.muted}>{t('reports.flag.playerReplied')}</Text>
          {flag.replies.map((r, i) => (
            <Text key={i} style={styles.reply}>{r}</Text>
          ))}
        </View>
      )}
      <Text style={[styles.muted, { marginTop: 8 }]}>{t('reports.flag.note')}</Text>
    </View>
  );
}

export function ReportPlayerCard({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
  const status = useCompanyQuery(api.reports.companyReportStatus, { bookingId: bookingId as Id<'bookings'> });
  const reportPlayer = useCompanyMutation(api.reports.reportPlayer);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PlayerReportCategory[]>([]);
  const [saving, setSaving] = useState(false);

  if (!status) return null;

  if (status.existing) {
    return (
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Ionicons name="flag-outline" size={16} color={theme.colors.redPrimary} />
          <Text style={styles.cardTitle}>
            {status.existing.voided ? t('reports.company.voided') : t('reports.company.reported')}
          </Text>
        </View>
        <Text style={styles.muted}>{status.existing.categories.map((c) => t(`reports.cat.${c}`)).join(' · ')}</Text>
      </View>
    );
  }
  if (status.block === 'no_player' || status.block === 'not_started' || status.block === 'cancelled') return null;
  if (status.block === 'window_closed') {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>{t('reports.company.windowClosed')}</Text>
      </View>
    );
  }

  const deadline = new Date(status.deadline);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const sameDay = deadline.toDateString() === new Date().toDateString();
  const deadlineLabel = `${sameDay ? '' : `${pad(deadline.getDate())}/${pad(deadline.getMonth() + 1)} `}${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`;

  if (!open) {
    return (
      <View style={styles.card}>
        <TouchableOpacity style={styles.actionRow} onPress={() => setOpen(true)}>
          <Ionicons name="flag-outline" size={18} color={theme.colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.actionText}>{t('reports.company.button')}</Text>
            <Text style={styles.muted}>{t('reports.company.until', { time: deadlineLabel })}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  const toggle = (c: PlayerReportCategory) =>
    setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const submit = () => {
    Alert.alert(t('reports.company.title'), t('reports.company.confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('reports.company.submit'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await reportPlayer({ bookingId: bookingId as Id<'bookings'>, categories: picked });
            setOpen(false);
            Alert.alert(t('done'), t('reports.company.sent'));
          } catch (e) {
            Alert.alert(t('error'), reportErrorText(e, t));
          }
          setSaving(false);
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('reports.company.title')}</Text>
      <Text style={[styles.muted, { marginBottom: 10 }]}>{t('reports.company.help')}</Text>
      {PLAYER_REPORT_CATEGORIES.map((c) => {
        const on = picked.includes(c);
        return (
          <TouchableOpacity
            key={c}
            style={[styles.option, on && styles.optionOn]}
            onPress={() => toggle(c)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? theme.colors.redPrimary : theme.colors.textMuted} />
            <Text style={styles.optionText}>{t(`reports.cat.${c}`)}</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={[styles.muted, { marginTop: 6 }]}>{t('reports.company.privacy')}</Text>
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { setOpen(false); setPicked([]); }}>
          <Text style={styles.btnGhostText}>{t('cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, (picked.length === 0 || saving) && { opacity: 0.4 }]}
          disabled={picked.length === 0 || saving}
          onPress={submit}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('reports.company.submit')}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20, marginBottom: 12, padding: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  flagCard: { borderColor: 'rgba(255,183,77,0.4)', backgroundColor: 'rgba(255,183,77,0.08)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  flagTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: AMBER },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,183,77,0.15)' },
  chipText: { fontSize: 12, color: '#FFE0B2' },
  muted: { fontSize: 12, color: theme.colors.textMuted },
  reply: {
    fontSize: 13, color: '#fff', fontStyle: 'italic', marginTop: 4,
    paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: 'rgba(255,183,77,0.4)',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionText: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  optionOn: { borderColor: theme.colors.redPrimary, backgroundColor: 'rgba(229,57,53,0.1)' },
  optionText: { flex: 1, fontSize: 14, color: '#fff' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1, paddingVertical: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.redPrimary, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnGhost: { backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  btnGhostText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
});
