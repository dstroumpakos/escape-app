import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { JobCard } from '../components/JobCard';
import { COUNTRIES, JOB_ROLES, cityLabel, countryName, type PublicJob } from '../jobs';

/** Job ads from escape room companies (convex/jobs.ts), like the website's /jobs. */
export default function JobsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t, language } = useTranslation();
  const jobs = useQuery(api.jobs.listOpen) as PublicJob[] | undefined;
  // Several roles can be picked: an ad shows when it has any of them
  const [roles, setRoles] = useState<string[]>([]);
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const toggleRole = (r: string) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  const countries = useMemo(() => {
    const used = new Set((jobs ?? []).map((j) => j.country).filter(Boolean));
    return COUNTRIES.map((c) => c.code).filter((c) => used.has(c));
  }, [jobs]);
  const cities = useMemo(
    () => [...new Set((jobs ?? []).filter((j) => !country || j.country === country).map((j) => j.city).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [jobs, country]
  );
  const usedRoles = useMemo(() => JOB_ROLES.filter((r) => (jobs ?? []).some((j) => j.roles.includes(r))), [jobs]);
  const shown = useMemo(
    () => (jobs ?? []).filter((j) => (roles.length === 0 || j.roles.some((r) => roles.includes(r))) && (!country || j.country === country) && (!city || j.city === city)),
    [jobs, roles, country, city]
  );

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress} accessibilityState={{ selected: on }}>
      <Text style={[styles.chipText, on && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {!embedded && (
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel={t('profile.back')}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('jobs.title')}</Text>
      </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: embedded ? 120 : 60 }}>
        <Text style={styles.kicker}>{t('jobs.kicker').toUpperCase()}</Text>
        <Text style={styles.subtitle}>{t('jobs.subtitle')}</Text>

        {jobs && jobs.length > 0 && (
          <View style={{ gap: 10, marginBottom: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip on={roles.length === 0} label={t('jobs.all_roles')} onPress={() => setRoles([])} />
              {usedRoles.map((r) => (
                <Chip key={r} on={roles.includes(r)} label={t(`jobs.role.${r}`)} onPress={() => toggleRole(r)} />
              ))}
            </ScrollView>
            {countries.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip on={!country} label={t('jobs.all_countries')} onPress={() => { setCountry(''); setCity(''); }} />
                {countries.map((c) => (
                  <Chip key={c} on={country === c} label={countryName(c, language)} onPress={() => { setCountry(c); setCity(''); }} />
                ))}
              </ScrollView>
            )}
            {cities.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip on={!city} label={t('jobs.all_cities')} onPress={() => setCity('')} />
                {cities.map((c) => (
                  <Chip key={c} on={city === c} label={cityLabel(c, (jobs ?? []).find((j) => j.city === c)?.country, language)} onPress={() => setCity(c)} />
                ))}
              </ScrollView>
            )}
            <Text style={styles.count}>{shown.length === 1 ? t('jobs.count_one') : t('jobs.count', { count: shown.length })}</Text>
          </View>
        )}

        {jobs === undefined ? (
          <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
        ) : shown.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={36} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>{jobs.length === 0 ? t('jobs.empty') : t('jobs.empty_filter')}</Text>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {shown.map((j) => (
              <JobCard key={j._id} job={j} onOpenCompany={() => navigation.navigate('CompanyProfile', { companyId: j.company._id })} />
            ))}
          </View>
        )}

        <View style={styles.forCompanies}>
          <Ionicons name="business-outline" size={18} color={theme.colors.redLight} />
          <Text style={styles.forCompaniesText}>{t('jobs.for_companies')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass },
  headerTitle: { flex: 1, fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone },
  kicker: { fontFamily: theme.fonts.type, fontSize: 11, letterSpacing: 2, color: theme.colors.redLight, marginBottom: 6 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  chipRow: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.glass },
  chipOn: { backgroundColor: theme.colors.redPrimary, borderColor: theme.colors.redPrimary },
  chipText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  count: { color: theme.colors.textMuted, fontSize: 12 },
  empty: { alignItems: 'center', gap: 10, padding: 30, borderRadius: 14, backgroundColor: theme.colors.bgCard, borderWidth: 1, borderColor: theme.colors.border },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },
  forCompanies: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 24, padding: 14, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  forCompaniesText: { flex: 1, color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18 },
});
