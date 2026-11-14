/**
 * Which booking alerts this phone shows for the business account.
 * Stored on the device (the alerts are local notifications raised by
 * useNotificationWatcher), so each staff phone can choose its own.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';

export const COMPANY_NOTIF_PREF_KEY = '@company_notification_preferences';

export interface CompanyNotifPrefs {
  newBookings: boolean;
  cancellations: boolean;
}

export const DEFAULT_COMPANY_NOTIF_PREFS: CompanyNotifPrefs = {
  newBookings: true,
  cancellations: true,
};

export async function loadCompanyNotifPrefs(): Promise<CompanyNotifPrefs> {
  try {
    const stored = await AsyncStorage.getItem(COMPANY_NOTIF_PREF_KEY);
    if (stored) return { ...DEFAULT_COMPANY_NOTIF_PREFS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_COMPANY_NOTIF_PREFS;
}

export default function CompanyNotificationPrefs({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<CompanyNotifPrefs>(DEFAULT_COMPANY_NOTIF_PREFS);

  useEffect(() => {
    loadCompanyNotifPrefs().then(setPrefs);
  }, []);

  const update = (key: keyof CompanyNotifPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    AsyncStorage.setItem(COMPANY_NOTIF_PREF_KEY, JSON.stringify(next)).catch(() => {});
  };

  const items: { key: keyof CompanyNotifPrefs; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'newBookings', label: t('companyNotif.newBookings'), desc: t('companyNotif.newBookingsDesc'), icon: 'calendar-outline' },
    { key: 'cancellations', label: t('companyNotif.cancellations'), desc: t('companyNotif.cancellationsDesc'), icon: 'close-circle-outline' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.notifPrefs')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Text style={styles.intro}>{t('companyNotif.intro')}</Text>

        <View style={styles.card}>
          {items.map((item, i) => (
            <View key={item.key} style={[styles.row, i > 0 && styles.rowBorder]}>
              <Ionicons name={item.icon} size={20} color={theme.colors.redLight} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.desc}>{item.desc}</Text>
              </View>
              <Switch
                value={prefs[item.key]}
                onValueChange={(v) => update(item.key, v)}
                trackColor={{ false: theme.colors.glassBorder, true: theme.colors.redPrimary }}
                thumbColor={theme.colors.bone}
              />
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.desc}>{t('companyNotif.emailNote')}</Text>
        </View>

        <TouchableOpacity
          style={styles.systemBtn}
          onPress={() => (Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings()).catch(() => {})}
        >
          <Ionicons name="settings-outline" size={18} color={theme.colors.bone} />
          <Text style={styles.systemBtnText}>{t('companyNotif.systemSettings')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontFamily: theme.fonts.display, color: theme.colors.bone, flex: 1 },
  intro: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary, marginHorizontal: 20, marginBottom: 16 },
  card: {
    marginHorizontal: 20, marginBottom: 16, padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.glassBorder },
  label: { fontSize: 15, fontWeight: '600', color: theme.colors.bone },
  desc: { fontSize: 12, lineHeight: 17, color: theme.colors.textSecondary, marginTop: 2 },
  systemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 20,
    paddingVertical: 13, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  systemBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.bone },
});
