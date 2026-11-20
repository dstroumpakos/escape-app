import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';
import { RoomCard } from '../components/RoomCard';
import { CompanyLogo } from '../components/CompanyLogo';

/** A company's profile for logged-in players: its rooms, and following it (convex/companyPages.ts). */
export default function CompanyProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { sessionToken } = useUser();
  const companyId = route.params?.companyId;
  const data = useQuery(api.companyPages.profile, sessionToken && companyId ? { companyId, sessionToken } : 'skip');
  const follow = useMutation(api.companyPages.follow);
  const unfollow = useMutation(api.companyPages.unfollow);
  const [busy, setBusy] = useState(false);

  const toggleFollow = async () => {
    if (!sessionToken || !data || busy) return;
    setBusy(true);
    try {
      if (data.following) await unfollow({ sessionToken, companyId: data._id });
      else await follow({ sessionToken, companyId: data._id });
    } finally {
      setBusy(false);
    }
  };

  const site = data && /^https?:\/\//.test(data.website) ? data.website : '';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel={t('profile.back')}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{data?.name ?? ''}</Text>
      </View>

      {data === undefined ? (
        <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
      ) : data === null ? (
        <Text style={[styles.p, { textAlign: 'center', marginTop: 40 }]}>{t('co.notFound')}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <View style={styles.top}>
            <CompanyLogo name={data.name} logo={data.logo} size={84} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{data.name}</Text>
              {!!(data.city || data.address) && (
                <Text style={styles.meta}>{[data.address, data.city].filter(Boolean).join(', ')}</Text>
              )}
              <Text style={styles.meta}>
                {data.rooms.length === 1 ? t('co.roomsOne') : t('co.roomsMany', { n: data.rooms.length })} · {data.followers === 1 ? t('co.followersOne') : t('co.followersMany', { n: data.followers })}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.followBtn, data.following && styles.followingBtn]} onPress={toggleFollow} disabled={busy}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={data.following ? 'checkmark' : 'person-add-outline'} size={16} color="#fff" />}
              <Text style={styles.followText}>{data.following ? t('co.following') : t('co.follow')}</Text>
            </TouchableOpacity>
            {!!site && (
              <TouchableOpacity style={styles.siteBtn} onPress={() => Linking.openURL(site).catch(() => {})}>
                <Ionicons name="globe-outline" size={16} color={theme.colors.bone} />
                <Text style={styles.siteText}>{t('co.website')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {!!data.description && (
            <View style={styles.about}>
              <Text style={styles.label}>{t('co.about')}</Text>
              <Text style={styles.p}>{data.description}</Text>
            </View>
          )}

          <Text style={styles.section}>{t('co.theirRooms')}</Text>
          <View style={{ gap: 14 }}>
            {data.rooms.map((r: any) => (
              <RoomCard key={r._id} room={{ ...r, id: r._id }} onPress={() => navigation.navigate('RoomDetails', { id: r._id })} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.glass },
  headerTitle: { flex: 1, fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.bone },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontFamily: theme.fonts.display, fontSize: 22, color: theme.colors.bone },
  meta: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  followBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: 12, backgroundColor: theme.colors.redPrimary },
  followingBtn: { backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  followText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  siteBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 14, height: 42, borderRadius: 12, backgroundColor: theme.colors.glass, borderWidth: 1, borderColor: theme.colors.glassBorder },
  siteText: { color: theme.colors.bone, fontWeight: '600', fontSize: 13 },
  about: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  label: { fontSize: 11, color: theme.colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  p: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  section: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.bone, marginTop: 22, marginBottom: 12 },
});
