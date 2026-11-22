import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { RootStackParamList } from '../../types';

const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://unlocked.gr').replace(/\/+$/, '');

/**
 * A room players logged that isn't on UNLOCKED yet (convex/plays.ts
 * communityRooms), the player side of the website's /played/[id]: how many
 * players have it, and a link to send to the escape room. The company pitch
 * stays on the website.
 */
export default function PlayedRoomScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayedRoom'>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const id = route.params.id;
  const valid = /^[a-z0-9]{20,40}$/.test(id);
  const room = useQuery(api.plays.communityRoom, valid ? { id: id as any } : 'skip');

  const invite = () =>
    room &&
    Share.share({ message: t('pl.invite_message', { room: room.name, link: `${SITE}/played/${id}` }) }).catch(() => {});

  let body: React.ReactNode;
  if (valid && room === undefined) {
    body = <ActivityIndicator color={theme.colors.redPrimary} style={{ marginTop: 60 }} />;
  } else if (!valid || !room) {
    body = <Text style={styles.muted}>{t('pl.claim.missing')}</Text>;
  } else if (room.merged && room.roomId) {
    body = (
      <View style={styles.center}>
        <Text style={styles.title}>{t('pl.claim.joined', { room: room.name })}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('RoomDetails', { id: room.roomId! })}>
          <Text style={styles.btnText}>{t('pl.claim.open_room')}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  } else {
    body = (
      <View style={{ padding: 20 }}>
        <Text style={styles.kicker}>UNLOCKED · PASSPORT</Text>
        <Text style={styles.title}>{room.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.meta}>{[room.companyName, room.city, room.country].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.iconCircle}><Ionicons name="people" size={28} color={theme.colors.redLight} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.count}>{room.players}</Text>
            <Text style={styles.meta}>{t('pl.claim.players', { n: String(room.players) })}</Text>
          </View>
        </View>
        <Text style={[styles.meta, { marginTop: 18 }]}>{t('pl.community_pending')}</Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 18 }]} onPress={invite}>
          <Ionicons name="share-outline" size={16} color="#fff" />
          <Text style={styles.btnText}>{t('pl.invite_room')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('profile.back')}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
        </TouchableOpacity>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { paddingHorizontal: 14, paddingBottom: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  center: { alignItems: 'center', padding: 30, gap: 18, marginTop: 40 },
  muted: { color: theme.colors.textSecondary, textAlign: 'center', padding: 30, marginTop: 40, fontSize: 15 },
  kicker: { fontFamily: theme.fonts.type, fontSize: 11, letterSpacing: 3, color: theme.colors.gold },
  title: { fontFamily: theme.fonts.display, fontSize: 28, color: theme.colors.bone, marginTop: 8, textAlign: 'left' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta: { color: theme.colors.textSecondary, fontSize: 14, flexShrink: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 24, padding: 18, borderRadius: theme.radius.xl,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.redSubtle, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: theme.fonts.display, fontSize: 30, color: theme.colors.bone },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, paddingHorizontal: 22,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.redPrimary,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
