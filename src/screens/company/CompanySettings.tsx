import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';

interface Props {
  companyId: string;
  onLogout: () => void;
  onSwitchToPlayer?: () => void;
}

export default function CompanySettings({ companyId, onLogout, onSwitchToPlayer }: Props) {
  const company = useQuery(api.companies.getById, { id: companyId as Id<"companies"> });
  const updateProfile = useMutation(api.companies.updateProfile);
  const { t, language, setLanguage } = useTranslation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setPhone(company.phone);
      setAddress(company.address);
      setCity(company.city);
      setVatNumber(company.vatNumber ?? '');
      setDescription(company.description);
    }
  }, [company]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        id: companyId as Id<"companies">,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        vatNumber: vatNumber.trim() || undefined,
        description: description.trim(),
      });
      Alert.alert(t('availability.saved'), t('settings.profileUpdated'));
    } catch {
      Alert.alert(t('error'), t('settings.updateFailed'));
    }
    setSaving(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Company Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Ionicons name="business" size={32} color={theme.colors.redPrimary} />
            </View>
          </View>
          <Text style={styles.companyEmail}>{company?.email ?? ''}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons
              name={
                company?.onboardingStatus === 'approved' ? 'shield-checkmark' :
                company?.onboardingStatus === 'declined' ? 'close-circle' : 'hourglass-outline'
              }
              size={14}
              color={
                company?.onboardingStatus === 'approved' ? theme.colors.success :
                company?.onboardingStatus === 'declined' ? '#F44336' : '#FFA726'
              }
            />
            <Text style={[styles.verifiedText, {
              color: company?.onboardingStatus === 'approved' ? theme.colors.success :
                     company?.onboardingStatus === 'declined' ? '#F44336' : '#FFA726'
            }]}>
              {company?.onboardingStatus === 'approved' ? t('settings.verified') :
               company?.onboardingStatus === 'declined' ? t('settings.declined') :
               company?.onboardingStatus === 'pending_review' ? t('settings.pendingReview') :
               company?.onboardingStatus === 'pending_plan' ? t('settings.pendingPlan') :
               company?.onboardingStatus === 'pending_terms' ? t('settings.pendingTerms') :
               t('settings.pending')}
            </Text>
          </View>
        </View>

        {/* Profile Fields */}
        <Text style={styles.sectionTitle}>{t('settings.companyInfo')}</Text>
        <View style={styles.card}>
          <Text style={styles.label}>{t('settings.companyName')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>{t('settings.phone')}</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>{t('settings.city')}</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>{t('settings.address')}</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>{t('settings.vatNumber')}</Text>
          <TextInput
            style={styles.input}
            value={vatNumber}
            onChangeText={setVatNumber}
            keyboardType="numeric"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>{t('settings.about')}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        {/* Save Profile */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          disabled={saving}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? t('saving') : t('settings.saveChanges')}</Text>
        </TouchableOpacity>

        {/* Menu */}
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        <View style={styles.card}>
          {[
            { icon: 'notifications-outline' as const, label: t('settings.notifPrefs'), action: () => Alert.alert(t('settings.comingSoon'), t('settings.notifMessage')) },
            { icon: 'card-outline' as const, label: t('settings.payout'), action: () => Alert.alert(t('settings.comingSoon'), t('settings.payoutMessage')) },
            { icon: 'document-text-outline' as const, label: t('settings.legal'), action: () => Alert.alert(t('settings.comingSoon'), t('settings.legalMessage')) },
            { icon: 'help-circle-outline' as const, label: t('settings.helpSupport'), action: () => Alert.alert(t('settings.supportTitle'), t('settings.supportMessage')) },
            { icon: 'language-outline' as const, label: t('settings.language'), action: () => setLanguage(language === 'en' ? 'el' : 'en') },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.menuItem} onPress={item.action}>
              <View style={styles.menuLeft}>
                <Ionicons name={item.icon} size={20} color={theme.colors.textSecondary} />
                <Text style={styles.menuLabel}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Switch to Player App */}
        {onSwitchToPlayer && (
          <TouchableOpacity
            style={styles.switchBtn}
            onPress={onSwitchToPlayer}
          >
            <Ionicons name="phone-portrait-outline" size={20} color={theme.colors.redPrimary} />
            <Text style={styles.switchBtnText}>{t('settings.switchPlayer')}</Text>
          </TouchableOpacity>
        )}

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => Alert.alert(t('settings.signOutTitle'), t('settings.signOutMessage'), [
            { text: t('cancel'), style: 'cancel' },
            { text: t('settings.signOut'), style: 'destructive', onPress: onLogout },
          ])}
        >
          <Ionicons name="log-out-outline" size={20} color="#F44336" />
          <Text style={styles.logoutText}>{t('settings.signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },

  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: theme.colors.bgCardSolid,
    alignItems: 'center', justifyContent: 'center',
  },
  companyEmail: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  verifiedText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },

  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#fff',
    paddingHorizontal: 20, marginBottom: 10, marginTop: 8,
  },
  card: {
    marginHorizontal: 20, padding: 16, marginBottom: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  label: {
    fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary,
    marginBottom: 6, marginTop: 12,
  },
  input: {
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    color: '#fff', fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  saveBtn: {
    marginHorizontal: 20, marginBottom: 24,
    paddingVertical: 14, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center',
    ...theme.shadow.red,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#fff' },

  switchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 8, marginBottom: 12,
    paddingVertical: 14, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redSubtle,
    borderWidth: 1, borderColor: theme.colors.redPrimary,
  },
  switchBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.redPrimary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginTop: 0, marginBottom: 40,
    paddingVertical: 14, borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: '#F44336',
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#F44336' },
});
