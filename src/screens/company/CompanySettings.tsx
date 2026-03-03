import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image, Clipboard, Switch,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';
import CompanyPlanModal from './CompanyPlanModal';

type TabKey = 'profile' | 'early-access' | 'photos' | 'widget';

interface Props {
  companyId: string;
  onLogout: () => void;
  onSwitchToPlayer?: () => void;
  onNavigateBilling?: () => void;
  onNavigatePhotos?: () => void;
}

export default function CompanySettings({ companyId, onLogout, onSwitchToPlayer, onNavigateBilling, onNavigatePhotos }: Props) {
  const company = useQuery(api.companies.getById, { id: companyId as Id<"companies"> });
  const updateProfile = useMutation(api.companies.updateProfile);
  const { t, language, setLanguage } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [planModalVisible, setPlanModalVisible] = useState(false);

  // Early Access
  const [earlyAccessEnabled, setEarlyAccessEnabled] = useState(false);
  const [eaSaving, setEaSaving] = useState(false);

  // Photo preset
  const photoPreset = useQuery(api.bookingPhotos.getPreset, { companyId: companyId as Id<"companies"> });
  const savePreset = useMutation(api.bookingPhotos.savePreset);
  const generateUploadUrl = useMutation(api.companies.generateUploadUrl);
  const getUrlMutation = useMutation(api.companies.getUrlMutation);
  const [presetForm, setPresetForm] = useState({
    logoPosition: 'bottom-right' as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'bottom-center',
    brandColor: '#FF1E1E',
    watermarkOpacity: 0.3,
    textTemplate: '',
  });
  const [presetLogoUrl, setPresetLogoUrl] = useState('');
  const [presetLogoStorageId, setPresetLogoStorageId] = useState<any>(null);
  const [presetLogoUploading, setPresetLogoUploading] = useState(false);
  const [useOverlay, setUseOverlay] = useState(false);
  const [overlayUrl, setOverlayUrl] = useState('');
  const [overlayStorageId, setOverlayStorageId] = useState<any>(null);
  const [overlayUploading, setOverlayUploading] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);
  const [presetMsg, setPresetMsg] = useState('');
  const [presetLoaded, setPresetLoaded] = useState(false);

  // Widget copy
  const [widgetCopied, setWidgetCopied] = useState(false);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setPhone(company.phone);
      setAddress(company.address);
      setCity(company.city);
      setVatNumber(company.vatNumber ?? '');
      setDescription(company.description);
      setEarlyAccessEnabled((company as any).subscriptionEnabled || false);
    }
  }, [company]);

  useEffect(() => {
    if (photoPreset && !presetLoaded) {
      setPresetForm({
        logoPosition: photoPreset.logoPosition || 'bottom-right',
        brandColor: photoPreset.brandColor || '#FF1E1E',
        watermarkOpacity: photoPreset.watermarkOpacity ?? 0.3,
        textTemplate: photoPreset.textTemplate || '',
      });
      if (photoPreset.logoUrl) setPresetLogoUrl(photoPreset.logoUrl);
      if (photoPreset.logoStorageId) setPresetLogoStorageId(photoPreset.logoStorageId);
      if ((photoPreset as any).overlayUrl) setOverlayUrl((photoPreset as any).overlayUrl);
      if ((photoPreset as any).overlayStorageId) setOverlayStorageId((photoPreset as any).overlayStorageId);
      if ((photoPreset as any).useOverlay) setUseOverlay(true);
      setPresetLoaded(true);
    }
  }, [photoPreset, presetLoaded]);

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

  const handleToggleEarlyAccess = async () => {
    const newValue = !earlyAccessEnabled;
    setEarlyAccessEnabled(newValue);
    setEaSaving(true);
    try {
      await updateProfile({
        id: companyId as Id<"companies">,
        subscriptionEnabled: newValue,
      });
    } catch {
      setEarlyAccessEnabled(!newValue);
      Alert.alert(t('error'), t('settings.updateFailed'));
    }
    setEaSaving(false);
  };

  const handleUploadLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;

    setPresetLogoUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const resp = await fetch(result.assets[0].uri);
      const blob = await resp.blob();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': result.assets[0].mimeType || 'image/jpeg' },
        body: blob,
      });
      const { storageId } = await res.json();
      const url = await getUrlMutation({ storageId });
      if (url) {
        setPresetLogoUrl(url);
        setPresetLogoStorageId(storageId);
      }
    } catch {
      Alert.alert(t('error'), t('settings.photoUploadFailed'));
    }
    setPresetLogoUploading(false);
  };

  const handleUploadOverlay = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return;

    setOverlayUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const resp = await fetch(result.assets[0].uri);
      const blob = await resp.blob();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': result.assets[0].mimeType || 'image/png' },
        body: blob,
      });
      const { storageId } = await res.json();
      const url = await getUrlMutation({ storageId });
      if (url) {
        setOverlayUrl(url);
        setOverlayStorageId(storageId);
      }
    } catch {
      Alert.alert(t('error'), t('settings.photoUploadFailed'));
    }
    setOverlayUploading(false);
  };

  const handleSavePreset = async () => {
    setPresetSaving(true);
    setPresetMsg('');
    try {
      await savePreset({
        companyId: companyId as Id<"companies">,
        logoUrl: presetLogoUrl || undefined,
        logoStorageId: presetLogoStorageId || undefined,
        logoPosition: presetForm.logoPosition,
        brandColor: presetForm.brandColor,
        watermarkOpacity: presetForm.watermarkOpacity,
        textTemplate: presetForm.textTemplate || undefined,
        overlayUrl: overlayUrl || undefined,
        overlayStorageId: overlayStorageId || undefined,
        useOverlay,
      });
      setPresetMsg(t('settings.photosSaved'));
      setTimeout(() => setPresetMsg(''), 3000);
    } catch {
      setPresetMsg(t('settings.photosSaveError'));
    }
    setPresetSaving(false);
  };

  const handleCopyWidget = () => {
    const code = `<!-- UNLOCKED Booking Widget -->\n<div id="booking-widget"></div>\n<script\n  src="https://widget.unlocked.gr/booking-widget.js"\n  data-company-id="${companyId}"\n  defer></script>`;
    Clipboard.setString(code);
    setWidgetCopied(true);
    setTimeout(() => setWidgetCopied(false), 2500);
  };

  const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'profile', label: t('settings.tabProfile'), icon: 'business-outline' },
    { key: 'early-access', label: t('settings.tabEarlyAccess'), icon: 'flash-outline' },
    { key: 'photos', label: t('settings.tabPhotos'), icon: 'camera-outline' },
    { key: 'widget', label: t('settings.tabWidget'), icon: 'code-slash-outline' },
  ];

  const LOGO_POSITIONS: { key: typeof presetForm.logoPosition; label: string }[] = [
    { key: 'top-left', label: t('settings.posTopLeft') },
    { key: 'top-right', label: t('settings.posTopRight') },
    { key: 'bottom-left', label: t('settings.posBottomLeft') },
    { key: 'bottom-right', label: t('settings.posBottomRight') },
    { key: 'bottom-center', label: t('settings.posBottomCenter') },
  ];

  const BENEFITS = [
    { icon: 'shield-checkmark-outline' as const, title: t('settings.eaBenefit1Title'), desc: t('settings.eaBenefit1Desc') },
    { icon: 'trending-up-outline' as const, title: t('settings.eaBenefit2Title'), desc: t('settings.eaBenefit2Desc') },
    { icon: 'notifications-outline' as const, title: t('settings.eaBenefit3Title'), desc: t('settings.eaBenefit3Desc') },
    { icon: 'bar-chart-outline' as const, title: t('settings.eaBenefit4Title'), desc: t('settings.eaBenefit4Desc') },
    { icon: 'gift-outline' as const, title: t('settings.eaBenefit5Title'), desc: t('settings.eaBenefit5Desc') },
    { icon: 'star-outline' as const, title: t('settings.eaBenefit6Title'), desc: t('settings.eaBenefit6Desc') },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={activeTab === tab.key ? '#fff' : theme.colors.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ═══════ PROFILE TAB ═══════ */}
        {activeTab === 'profile' && (
          <>
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
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={theme.colors.textMuted} />

              <Text style={styles.label}>{t('settings.phone')}</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor={theme.colors.textMuted} />

              <Text style={styles.label}>{t('settings.city')}</Text>
              <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor={theme.colors.textMuted} />

              <Text style={styles.label}>{t('settings.address')}</Text>
              <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholderTextColor={theme.colors.textMuted} />

              <Text style={styles.label}>{t('settings.vatNumber')}</Text>
              <TextInput style={styles.input} value={vatNumber} onChangeText={setVatNumber} keyboardType="numeric" placeholderTextColor={theme.colors.textMuted} />

              <Text style={styles.label}>{t('settings.about')}</Text>
              <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline placeholderTextColor={theme.colors.textMuted} />
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveBtnText}>{saving ? t('saving') : t('settings.saveChanges')}</Text>
            </TouchableOpacity>

            {/* Subscription Plan */}
            <Text style={styles.sectionTitle}>{t('settings.subscriptionPlan')}</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.menuItem} onPress={() => setPlanModalVisible(true)}>
                <View style={styles.menuLeft}>
                  <Ionicons name="diamond-outline" size={20} color={theme.colors.redPrimary} />
                  <Text style={styles.menuLabel}>{t('settings.managePlan')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 14, textTransform: 'capitalize' }}>
                    {company?.platformPlan || 'Starter'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </View>
              </TouchableOpacity>

              {/* Billing link */}
              {onNavigateBilling && (
                <TouchableOpacity style={styles.menuItem} onPress={onNavigateBilling}>
                  <View style={styles.menuLeft}>
                    <Ionicons name="receipt-outline" size={20} color={theme.colors.redPrimary} />
                    <Text style={styles.menuLabel}>{t('settings.billing')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

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

            {onSwitchToPlayer && (
              <TouchableOpacity style={styles.switchBtn} onPress={onSwitchToPlayer}>
                <Ionicons name="phone-portrait-outline" size={20} color={theme.colors.redPrimary} />
                <Text style={styles.switchBtnText}>{t('settings.switchPlayer')}</Text>
              </TouchableOpacity>
            )}

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
          </>
        )}

        {/* ═══════ EARLY ACCESS TAB ═══════ */}
        {activeTab === 'early-access' && (
          <>
            {/* Hero */}
            <View style={styles.eaHero}>
              <View style={styles.eaChip}>
                <Ionicons name="flash" size={12} color={theme.colors.redPrimary} />
                <Text style={styles.eaChipText}>{t('settings.eaPartnerProgram')}</Text>
              </View>
              <Text style={styles.eaTitle}>{t('settings.eaTitle')}</Text>
              <Text style={styles.eaDesc}>{t('settings.eaDesc')}</Text>

              {/* Steps */}
              <View style={styles.eaSteps}>
                {[
                  { step: '1', text: t('settings.eaStep1') },
                  { step: '2', text: t('settings.eaStep2') },
                  { step: '3', text: t('settings.eaStep3') },
                ].map((item) => (
                  <View key={item.step} style={styles.eaStepCard}>
                    <View style={styles.eaStepNum}>
                      <Text style={styles.eaStepNumText}>{item.step}</Text>
                    </View>
                    <Text style={styles.eaStepText}>{item.text}</Text>
                  </View>
                ))}
              </View>

              {/* Toggle */}
              <View style={styles.eaToggleRow}>
                <View style={[styles.eaToggleIcon, earlyAccessEnabled && { backgroundColor: 'rgba(244,67,54,0.2)' }]}>
                  <Ionicons name="shield-checkmark" size={22} color={earlyAccessEnabled ? theme.colors.redPrimary : theme.colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eaToggleTitle}>
                    {earlyAccessEnabled ? t('settings.eaActive') : t('settings.eaInactive')}
                  </Text>
                  <Text style={styles.eaToggleDesc}>
                    {earlyAccessEnabled ? t('settings.eaActiveDesc') : t('settings.eaInactiveDesc')}
                  </Text>
                </View>
                {eaSaving ? (
                  <ActivityIndicator size="small" color={theme.colors.redPrimary} />
                ) : (
                  <Switch
                    value={earlyAccessEnabled}
                    onValueChange={handleToggleEarlyAccess}
                    trackColor={{ false: theme.colors.glass, true: 'rgba(244,67,54,0.4)' }}
                    thumbColor={earlyAccessEnabled ? theme.colors.redPrimary : '#ccc'}
                  />
                )}
              </View>
            </View>

            {/* Benefits */}
            <Text style={styles.sectionTitle}>{t('settings.eaBenefitsTitle')}</Text>
            {BENEFITS.map((b, i) => (
              <View key={i} style={[styles.benefitCard, !earlyAccessEnabled && { opacity: 0.5 }]}>
                <View style={[styles.benefitIcon, earlyAccessEnabled && { backgroundColor: 'rgba(244,67,54,0.15)' }]}>
                  <Ionicons name={b.icon} size={20} color={earlyAccessEnabled ? theme.colors.redPrimary : theme.colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Text style={styles.benefitDesc}>{b.desc}</Text>
                </View>
              </View>
            ))}

            {!earlyAccessEnabled && (
              <Text style={styles.enableEaHint}>{t('settings.enableEaHint')}</Text>
            )}
          </>
        )}

        {/* ═══════ PHOTOS TAB ═══════ */}
        {activeTab === 'photos' && (
          <>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons name="camera" size={18} color={theme.colors.redPrimary} />
                <Text style={styles.cardTitleText}>{t('settings.photosTitle')}</Text>
              </View>
              <Text style={styles.cardDesc}>{t('settings.photosDesc')}</Text>

              {presetMsg ? (
                <View style={[styles.msgBanner, presetMsg.includes('✓') ? { backgroundColor: 'rgba(76,175,80,0.15)' } : { backgroundColor: 'rgba(244,67,54,0.15)' }]}>
                  <Text style={{ color: presetMsg.includes('✓') ? '#4CAF50' : '#F44336', fontSize: 13 }}>{presetMsg}</Text>
                </View>
              ) : null}

              {/* Branding Mode Toggle */}
              <Text style={[styles.label, { marginTop: 16 }]}>{t('settings.photoMode')}</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modeOption, !useOverlay && styles.modeOptionActive]}
                  onPress={() => setUseOverlay(false)}
                >
                  <Ionicons name="cloud-upload-outline" size={18} color={theme.colors.redPrimary} />
                  <Text style={styles.modeLabel}>{t('settings.photoModeLogo')}</Text>
                  <Text style={styles.modeDesc}>{t('settings.photoModeLogoDesc')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeOption, useOverlay && styles.modeOptionActive]}
                  onPress={() => setUseOverlay(true)}
                >
                  <Ionicons name="layers-outline" size={18} color={theme.colors.redPrimary} />
                  <Text style={styles.modeLabel}>{t('settings.photoModeOverlay')}</Text>
                  <Text style={styles.modeDesc}>{t('settings.photoModeOverlayDesc')}</Text>
                </TouchableOpacity>
              </View>

              {/* OVERLAY MODE */}
              {useOverlay && (
                <View style={styles.modeContent}>
                  <Text style={styles.label}>{t('settings.overlayImage')}</Text>
                  <TouchableOpacity style={styles.uploadArea} onPress={handleUploadOverlay}>
                    {overlayUploading ? (
                      <ActivityIndicator size="large" color={theme.colors.redPrimary} />
                    ) : overlayUrl ? (
                      <Image source={{ uri: overlayUrl }} style={styles.uploadPreview} resizeMode="contain" />
                    ) : (
                      <>
                        <Ionicons name="layers-outline" size={36} color={theme.colors.textMuted} />
                        <Text style={styles.uploadAreaText}>{t('settings.uploadOverlay')}</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.instructionsCard}>
                    <Text style={styles.instructionsTitle}>{t('settings.overlayInstructionsTitle')}</Text>
                    <Text style={styles.instructionsText}>{t('settings.overlayInst1')}</Text>
                    <Text style={styles.instructionsText}>{t('settings.overlayInst2')}</Text>
                    <Text style={styles.instructionsText}>{t('settings.overlayInst3')}</Text>
                  </View>

                  <Text style={styles.label}>{t('settings.overlayOpacity')} ({Math.round(presetForm.watermarkOpacity * 100)}%)</Text>
                  <View style={styles.sliderLabelRow}>
                    <Text style={styles.sliderLabel}>0%</Text>
                    <Text style={styles.sliderLabel}>100%</Text>
                  </View>
                  {/* Opacity buttons (RN has no Slider in core) */}
                  <View style={styles.opacityBtns}>
                    {[10, 20, 30, 50, 70, 100].map((v) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.opacityBtn, Math.round(presetForm.watermarkOpacity * 100) === v && styles.opacityBtnActive]}
                        onPress={() => setPresetForm({ ...presetForm, watermarkOpacity: v / 100 })}
                      >
                        <Text style={[styles.opacityBtnText, Math.round(presetForm.watermarkOpacity * 100) === v && { color: '#fff' }]}>{v}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* LOGO MODE */}
              {!useOverlay && (
                <View style={styles.modeContent}>
                  <Text style={styles.label}>{t('settings.logoUpload')}</Text>
                  <TouchableOpacity style={styles.uploadArea} onPress={handleUploadLogo}>
                    {presetLogoUploading ? (
                      <ActivityIndicator size="large" color={theme.colors.redPrimary} />
                    ) : presetLogoUrl ? (
                      <Image source={{ uri: presetLogoUrl }} style={styles.logoPreview} resizeMode="contain" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={36} color={theme.colors.textMuted} />
                        <Text style={styles.uploadAreaText}>{t('settings.uploadLogo')}</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <Text style={styles.label}>{t('settings.logoPosition')}</Text>
                  <View style={styles.positionRow}>
                    {LOGO_POSITIONS.map((pos) => (
                      <TouchableOpacity
                        key={pos.key}
                        style={[styles.posBtn, presetForm.logoPosition === pos.key && styles.posBtnActive]}
                        onPress={() => setPresetForm({ ...presetForm, logoPosition: pos.key })}
                      >
                        <Text style={[styles.posBtnText, presetForm.logoPosition === pos.key && { color: theme.colors.redPrimary }]}>
                          {pos.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>{t('settings.brandColor')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={[styles.colorSwatch, { backgroundColor: presetForm.brandColor }]} />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={presetForm.brandColor}
                      onChangeText={(v) => setPresetForm({ ...presetForm, brandColor: v })}
                      placeholder="#FF1E1E"
                      placeholderTextColor={theme.colors.textMuted}
                      autoCapitalize="characters"
                    />
                  </View>

                  <Text style={styles.label}>{t('settings.logoOpacity')} ({Math.round(presetForm.watermarkOpacity * 100)}%)</Text>
                  <View style={styles.opacityBtns}>
                    {[10, 20, 30, 50, 70, 100].map((v) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.opacityBtn, Math.round(presetForm.watermarkOpacity * 100) === v && styles.opacityBtnActive]}
                        onPress={() => setPresetForm({ ...presetForm, watermarkOpacity: v / 100 })}
                      >
                        <Text style={[styles.opacityBtnText, Math.round(presetForm.watermarkOpacity * 100) === v && { color: '#fff' }]}>{v}%</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>{t('settings.textTemplate')}</Text>
                  <TextInput
                    style={styles.input}
                    value={presetForm.textTemplate}
                    onChangeText={(v) => setPresetForm({ ...presetForm, textTemplate: v })}
                    placeholder={t('settings.textTemplatePlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                  />
                  <Text style={styles.hintText}>{t('settings.textTemplateHint')}</Text>
                </View>
              )}

              {/* Save Preset */}
              <TouchableOpacity
                style={[styles.saveBtn, presetSaving && { opacity: 0.6 }]}
                disabled={presetSaving}
                onPress={handleSavePreset}
                activeOpacity={0.8}
              >
                {presetSaving ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>{t('settings.savePhotoPreset')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Go to Photos management */}
            {onNavigatePhotos && (
              <TouchableOpacity style={styles.goToPhotosBtn} onPress={onNavigatePhotos}>
                <Ionicons name="images-outline" size={18} color={theme.colors.redPrimary} />
                <Text style={styles.goToPhotosBtnText}>{t('settings.goToPhotos')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ═══════ WIDGET TAB ═══════ */}
        {activeTab === 'widget' && (
          <>
            {/* Hero */}
            <View style={styles.widgetHero}>
              <View style={styles.eaChip}>
                <Ionicons name="code-slash" size={12} color={theme.colors.redPrimary} />
                <Text style={styles.eaChipText}>{t('settings.tabWidget')}</Text>
              </View>
              <Text style={styles.eaTitle}>{t('settings.widgetTitle')}</Text>
              <Text style={styles.eaDesc}>{t('settings.widgetSubtitle')}</Text>
            </View>

            {/* How it works */}
            <View style={styles.card}>
              <Text style={styles.cardTitleText}>{t('settings.widgetHowItWorks')}</Text>
              {[
                { step: '1', text: t('settings.widgetStep1') },
                { step: '2', text: t('settings.widgetStep2') },
                { step: '3', text: t('settings.widgetStep3') },
              ].map((item) => (
                <View key={item.step} style={styles.eaStepCard}>
                  <View style={styles.eaStepNum}>
                    <Text style={styles.eaStepNumText}>{item.step}</Text>
                  </View>
                  <Text style={styles.eaStepText}>{item.text}</Text>
                </View>
              ))}
            </View>

            {/* Embed Code */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="code-slash" size={18} color={theme.colors.redPrimary} />
                  <Text style={styles.cardTitleText}>{t('settings.embedCode')}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.copyBtn, widgetCopied && { backgroundColor: 'rgba(76,175,80,0.15)', borderColor: 'rgba(76,175,80,0.3)' }]}
                  onPress={handleCopyWidget}
                >
                  <Ionicons name={widgetCopied ? 'checkmark-circle' : 'copy-outline'} size={14} color={widgetCopied ? '#4CAF50' : theme.colors.redPrimary} />
                  <Text style={[styles.copyBtnText, widgetCopied && { color: '#4CAF50' }]}>
                    {widgetCopied ? t('settings.copied') : t('settings.copy')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>
                  {`<!-- UNLOCKED Booking Widget -->\n<div id="booking-widget"></div>\n<script\n  src="https://widget.unlocked.gr/booking-widget.js"\n  data-company-id="${companyId}"\n  defer></script>`}
                </Text>
              </View>

              <Text style={styles.hintText}>{t('settings.widgetNote')}</Text>
            </View>

            {/* Widget Features */}
            <Text style={styles.sectionTitle}>{t('settings.widgetFeaturesTitle')}</Text>
            {[
              { icon: 'time-outline' as const, title: t('settings.widgetFeat1Title'), desc: t('settings.widgetFeat1Desc') },
              { icon: 'people-outline' as const, title: t('settings.widgetFeat2Title'), desc: t('settings.widgetFeat2Desc') },
              { icon: 'mail-outline' as const, title: t('settings.widgetFeat3Title'), desc: t('settings.widgetFeat3Desc') },
              { icon: 'phone-portrait-outline' as const, title: t('settings.widgetFeat4Title'), desc: t('settings.widgetFeat4Desc') },
              { icon: 'notifications-outline' as const, title: t('settings.widgetFeat5Title'), desc: t('settings.widgetFeat5Desc') },
              { icon: 'wallet-outline' as const, title: t('settings.widgetFeat6Title'), desc: t('settings.widgetFeat6Desc') },
            ].map((feat, i) => (
              <View key={i} style={styles.benefitCard}>
                <View style={[styles.benefitIcon, { backgroundColor: 'rgba(244,67,54,0.15)' }]}>
                  <Ionicons name={feat.icon} size={20} color={theme.colors.redPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{feat.title}</Text>
                  <Text style={styles.benefitDesc}>{feat.desc}</Text>
                </View>
              </View>
            ))}

            {/* Customization Help */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="shield-outline" size={16} color={theme.colors.redPrimary} />
                <Text style={styles.cardTitleText}>{t('settings.widgetCustomization')}</Text>
              </View>
              <Text style={styles.cardDesc}>{t('settings.widgetCustomDesc')}</Text>
              <Text style={[styles.hintText, { marginTop: 8 }]}>{t('settings.widgetNeedHelp')}</Text>
            </View>
          </>
        )}

      </ScrollView>

      <CompanyPlanModal
        visible={planModalVisible}
        onClose={() => setPlanModalVisible(false)}
        companyId={companyId}
        currentPlan={company?.platformPlan || 'starter'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },

  // Tab Bar
  tabBarScroll: { maxHeight: 48 },
  tabBar: {
    flexDirection: 'row', gap: 4,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  tabActive: {
    backgroundColor: theme.colors.redPrimary,
    borderColor: theme.colors.redPrimary,
  },
  tabText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  tabTextActive: { color: '#fff' },

  // Avatar
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
  cardTitleText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cardDesc: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 8 },
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

  // ── Early Access ──
  eaHero: {
    marginHorizontal: 20, marginBottom: 16, padding: 20,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.2)',
  },
  eaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(244,67,54,0.1)', borderWidth: 1, borderColor: 'rgba(244,67,54,0.3)',
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  eaChipText: { fontSize: 10, fontWeight: '700', color: theme.colors.redPrimary, textTransform: 'uppercase', letterSpacing: 1 },
  eaTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 8 },
  eaDesc: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  eaSteps: { gap: 8, marginBottom: 16 },
  eaStepCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  eaStepNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(244,67,54,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  eaStepNumText: { fontSize: 12, fontWeight: '700', color: theme.colors.redPrimary },
  eaStepText: { fontSize: 13, color: theme.colors.textSecondary, flex: 1, lineHeight: 18 },

  eaToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  eaToggleIcon: {
    width: 44, height: 44, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
  },
  eaToggleTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  eaToggleDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },

  benefitCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginHorizontal: 20, marginBottom: 10, padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  benefitIcon: {
    width: 40, height: 40, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
  },
  benefitTitle: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 2 },
  benefitDesc: { fontSize: 11, color: theme.colors.textSecondary, lineHeight: 16 },
  enableEaHint: {
    textAlign: 'center', fontSize: 13, color: theme.colors.textMuted,
    marginHorizontal: 20, marginTop: 8, marginBottom: 16,
  },

  // ── Photos Tab ──
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  modeOption: {
    flex: 1, padding: 14, borderRadius: theme.radius.md,
    borderWidth: 2, borderColor: theme.colors.glassBorder,
  },
  modeOptionActive: { borderColor: theme.colors.redPrimary, backgroundColor: 'rgba(244,67,54,0.08)' },
  modeLabel: { fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 6 },
  modeDesc: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  modeContent: { marginTop: 8 },

  uploadArea: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: theme.colors.glassBorder,
    borderRadius: theme.radius.md, padding: 24, alignItems: 'center', justifyContent: 'center',
    minHeight: 100,
  },
  uploadAreaText: { fontSize: 13, color: theme.colors.textMuted, marginTop: 8 },
  uploadPreview: { width: '100%', height: 120 },
  logoPreview: { width: 80, height: 80 },

  positionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  posBtn: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  posBtnActive: { borderColor: theme.colors.redPrimary, backgroundColor: 'rgba(244,67,54,0.1)' },
  posBtnText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },

  colorSwatch: { width: 36, height: 36, borderRadius: 8, borderWidth: 2, borderColor: theme.colors.glassBorder },

  opacityBtns: { flexDirection: 'row', gap: 6 },
  opacityBtn: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  opacityBtnActive: { borderColor: theme.colors.redPrimary, backgroundColor: theme.colors.redPrimary },
  opacityBtnText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },

  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sliderLabel: { fontSize: 10, color: theme.colors.textMuted },

  hintText: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, lineHeight: 16 },
  msgBanner: {
    padding: 10, borderRadius: theme.radius.md, marginBottom: 8, marginTop: 8,
  },

  instructionsCard: {
    marginTop: 12, padding: 14, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  instructionsTitle: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 6 },
  instructionsText: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 18 },

  goToPhotosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 20, padding: 16,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  goToPhotosBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.redPrimary, flex: 1 },

  // ── Widget Tab ──
  widgetHero: {
    marginHorizontal: 20, marginBottom: 16, padding: 20,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.2)',
  },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: 'rgba(244,67,54,0.1)',
    borderWidth: 1, borderColor: 'rgba(244,67,54,0.3)',
  },
  copyBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.redPrimary },
  codeBlock: {
    padding: 16, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgPrimary,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  codeText: { fontFamily: 'monospace', fontSize: 11, color: theme.colors.textSecondary, lineHeight: 18 },
});
