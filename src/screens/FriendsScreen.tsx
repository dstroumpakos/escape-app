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
import type { Id } from '../../convex/_generated/dataModel';

type Tab = 'friends' | 'requests' | 'search';

export default function FriendsScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { userId } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [searchTerm, setSearchTerm] = useState('');

  const friends = useQuery(
    api.friends.listFriends,
    userId ? { userId: userId as Id<'users'> } : 'skip',
  );
  const pending = useQuery(
    api.friends.pendingRequests,
    userId ? { userId: userId as Id<'users'> } : 'skip',
  );
  const searchResults = useQuery(
    api.friends.searchUsers,
    userId && searchTerm.trim().length >= 2
      ? { currentUserId: userId as Id<'users'>, searchTerm }
      : 'skip',
  );

  const sendRequest = useMutation(api.friends.sendRequest);
  const acceptRequest = useMutation(api.friends.acceptRequest);
  const declineRequest = useMutation(api.friends.declineRequest);
  const removeFriend = useMutation(api.friends.removeFriend);

  const pendingCount = pending?.length ?? 0;

  if (!userId) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('friends.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['friends', 'requests', 'search'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'friends' ? t('friends.myFriends') :
               tab === 'requests' ? t('friends.requests') :
               t('friends.findFriends')}
            </Text>
            {tab === 'requests' && pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ─── My Friends Tab ─── */}
        {activeTab === 'friends' && (
          <>
            {friends === undefined ? (
              <ActivityIndicator size="large" color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
            ) : friends.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('friends.noFriends')}</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => setActiveTab('search')}>
                  <Ionicons name="search" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>{t('friends.findFriends')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              friends.map((friend: any) => (
                <View key={friend._id} style={styles.card}>
                  {friend.avatar ? (
                    <Image source={{ uri: friend.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {friend.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{friend.name}</Text>
                    <Text style={styles.cardSub}>{friend.title}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => {
                      Alert.alert(
                        t('friends.removeFriend'),
                        t('friends.removeConfirm', { name: friend.name }),
                        [
                          { text: t('cancel'), style: 'cancel' },
                          {
                            text: t('friends.remove'),
                            style: 'destructive',
                            onPress: () => removeFriend({
                              friendshipId: friend.friendshipId,
                              userId: userId as Id<'users'>,
                            }),
                          },
                        ]
                      );
                    }}
                  >
                    <Ionicons name="person-remove-outline" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* ─── Requests Tab ─── */}
        {activeTab === 'requests' && (
          <>
            {pending === undefined ? (
              <ActivityIndicator size="large" color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
            ) : pending.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="mail-open-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('friends.noRequests')}</Text>
              </View>
            ) : (
              pending.map((req: any) => (
                <View key={req.friendshipId} style={styles.card}>
                  {req.avatar ? (
                    <Image source={{ uri: req.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {req.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{req.name}</Text>
                    <Text style={styles.cardSub}>{req.title}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => acceptRequest({
                        friendshipId: req.friendshipId,
                        userId: userId as Id<'users'>,
                      })}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => declineRequest({
                        friendshipId: req.friendshipId,
                        userId: userId as Id<'users'>,
                      })}
                    >
                      <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ─── Find Friends Tab ─── */}
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

            {searchTerm.trim().length < 2 ? (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('friends.searchHint')}</Text>
              </View>
            ) : searchResults === undefined ? (
              <ActivityIndicator size="large" color={theme.colors.redPrimary} style={{ marginTop: 40 }} />
            ) : searchResults.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="person-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>{t('friends.noResults')}</Text>
              </View>
            ) : (
              searchResults.map((user: any) => (
                <View key={user._id} style={styles.card}>
                  {user.avatar ? (
                    <Image source={{ uri: user.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarInitial}>
                        {user.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{user.name}</Text>
                    <Text style={styles.cardSub}>{user.title}</Text>
                  </View>
                  {user.friendshipStatus === 'friends' ? (
                    <View style={styles.friendsBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                      <Text style={styles.friendsBadgeText}>{t('friends.alreadyFriends')}</Text>
                    </View>
                  ) : user.friendshipStatus === 'request_sent' ? (
                    <View style={styles.sentBadge}>
                      <Ionicons name="time-outline" size={16} color="#FFA726" />
                      <Text style={styles.sentBadgeText}>{t('friends.requestSent')}</Text>
                    </View>
                  ) : user.friendshipStatus === 'request_received' ? (
                    <View style={styles.sentBadge}>
                      <Ionicons name="mail-outline" size={16} color="#42A5F5" />
                      <Text style={styles.sentBadgeText}>{t('friends.requestReceived')}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={async () => {
                        try {
                          await sendRequest({
                            requesterId: userId as Id<'users'>,
                            receiverId: user._id,
                          });
                          Alert.alert(t('success'), t('friends.requestSentSuccess'));
                        } catch (e: any) {
                          Alert.alert(t('error'), e.message);
                        }
                      }}
                    >
                      <Ionicons name="person-add" size={16} color="#fff" />
                      <Text style={styles.addBtnText}>{t('friends.addFriend')}</Text>
                    </TouchableOpacity>
                  )}
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
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },

  // Tabs
  tabs: {
    flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12, gap: 6,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  tabActive: {
    backgroundColor: theme.colors.redPrimary,
    borderColor: theme.colors.redPrimary,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FF4444', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  content: { flex: 1, paddingHorizontal: 20 },

  // Cards
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, marginBottom: 10, borderRadius: 16,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: {
    backgroundColor: theme.colors.bgCardSolid,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontWeight: '800', color: theme.colors.redPrimary },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#fff' },
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
    borderRadius: 14, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#fff' },

  // Add button
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: theme.colors.redPrimary,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

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
    borderRadius: 20, backgroundColor: theme.colors.redPrimary,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
