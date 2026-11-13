// Reports businesses filed about this player. Renders nothing while the
// player has no active reports. Never shows which business, room or date.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { PLAYER_REPLY_MAX_CHARS } from '../../../convex/reportRules';
import { reportErrorText } from './reportErrors';

const AMBER = '#FFB74D';

export default function ReportsAboutMe({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const standing = useQuery(api.reports.myStanding, { userId: userId as Id<'users'> });
  if (!standing || !standing.active) return null;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="warning-outline" size={18} color={AMBER} />
        <Text style={styles.title}>{t('reports.me.title')}</Text>
      </View>
      <Text style={styles.body}>{t('reports.me.intro')}</Text>
      <Text style={styles.expiry}>
        {standing.gamesRemaining === 1
          ? t('reports.me.expiresOne')
          : t('reports.me.expiresMany', { count: standing.gamesRemaining })}
      </Text>
      {standing.reports.map((r) => (
        <ReportRow key={r._id} userId={userId} report={r} />
      ))}
      <Text style={styles.muted}>{t('reports.me.privacy')}</Text>
    </View>
  );
}

function ReportRow({ userId, report }: { userId: string; report: { _id: string; categories: string[]; reply: string | null } }) {
  const { t } = useTranslation();
  const reply = useMutation(api.reports.replyToReport);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(report.reply ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await reply({ userId: userId as Id<'users'>, reportId: report._id as Id<'playerReports'>, reply: text });
      setEditing(false);
    } catch (e) {
      Alert.alert(t('error'), reportErrorText(e, t));
    }
    setSaving(false);
  };

  return (
    <View style={styles.row}>
      <View style={styles.chips}>
        {report.categories.map((c) => (
          <View key={c} style={styles.chip}>
            <Text style={styles.chipText}>{t(`reports.cat.${c}`)}</Text>
          </View>
        ))}
      </View>
      {editing ? (
        <View>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(v) => setText(v.slice(0, PLAYER_REPLY_MAX_CHARS))}
            placeholder={t('reports.me.replyPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            autoFocus
          />
          <View style={styles.btnRow}>
            <Text style={[styles.muted, { flex: 1 }]}>{text.length}/{PLAYER_REPLY_MAX_CHARS}</Text>
            <TouchableOpacity onPress={() => { setEditing(false); setText(report.reply ?? ''); }} style={styles.btnGhost}>
              <Text style={styles.btnGhostText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={saving} style={styles.btn}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnText}>{t('reports.me.replySave')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : report.reply ? (
        <View>
          <Text style={styles.muted}>{t('reports.me.yourReply')}</Text>
          <Text style={styles.replyText}>{report.reply}</Text>
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.link}>{t('reports.me.replyEdit')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setEditing(true)} style={styles.replyBtn}>
          <Ionicons name="chatbubble-outline" size={14} color={theme.colors.redPrimary} />
          <Text style={styles.link}>{t('reports.me.replyButton')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20, marginBottom: 20, padding: 16,
    borderRadius: theme.radius.lg, borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.4)', backgroundColor: 'rgba(255,183,77,0.06)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '800', color: '#fff' },
  body: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  expiry: { fontSize: 13, color: '#FFE0B2', marginTop: 8, marginBottom: 4 },
  muted: { fontSize: 12, color: theme.colors.textMuted },
  row: {
    marginVertical: 6, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,183,77,0.15)' },
  chipText: { fontSize: 12, color: '#FFE0B2' },
  input: {
    minHeight: 70, padding: 10, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14, textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.md, backgroundColor: theme.colors.redPrimary },
  btnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnGhost: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.md, backgroundColor: theme.colors.glass },
  btnGhostText: { fontSize: 13, color: theme.colors.textSecondary },
  replyText: { fontSize: 14, color: '#fff', marginTop: 2 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { fontSize: 13, fontWeight: '600', color: theme.colors.redPrimary, marginTop: 4 },
});
