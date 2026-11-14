/**
 * Player settings (the gear on the Profile tab): account, preferences,
 * payments & Premium, privacy, help, about, sign out and account deletion.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from 'convex/react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { theme } from '../theme';
import { useUser } from '../UserContext';
import { useTranslation } from '../i18n';
import EditProfileModal from './EditProfileModal';

const SUPPORT_EMAIL = 'hello@unlocked.gr';
const MANAGE_SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

type IconName = keyof typeof Ionicons.glyphMap;

function Row({
  icon, label, value, onPress, danger, last,
}: {
  icon: IconName; label: string; value?: string; onPress?: () => void; danger?: boolean; last?: boolean;
}) {
  const color = danger ? '#FF5A5A' : theme.colors.textSecondary;
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.rowLabel, danger && { color: '#FF5A5A' }]}>{label}</Text>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={17} color={theme.colors.textMuted} /> : null}
    </TouchableOpacity>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.card}>{children}</View>
  </>
);

export default function PlayerSettings() {
  const navigation = useNavigation<any>();
  const { userId, onLogout } = useUser();
  const { t, language, setLanguage } = useTranslation();
  const [editVisible, setEditVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const user = useQuery(api.users.getById, userId ? { userId: userId as Id<'users'> } : 'skip');
  const premium = useQuery(api.premium.getStatus, userId ? { userId: userId as Id<'users'> } : 'skip');
  const deleteAccount = useMutation(api.users.deleteAccount);

  const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert(t('error'), url));
  const openSystemSettings = () => Linking.openSettings().catch(() => {});

  const appVersion = Constants.expoConfig?.version ?? '';
  const updateLabel = Updates.isEmbeddedLaunch || !Updates.updateId
    ? t('playerSettings.builtIn')
    : Updates.updateId.slice(0, 8);

  const confirmSignOut = () =>
    Alert.alert(t('profile.signOutConfirmTitle'), t('profile.signOutConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: () => onLogout() },
    ]);

  const confirmDelete = () =>
    Alert.alert(t('profile.deleteAccountTitle'), t('profile.deleteAccountMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('profile.deleteAccountConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true);
            await deleteAccount({ userId: userId as Id<'users'> });
            await AsyncStorage.clear();
            onLogout();
          } catch (e: any) {
            Alert.alert(t('error'), e?.message || t('playerSettings.deleteFailed'));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);

  const u = user as any;
  const signInMethod = u?.appleId ? 'Apple' : t('playerSettings.emailPassword');
  const premiumUntil = premium?.isPremium && premium.premiumExpiresAt
    ? new Date(premium.premiumExpiresAt).toLocaleDateString(language === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.settingsTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Account */}
        <Section title={t('playerSettings.account')}>
          <Row icon="person-outline" label={t('playerSettings.name')} value={u?.name ?? ''} />
          <Row icon="mail-outline" label={t('playerSettings.email')} value={u?.email ?? ''} />
          <Row icon="key-outline" label={t('playerSettings.signInMethod')} value={signInMethod} />
          <Row icon="create-outline" label={t('profile.editProfile')} onPress={() => setEditVisible(true)} last />
        </Section>

        {/* Preferences */}
        <Section title={t('playerSettings.preferences')}>
          <View style={[styles.row, styles.rowBorder]}>
            <Ionicons name="language-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.rowLabel}>{t('playerSettings.language')}</Text>
            <View style={styles.segment}>
              {(['en', 'el'] as const).map((l) => (
                <TouchableOpacity
                  key={l}
                  style={[styles.segItem, language === l && styles.segActive]}
                  onPress={() => setLanguage(l)}
                >
                  <Text style={[styles.segText, language === l && { color: '#fff' }]}>{l === 'en' ? 'English' : 'Ελληνικά'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Row icon="notifications-outline" label={t('profile.notifications')} onPress={() => navigation.navigate('NotificationPrefs')} />
          <Row icon="location-outline" label={t('playerSettings.location')} value={t('playerSettings.phoneSettings')} onPress={openSystemSettings} last />
        </Section>

        {/* Payments & Premium */}
        <Section title={t('playerSettings.payments')}>
          <View style={[styles.infoBox, styles.rowBorder]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.success} />
            <Text style={styles.infoText}>{t('playerSettings.paymentsInfo')}</Text>
          </View>
          <Row
            icon="diamond-outline"
            label="UNLOCKED Premium"
            value={premium?.isPremium ? t('playerSettings.premiumUntil', { date: premiumUntil }) : t('playerSettings.premiumOff')}
            onPress={() => navigation.navigate('Premium')}
          />
          <Row icon="card-outline" label={t('playerSettings.manageSubscription')} onPress={() => open(MANAGE_SUBSCRIPTIONS_URL)} />
          <Row icon="refresh-outline" label={t('playerSettings.restorePurchases')} onPress={() => navigation.navigate('Premium')} last />
        </Section>

        {/* Privacy & legal */}
        <Section title={t('playerSettings.privacy')}>
          <Row icon="shield-outline" label={t('profile.privacyPolicy')} onPress={() => navigation.navigate('PrivacyPolicy')} />
          <Row icon="document-text-outline" label={t('profile.termsOfService')} onPress={() => navigation.navigate('TermsOfService')} last />
        </Section>

        {/* Help */}
        <Section title={t('playerSettings.help')}>
          <Row icon="mail-open-outline" label={t('profile.helpSupport')} value={SUPPORT_EMAIL} onPress={() => open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('UNLOCKED app')}`)} />
          <Row icon="globe-outline" label={t('playerSettings.website')} value="unlocked.gr" onPress={() => open('https://unlocked.gr')} last />
        </Section>

        {/* About */}
        <Section title={t('playerSettings.about')}>
          <Row icon="information-circle-outline" label={t('playerSettings.version')} value={appVersion} />
          <Row icon="cloud-download-outline" label={t('playerSettings.update')} value={updateLabel} last />
        </Section>

        {/* Account actions */}
        <View style={[styles.card, { marginTop: 24 }]}>
          <Row icon="log-out-outline" label={t('profile.signOut')} onPress={confirmSignOut} />
          <Row icon="trash-outline" label={t('profile.deleteAccount')} onPress={deleting ? undefined : confirmDelete} danger last />
        </View>
        {deleting && <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 12 }} />}
      </ScrollView>

      {u && (
        <EditProfileModal
          visible={editVisible}
          onClose={() => setEditVisible(false)}
          userId={userId as string}
          currentName={u.name}
          currentAvatar={u.avatar}
          currentPhone={u.phone}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontFamily: theme.fonts.display, color: theme.colors.bone, flex: 1 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase',
    color: theme.colors.textMuted, marginHorizontal: 24, marginTop: 22, marginBottom: 8,
  },
  card: {
    marginHorizontal: 20, paddingHorizontal: 14, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.glassBorder },
  rowLabel: { fontSize: 15, color: theme.colors.bone, flexShrink: 0 },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 13, color: theme.colors.textSecondary },
  segment: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  segItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.md, backgroundColor: 'rgba(255,255,255,0.05)' },
  segActive: { backgroundColor: theme.colors.redPrimary },
  segText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  infoBox: { flexDirection: 'row', gap: 10, paddingVertical: 14, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
});
