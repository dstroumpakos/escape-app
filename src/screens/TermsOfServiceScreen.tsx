import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

const SECTIONS = [
  { titleKey: 'tos.section1Title', bodyKey: 'tos.section1Body' },
  { titleKey: 'tos.section2Title', bodyKey: 'tos.section2Body' },
  { titleKey: 'tos.section3Title', bodyKey: 'tos.section3Body' },
  { titleKey: 'tos.section4Title', bodyKey: 'tos.section4Body' },
  { titleKey: 'tos.section5Title', bodyKey: 'tos.section5Body' },
  { titleKey: 'tos.section6Title', bodyKey: 'tos.section6Body' },
  { titleKey: 'tos.section7Title', bodyKey: 'tos.section7Body' },
  { titleKey: 'tos.section8Title', bodyKey: 'tos.section8Body' },
];

export default function TermsOfServiceScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('tos.title')}</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.lastUpdated}>{t('tos.lastUpdated')}</Text>
        <Text style={styles.intro}>{t('tos.intro')}</Text>

        {SECTIONS.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
            <Text style={styles.sectionBody}>{t(section.bodyKey)}</Text>
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
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  lastUpdated: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 16 },
  intro: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 8 },
  sectionBody: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 },
});
