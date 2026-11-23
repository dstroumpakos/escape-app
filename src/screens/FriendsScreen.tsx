import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';

type Tab = 'mutual' | 'search';

/**
 * Players: no friend requests. You follow players (one way); players who
 * follow each other are listed here. A message to someone who doesn't follow
 * you arrives in their message requests (Messages).
 */
export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { userId, sessionToken } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('mutual');
  const [searchTerm, setSearchTerm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const mutual = useQuery(api.friends.listFriends, sessionToken ? { sessionToken } : 'skip');
  const searchResults = useQuery(
    api.friends.searchUsers,
    sessionToken && searchTerm.trim().length >= 3 ? { sessionToken, searchTerm: searchTerm.trim() } : 'skip',
  );
  const follow = useMutation(api.social.follow);
  const unfollow = useMutation(api.social.unfollow);

  if (!userId) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  const toggleFollow = async (id: string, following: boolean) => {
    setBusy(id);
    try {
      await (following ? unfollow : follow)({ sessionToken: sessionToken as string, userId: id as any });
    } catch (e: any) {
      Alert.alert(t('error'), e?.message ?? '');
    }
    setBusy(null);
  };

  const avatarOf = (p: any) =>
    p.avatar ? (
      <Image source={{ uri: p.avatar }} style={styles.avatar} />
    ) : (
      <View style={[styles.avatar, styles.avatarPlaceholder]}>
        <Text style={styles.avatarInitial}>{p.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
      </View>
    );

  const openProfile = (id: string) => navigation.navigate('PlayerProfile', { userId: id });
  const messageBtn = (id: string) => (
    <TouchableOpacity
      style={styles.removeBtn}
      onPress={() => navigation.navigate('Messages', { to: id })}
      accessibilityLabel={t('people.message')}
    >
      <Ionicons name="chatbubble-outline" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.bone} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('people.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['mutual', 'search'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'mutual' ? `${t('people.mutual')} (${mutual?.length ?? 0})` : t('people.find')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ─── Following each other ─── */}
        {activeTab === 'mutual' && (
          <>
            {mutual === undefined ? (
              <ActivityIndicator size="large" color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
            ) : mutual.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('people.none_desc')}</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setActiveTab('search')}>
                  <Ionicons name="search" size={16} color={theme.colors.bone} />
                  <Text style={styles.emptyBtnText}>{t('people.find')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              mutual.map((p: any) => (
                <View key={p._id} style={styles.card}>
                  <TouchableOpacity style={styles.cardLink} onPress={() => openProfile(p._id)} activeOpacity={0.7}>
                    {avatarOf(p)}
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>{p.name}</Text>
                      {!!p.title && <Text style={styles.cardSub}>{p.title}</Text>}
                    </View>
                  </TouchableOpacity>
                  {messageBtn(p._id)}
                </View>
              ))
            )}
          </>
        )}

        {/* ─── Find players ─── */}
        {activeTab === 'search' && (
          <>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('friends.searchPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                value={searchTerm}
                onChangeText={setSearchTerm}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm('')}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {searchTerm.trim().length < 3 ? (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('people.search_desc')}</Text>
              </View>
            ) : searchResults === undefined ? (
              <ActivityIndicator size="large" color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
            ) : searchResults.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="person-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('friends.noResults')}</Text>
              </View>
            ) : (
              searchResults.map((u: any) => (
                <View key={u._id} style={styles.card}>
                  <TouchableOpacity style={styles.cardLink} onPress={() => openProfile(u._id)} activeOpacity={0.7}>
                    {avatarOf(u)}
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>{u.name}</Text>
                      <Text style={styles.cardSub}>{u.followsYou ? t('people.follows_you') : u.title}</Text>
                    </View>
                  </TouchableOpacity>
                  {messageBtn(u._id)}
                  <TouchableOpacity
                    style={[styles.addBtn, u.isFollowing && styles.followingBtn]}
                    disabled={busy === u._id}
                    onPress={() => toggleFollow(u._id, !!u.isFollowing)}
                  >
                    {busy === u._id ? (
                      <ActivityIndicator size="small" color={theme.colors.bone} />
                    ) : (
                      <Ionicons name={u.isFollowing ? 'checkmark' : 'person-add'} size={16} color={theme.colors.bone} />
                    )}
                    <Text style={styles.addBtnText}>
                      {u.isFollowing ? t('people.following') : u.followsYou ? t('people.follow_back') : t('people.follow')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: theme.radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontFamily: theme.fonts.display, color: theme.colors.bone },

  // Tabs
  tabs: {
    flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: theme.radius.lg, gap: 6,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  tabActive: {
    backgroundColor: theme.colors.redPrimary,
    borderColor: theme.colors.redPrimary,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.bone },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FF4444', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: theme.colors.bone },

  content: { flex: 1, paddingHorizontal: 20 },

  // Cards
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, marginBottom: 10, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    backgroundColor: theme.colors.bgCardSolid,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontFamily: theme.fonts.display, color: theme.colors.redPrimary },
  cardLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: theme.colors.bone },
  cardSub: { fontSize: 12, color: theme.colors.textMuted },

  // Remove button
  removeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },

  // Request actions
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.redPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  declineBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.bone },

  // Add button
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.redPrimary,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.bone },
  followingBtn: { backgroundColor: theme.colors.glass },

  // Status badges
  friendsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  friendsBadgeText: { fontSize: 11, fontWeight: '600', color: '#4CAF50' },
  sentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sentBadgeText: { fontSize: 11, fontWeight: '600', color: '#FFA726' },

  // Empty state
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: theme.radius.xl, backgroundColor: theme.colors.redPrimary,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.bone },
});
