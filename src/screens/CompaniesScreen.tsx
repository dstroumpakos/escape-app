import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { CompanyLogo } from '../components/CompanyLogo';

/** Companies section: every public escape room company with its rooms (convex/companyPages.ts). */
export default function CompaniesScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const companies = useQuery(api.companyPages.list);
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!companies) return [];
    return s ? companies.filter((c) => c.name.toLowerCase().includes(s) || c.city.toLowerCase().includes(s)) : companies;
  }, [companies, q]);

  return (
    <View style={styles.container}>
      {!embedded && (
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel={t('profile.back')}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('co.title')}</Text>
      </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: embedded ? 120 : 60 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.sub}>{t('co.subtitle')}</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={theme.colors.redLight} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('co.search')} placeholderTextColor={theme.colors.textMuted} style={styles.searchInput} />
        </View>

        {!companies ? (
          <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
        ) : shown.length === 0 ? (
          <Text style={[styles.sub, { textAlign: 'center', marginTop: 30 }]}>{t('co.none')}</Text>
        ) : (
          shown.map((c) => (
            <View key={c._id} style={styles.card}>
              <TouchableOpacity style={styles.cardHead} activeOpacity={0.8} onPress={() => navigation.navigate('CompanyProfile', { companyId: c._id })}>
                <CompanyLogo name={c.name} logo={c.logo} size={50} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.meta}>
                    {c.city ? `${c.city} · ` : ''}{c.roomCount === 1 ? t('co.roomsOne') : t('co.roomsMany', { n: c.roomCount })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 12 }}>
                {c.rooms.map((r) => (
                  <TouchableOpacity key={r._id} style={{ width: 140 }} activeOpacity={0.85} onPress={() => navigation.navigate('RoomDetails', { id: r._id })}>
                    {r.image ? (
                      <Image source={{ uri: r.image }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="key-outline" size={22} color={theme.colors.redLight} />
                      </View>
                    )}
                    <Text style={styles.roomTitle} numberOfLines={1}>{r.title}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('CompanyProfile', { companyId: c._id })}>
                <Text style={styles.profileBtnText}>{t('co.viewProfile')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass },
  headerTitle: { flex: 1, fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone },
  sub: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 16, paddingHorizontal: 12, height: 44, borderRadius: 12, backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  searchInput: { flex: 1, color: theme.colors.bone, fontSize: 14 },
  card: { padding: 14, borderRadius: 16, backgroundColor: '#140c0a', borderWidth: 1, borderColor: theme.colors.border, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: theme.fonts.display, fontSize: 17, color: theme.colors.bone },
  meta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  thumb: { width: 140, height: 100, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.4)' },
  roomTitle: { color: theme.colors.bone, fontSize: 12, fontWeight: '600', marginTop: 6 },
  profileBtn: { marginTop: 12, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  profileBtnText: { color: theme.colors.bone, fontWeight: '700', fontSize: 13 },
});
