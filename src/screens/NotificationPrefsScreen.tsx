import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

const PREF_KEY = '@notification_preferences';

interface NotifPrefs {
  bookingConfirmations: boolean;
  bookingReminders: boolean;
  newRooms: boolean;
  promotions: boolean;
  slotAlerts: boolean;
  systemUpdates: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  bookingConfirmations: true,
  bookingReminders: true,
  newRooms: true,
  promotions: false, // Apple 4.5.4 — promo notifications require explicit opt-in
  slotAlerts: true,
  systemUpdates: true,
};

export default function NotificationPrefsScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY).then((stored) => {
      if (stored) {
        try {
          setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) });
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const updatePref = (key: keyof NotifPrefs, value: boolean) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    AsyncStorage.setItem(PREF_KEY, JSON.stringify(updated));
  };

  const sections = [
    {
      title: t('notifPrefs.bookingSection'),
      items: [
        { key: 'bookingConfirmations' as const, label: t('notifPrefs.bookingConfirmations'), desc: t('notifPrefs.bookingConfirmationsDesc') },
        { key: 'bookingReminders' as const, label: t('notifPrefs.bookingReminders'), desc: t('notifPrefs.bookingRemindersDesc') },
      ],
    },
    {
      title: t('notifPrefs.discoverySection'),
      items: [
        { key: 'newRooms' as const, label: t('notifPrefs.newRooms'), desc: t('notifPrefs.newRoomsDesc') },
        { key: 'slotAlerts' as const, label: t('notifPrefs.slotAlerts'), desc: t('notifPrefs.slotAlertsDesc') },
      ],
    },
    {
      title: t('notifPrefs.marketingSection'),
      items: [
        { key: 'promotions' as const, label: t('notifPrefs.promotions'), desc: t('notifPrefs.promotionsDesc') },
      ],
    },
    {
      title: t('notifPrefs.generalSection'),
      items: [
        { key: 'systemUpdates' as const, label: t('notifPrefs.systemUpdates'), desc: t('notifPrefs.systemUpdatesDesc') },
      ],
    },
  ];

  if (!loaded) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifPrefs.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <Text style={styles.topNote}>{t('notifPrefs.description')}</Text>

        {sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => (
              <View key={item.key} style={styles.prefRow}>
                <View style={styles.prefInfo}>
                  <Text style={styles.prefLabel}>{item.label}</Text>
                  <Text style={styles.prefDesc}>{item.desc}</Text>
                </View>
                <Switch
                  value={prefs[item.key]}
                  onValueChange={(val) => updatePref(item.key, val)}
                  trackColor={{ false: theme.colors.glass, true: theme.colors.redPrimary }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
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
  topNote: {
    fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20,
    paddingHorizontal: 20, marginBottom: 20,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: theme.colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 20, marginBottom: 10,
  },
  prefRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  prefInfo: { flex: 1, marginRight: 16 },
  prefLabel: { fontSize: 15, fontWeight: '600', color: '#fff' },
  prefDesc: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
