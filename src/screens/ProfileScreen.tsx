import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { rooms as staticRooms } from '../data';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { useUser } from '../UserContext';
import { useTranslation } from '../i18n';
import EditProfileModal from './EditProfileModal';
import type { Id } from '../../convex/_generated/dataModel';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ProfileProps {
  onSwitchToCompany: () => void;
}

export default function ProfileScreen({ onSwitchToCompany }: ProfileProps) {
  const navigation = useNavigation<Nav>();
  const { userId, onLogout } = useUser();
  const { t, language, setLanguage } = useTranslation();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const user = useQuery(
    api.users.getById,
    userId ? { userId: userId as Id<"users"> } : "skip"
  );
  const convexRooms = useQuery(api.rooms.list);
  const rooms = (convexRooms && convexRooms.length > 0
    ? convexRooms.map((r: any) => ({ ...r, id: r._id }))
    : staticRooms
  );
  const wishlist = rooms.filter((r: any) => r.tags?.includes('Featured') || r.tags?.includes('New'));

  if (!userId || user === undefined) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  if (user === null) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', padding: 30 }]}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.redPrimary} />
        <Text style={{ color: '#fff', fontSize: 16, marginTop: 12, textAlign: 'center' }}>
          {t('profile.notFound')}
        </Text>
        <TouchableOpacity
          style={{ marginTop: 20, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.redPrimary, borderRadius: 12 }}
          onPress={onLogout}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('profile.signOut')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = user.name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase();

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <LinearGradient
          colors={[theme.colors.bgSecondary, theme.colors.bgPrimary]}
          style={styles.headerBg}
        >
          <View style={styles.topRow}>
            <Text style={styles.screenTitle}>{t('profile.title')}</Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => Alert.alert(t('profile.settingsTitle'), t('profile.settingsMessage'))}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarRing} onPress={() => setEditModalVisible(true)} activeOpacity={0.7}>
              {user.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={styles.editBadge}>
                <Ionicons name="pencil" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <View style={styles.titleBadge}>
              <Ionicons name="trophy" size={12} color={theme.colors.redPrimary} />
              <Text style={styles.titleText}>{user.title}</Text>
            </View>
            <View style={styles.memberBadge}>
              <Ionicons name="star" size={12} color={theme.colors.redPrimary} />
              <Text style={styles.memberText}>{user.memberSince}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: t('profile.roomsPlayed'), value: user.played, icon: 'game-controller' as const },
            { label: t('profile.roomsEscaped'), value: user.escaped, icon: 'key' as const },
            { label: t('profile.awards'), value: user.awards, icon: 'trophy' as const },
          ].map((stat, i) => (
            <View key={i} style={styles.statCard}>
              <Ionicons name={stat.icon} size={22} color={theme.colors.redPrimary} />
              <Text style={styles.statVal}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Badges */}
        {user.badges && user.badges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.badges')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
              {user.badges.map((badge: any, i: number) => (
                <View key={i} style={[styles.badgeCard, !badge.earned && styles.badgeLocked]}>
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={styles.badgeName}>{badge.title}</Text>
                  {!badge.earned && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={14} color={theme.colors.textMuted} />
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Wishlist */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.wishlist')}</Text>
          {wishlist.map(room => (
            <TouchableOpacity key={room.id} style={styles.wishItem} activeOpacity={0.8} onPress={() => navigation.navigate('RoomDetails', { id: room.id })}>
              <Image source={{ uri: room.image }} style={styles.wishImage} />
              <View style={styles.wishInfo}>
                <Text style={styles.wishTitle} numberOfLines={1}>{room.title}</Text>
                <Text style={styles.wishLoc}>{room.location}</Text>
                <View style={styles.wishRow}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.wishRating}>{room.rating}</Text>
                  <Text style={styles.wishPrice}>{room.pricePerGroup?.length ? t('profile.fromPrice', { amount: Math.min(...room.pricePerGroup.map((g: any) => g.price)) }) : `€${room.price}`}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => Alert.alert(t('profile.wishlist'), t('profile.wishlistRemoved', { title: room.title }))}>
                <Ionicons name="heart" size={22} color={theme.colors.redPrimary} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {/* Menu */}
        <View style={styles.section}>
          {[
            { icon: 'create-outline' as const, label: t('profile.editProfile'), action: () => setEditModalVisible(true) },
            { icon: 'notifications-outline' as const, label: t('profile.notifications'), action: () => Alert.alert(t('profile.notifications'), t('profile.notifMessage')) },
            { icon: 'card-outline' as const, label: t('profile.paymentMethods'), action: () => Alert.alert(t('profile.paymentMethods'), t('profile.paymentMessage')) },
            { icon: 'help-circle-outline' as const, label: t('profile.helpSupport'), action: () => Alert.alert(t('profile.helpSupport'), t('profile.helpMessage')) },
            { icon: 'language-outline' as const, label: t('profile.language'), action: () => setLanguage(language === 'en' ? 'el' : 'en') },
            { icon: 'log-out-outline' as const, label: t('profile.signOut'), action: () => Alert.alert(t('profile.signOutConfirmTitle'), t('profile.signOutConfirmMessage'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('profile.signOut'), style: 'destructive', onPress: () => onLogout() },
            ]) },
          ].map((item, i) => (
            <TouchableOpacity key={i} style={styles.menuItem} onPress={item.action}>
              <View style={styles.menuLeft}>
                <Ionicons name={item.icon} size={20} color={item.label === t('profile.editProfile') ? theme.colors.redPrimary : theme.colors.textSecondary} />
                <Text style={[styles.menuLabel, item.label === t('profile.editProfile') && { color: theme.colors.redPrimary }]}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Switch to Business */}
        <TouchableOpacity
          style={styles.switchBusinessBtn}
          onPress={() => onSwitchToCompany()}
        >
          <Ionicons name="business-outline" size={20} color={theme.colors.redPrimary} />
          <Text style={styles.switchBusinessText}>{t('profile.switchBusiness')}</Text>
        </TouchableOpacity>
      </ScrollView>
      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        userId={userId!}
        currentName={user.name}
        currentAvatar={user.avatar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  headerBg: { paddingTop: 56, paddingBottom: 30 },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 24,
  },
  screenTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
  },

  // Avatar
  avatarSection: { alignItems: 'center' },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 2, borderColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  editBadge: {
    position: 'absolute', bottom: 0, right: -2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.colors.bgSecondary,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: theme.colors.bgCardSolid,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: {
    width: 84, height: 84, borderRadius: 42,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: theme.colors.redPrimary },
  userName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  userEmail: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  titleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: 'rgba(200, 30, 30, 0.15)',
    borderWidth: 1, borderColor: 'rgba(200, 30, 30, 0.3)',
    marginBottom: 8,
  },
  titleText: { fontSize: 12, fontWeight: '700', color: theme.colors.redPrimary },
  memberBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  memberText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, marginTop: -10, marginBottom: 24,
  },
  statCard: {
    flex: 1, alignItems: 'center', gap: 6,
    padding: 16, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  statVal: { fontSize: 22, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 10, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 14 },

  // Sections
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 14 },

  // Badges
  badgeScroll: { marginHorizontal: -20, paddingHorizontal: 20 },
  badgeCard: {
    width: 90, alignItems: 'center', gap: 6,
    padding: 16, marginRight: 10,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  badgeLocked: { opacity: 0.4 },
  badgeIcon: { fontSize: 28 },
  badgeName: { fontSize: 10, fontWeight: '600', color: theme.colors.textSecondary, textAlign: 'center' },
  lockOverlay: {
    position: 'absolute', top: 6, right: 6,
  },

  // Wishlist
  wishItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 12, marginBottom: 10,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  wishImage: { width: 56, height: 56, borderRadius: theme.radius.md },
  wishInfo: { flex: 1, gap: 3 },
  wishTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  wishLoc: { fontSize: 11, color: theme.colors.textMuted },
  wishRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wishRating: { fontSize: 12, fontWeight: '600', color: '#fff' },
  wishPrice: { fontSize: 12, fontWeight: '700', color: theme.colors.redPrimary, marginLeft: 8 },

  // Menu
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuLabel: { fontSize: 15, fontWeight: '500', color: '#fff' },

  switchBusinessBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 40,
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redSubtle,
    borderWidth: 1, borderColor: theme.colors.redPrimary,
  },
  switchBusinessText: { fontSize: 15, fontWeight: '700', color: theme.colors.redPrimary },
});
