/**
 * Dashboard checklist that walks a new business to its first bookable room.
 * Same five steps as the website dashboard. Hides itself once everything is
 * done, or when the business hides it (remembered on this device).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Clipboard, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { CHECKLIST_DISMISSED, WIDGET_COPIED, readFlag, setFlag, widgetCode } from './companyFlags';

export default function GettingStartedChecklist({
  companyId, company, rooms,
}: {
  companyId: string;
  company: any;
  rooms: any[] | undefined;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [dismissed, setDismissed] = useState(true);
  const [widgetCopied, setWidgetCopied] = useState(false);

  // Re-read on focus: the widget may have been copied from Settings meanwhile.
  useFocusEffect(
    useCallback(() => {
      readFlag(CHECKLIST_DISMISSED).then(setDismissed);
      readFlag(WIDGET_COPIED).then(setWidgetCopied);
    }, [])
  );

  if (!company || rooms === undefined || dismissed) return null;

  const realRooms = rooms.filter((r: any) => !r.photosOnly);
  const firstRoom = realRooms[0];
  const openRoom = () => navigation.navigate('CompanyRoomEditor', firstRoom ? { roomId: firstRoom._id } : {});

  const shareWidget = () => {
    Alert.alert(t('start.widget'), t('start.widgetDesc'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('settings.copy'),
        onPress: () => {
          Clipboard.setString(widgetCode(companyId));
          setFlag(WIDGET_COPIED);
          setWidgetCopied(true);
        },
      },
      {
        text: t('settings.emailDeveloper'),
        onPress: () => {
          setFlag(WIDGET_COPIED);
          setWidgetCopied(true);
          const subject = encodeURIComponent(t('settings.devMailSubject'));
          const body = encodeURIComponent(`${t('settings.devMailBody')}\n\n${widgetCode(companyId)}`);
          Linking.openURL(`mailto:?subject=${subject}&body=${body}`).catch(() => {});
        },
      },
    ]);
  };

  const steps = [
    {
      done: !!(company.phone && company.address && company.city && company.description),
      label: t('start.profile'), desc: t('start.profileDesc'), icon: 'business-outline' as const,
      action: () => navigation.navigate('Settings'),
    },
    {
      done: realRooms.length > 0,
      label: t('start.room'), desc: t('start.roomDesc'), icon: 'key-outline' as const,
      action: () => navigation.navigate('CompanyRoomEditor', {}),
    },
    {
      done: realRooms.some((r: any) => r.image && !String(r.image).startsWith('/placeholder')),
      label: t('start.photo'), desc: t('start.photoDesc'), icon: 'image-outline' as const,
      action: openRoom,
    },
    {
      done: realRooms.some((r: any) => (r.defaultTimeSlots || []).length > 0),
      label: t('start.times'), desc: t('start.timesDesc'), icon: 'time-outline' as const,
      action: openRoom,
    },
    {
      done: widgetCopied,
      label: t('start.widget'), desc: t('start.widgetDesc'), icon: 'code-slash-outline' as const,
      action: shareWidget,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="rocket-outline" size={16} color={theme.colors.redLight} />
            <Text style={styles.title}>{t('start.title')}</Text>
          </View>
          <Text style={styles.progressText}>{t('start.progress', { done: doneCount, total: steps.length })}</Text>
        </View>
        <TouchableOpacity
          hitSlop={10}
          accessibilityLabel={t('start.hide')}
          onPress={() => {
            setFlag(CHECKLIST_DISMISSED);
            setDismissed(true);
          }}
        >
          <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${(doneCount / steps.length) * 100}%` }]} />
      </View>

      {steps.map((s, i) => {
        const isNext = i === nextIndex;
        return (
          <TouchableOpacity
            key={s.label}
            style={[styles.step, isNext && styles.stepNext]}
            disabled={s.done}
            onPress={s.action}
          >
            <View style={[styles.stepIcon, s.done && styles.stepIconDone]}>
              <Ionicons name={s.done ? 'checkmark' : s.icon} size={16} color={s.done ? theme.colors.success : isNext ? theme.colors.redLight : theme.colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepLabel, s.done && styles.stepLabelDone]}>{s.label}</Text>
              {!s.done && <Text style={styles.stepDesc}>{s.desc}</Text>}
            </View>
            {!s.done && <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20, marginBottom: 20, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: 'rgba(212,20,31,0.3)',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: theme.colors.bone },
  progressText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3 },
  bar: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 12, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: theme.colors.redPrimary, borderRadius: 3 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: theme.radius.md },
  stepNext: { backgroundColor: theme.colors.redSubtle },
  stepIcon: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  stepIconDone: { backgroundColor: 'rgba(76,175,80,0.15)' },
  stepLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.bone },
  stepLabelDone: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  stepDesc: { fontSize: 12, lineHeight: 16, color: theme.colors.textSecondary, marginTop: 2 },
});
