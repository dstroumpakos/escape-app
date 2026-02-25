import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

const SECTIONS = [
  {
    titleKey: 'privacy.section1Title',
    bodyKey: 'privacy.section1Body',
  },
  {
    titleKey: 'privacy.section2Title',
    bodyKey: 'privacy.section2Body',
  },
  {
    titleKey: 'privacy.section3Title',
    bodyKey: 'privacy.section3Body',
  },
  {
    titleKey: 'privacy.section4Title',
    bodyKey: 'privacy.section4Body',
  },
  {
    titleKey: 'privacy.section5Title',
    bodyKey: 'privacy.section5Body',
  },
  {
    titleKey: 'privacy.section6Title',
    bodyKey: 'privacy.section6Body',
  },
  {
    titleKey: 'privacy.section7Title',
    bodyKey: 'privacy.section7Body',
  },
];

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('privacy.title')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.lastUpdated}>{t('privacy.lastUpdated')}</Text>
        <Text style={styles.intro}>{t('privacy.intro')}</Text>

        {SECTIONS.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
            <Text style={styles.sectionBody}>{t(section.bodyKey)}</Text>
          </View>
        ))}

        <View style={styles.contactSection}>
          <Text style={styles.sectionTitle}>{t('privacy.contactTitle')}</Text>
          <Text style={styles.sectionBody}>{t('privacy.contactBody')}</Text>
        </View>
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
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  lastUpdated: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 16 },
  intro: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 8 },
  sectionBody: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 },
  contactSection: { marginBottom: 40, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border },
});
